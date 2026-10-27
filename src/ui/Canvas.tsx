// The diagram: one <svg> in millimetres. Pointer tools: move, select box, pan, draw wire,
// drag a wire segment or bend. Wheel zooms about the pointer.
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from 'react';
import { canConnect, iconFrame, iconLayers, layerOfKind, type Anchor, type AnchorKind, type Catalog, type Layer } from '../catalog/catalog';
import { contentBox } from '../export/svg';
import { dragSegment, withoutEnds } from '../geometry/route';
import { boundsOf, iconOf, KIND_COLOR, renderWirePaths, wireEnds, wirePoints } from '../geometry/scene';
import { portWorld } from '../geometry/transform';
import { apply } from '../model/actions';
import { nextId } from '../model/ids';
import { deviceTag, tagShown } from '../model/tags';
import type { Doc, Point, PortRef } from '../model/types';
import { DeviceView } from './DeviceView';
import type { LayerView } from './Header';
import { useIconBodies } from './iconText';
import { SLUG_MIME } from './Palette';
import type { DocHistory } from './useDocHistory';
import { WireHandles, WireView } from './WireView';

export interface CanvasApi {
  center: () => Point;
  fit: () => void;
}

interface Props {
  doc: Doc;
  catalog: Catalog | null;
  layer: LayerView;
  selection: string[];
  setSelection: (ids: string[]) => void;
  hist: Pick<DocHistory, 'change' | 'begin' | 'preview' | 'end'>;
  apiRef: RefObject<CanvasApi | null>;
}

interface View {
  x: number;
  y: number;
  s: number; // px per mm
}

interface Port {
  ref: PortRef;
  p: Point;
  kind: AnchorKind;
  layer: Layer;
  label: string;
  anchor: Anchor;
}

type Mode =
  | { kind: 'none' }
  | { kind: 'pan'; cx: number; cy: number; view: View }
  | { kind: 'move'; base: Doc; ids: string[]; start: Point; moved: boolean; clickId: string; shift: boolean }
  | { kind: 'box'; start: Point; cur: Point; shift: boolean }
  | { kind: 'wire'; from: Port; cur: Point; target: Port | null }
  | { kind: 'segment'; base: Doc; wireId: string; index: number; path: Point[]; ends: Point[]; start: Point; magnets: Point[] }
  | { kind: 'bend'; base: Doc; wireId: string; index: number; orig: Point; start: Point; magnets: Point[] };

const BASE_PX_PER_MM = 3;
const MIN_S = BASE_PX_PER_MM * 0.2;
const MAX_S = BASE_PX_PER_MM * 8;
const HOVER_PAD_MM = 4;
const PORT_R = 1.4;
const SNAP_MM = 1;
const MAGNET_MM = 2;

const samePort = (a: PortRef, b: PortRef) => a.device === b.device && a.port === b.port;

/** Round to 1 mm, or jump to a port coordinate within 2 mm so a run can line up with the port. */
function magnet(v: number, axis: 'x' | 'y', magnets: Point[]): number {
  for (const m of magnets) if (Math.abs(m[axis] - v) < MAGNET_MM) return m[axis];
  return Math.round(v / SNAP_MM) * SNAP_MM;
}

export function Canvas({ doc, catalog, layer, selection, setSelection, hist, apiRef }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600, measured: false });
  const [view, setView] = useState<View>({ x: -40, y: -40, s: BASE_PX_PER_MM });
  const [mode, setModeState] = useState<Mode>({ kind: 'none' });
  const modeRef = useRef(mode);
  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  };
  const [hover, setHover] = useState<string | null>(null);
  const [space, setSpace] = useState(false);
  const lastDown = useRef<{ key: string; t: number }>({ key: '', t: 0 });
  const fitted = useRef(false);

  const bodies = useIconBodies(catalog, doc.devices.map((d) => d.slug));
  const selected = useMemo(() => new Set(selection), [selection]);

  const ports = useMemo(() => {
    const out: Port[] = [];
    for (const d of doc.devices) {
      const icon = iconOf(catalog, d);
      if (!icon) continue;
      for (const a of icon.anchors) {
        out.push({ ref: { device: d.id, port: a.port }, p: portWorld(d, icon, a).p, kind: a.kind, layer: layerOfKind(a.kind), label: a.label, anchor: a });
      }
    }
    return out;
  }, [doc.devices, catalog]);

  // Size of the drawing area: measured at once, then on every resize. The observer watches the
  // HTML wrapper, because Chrome does not always report size changes of an outer <svg>.
  useEffect(() => {
    const el = wrapRef.current!;
    const measure = () => {
      if (el.clientWidth && el.clientHeight) setSize({ w: el.clientWidth, h: el.clientHeight, measured: true });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const r = svgRef.current!.getBoundingClientRect();
      return { x: view.x + (clientX - r.left) / view.s, y: view.y + (clientY - r.top) / view.s };
    },
    [view],
  );

  const fit = useCallback(() => {
    if (!doc.devices.length) {
      setView({ x: -40, y: -40, s: BASE_PX_PER_MM });
      return;
    }
    const box = contentBox(doc, catalog);
    const pad = 20;
    const s = Math.min(MAX_S, Math.max(MIN_S, Math.min(size.w / (box.w + 2 * pad), size.h / (box.h + 2 * pad))));
    setView({ x: box.x - (size.w / s - box.w) / 2, y: box.y - (size.h / s - box.h) / 2, s });
  }, [doc, catalog, size]);

  useImperativeHandle(apiRef, () => ({
    center: () => ({ x: view.x + size.w / view.s / 2, y: view.y + size.h / view.s / 2 }),
    fit,
  }));

  // Fit a loaded layout once, when the icons and the drawing size are known.
  useEffect(() => {
    if (fitted.current || !catalog || !size.measured) return;
    fitted.current = true;
    if (doc.devices.length) fit();
  }, [catalog, size, doc.devices.length, fit]);

  // Wheel zoom about the pointer (a native listener, because React's wheel listener is passive).
  useEffect(() => {
    const el = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => {
        const r = el.getBoundingClientRect();
        const wx = v.x + (e.clientX - r.left) / v.s;
        const wy = v.y + (e.clientY - r.top) / v.s;
        const s = Math.min(MAX_S, Math.max(MIN_S, v.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
        return { x: wx - (e.clientX - r.left) / s, y: wy - (e.clientY - r.top) / s, s };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Space to pan, Escape to cancel a wire or clear the selection.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement).closest?.('input, textarea, [contenteditable]');
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpace(true);
      }
      if (e.key === 'Escape') {
        if (modeRef.current.kind === 'wire') setMode({ kind: 'none' });
        else setSelection([]);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [setSelection]);

  const deviceAt = (w: Point): string | null => {
    for (let i = doc.devices.length - 1; i >= 0; i--) {
      const d = doc.devices[i];
      const b = boundsOf(catalog, d);
      if (w.x >= b.x - HOVER_PAD_MM && w.x <= b.x + b.w + HOVER_PAD_MM && w.y >= b.y - HOVER_PAD_MM && w.y <= b.y + b.h + HOVER_PAD_MM) {
        return d.id;
      }
    }
    return null;
  };

  const wireMagnets = (wireId: string): Point[] => {
    const w = doc.wires.find((x) => x.id === wireId);
    if (!w) return [];
    return ports.filter((p) => samePort(p.ref, w.from) || samePort(p.ref, w.to)).map((p) => p.p);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Finish an edit in the side panel first, so it lands before this gesture starts.
    (document.activeElement as HTMLElement | null)?.blur?.();
    try {
      svgRef.current!.setPointerCapture(e.pointerId);
    } catch {
      // the pointer is already gone (released, or not a live pointer): no capture needed
    }
    const w = toWorld(e.clientX, e.clientY);
    // Right-drag (or middle-drag, or Space + drag) pans.
    if (e.button === 2 || e.button === 1 || (e.button === 0 && space)) {
      setMode({ kind: 'pan', cx: e.clientX, cy: e.clientY, view });
      return;
    }
    if (e.button !== 0) return;
    const el = (e.target as Element).closest('[data-rotate],[data-port],[data-bend],[data-seg],[data-wire],[data-device]') as
      | (SVGElement & { dataset: DOMStringMap })
      | null;
    const ds = el?.dataset ?? {};

    // Double-click on a segment adds a bend; on a bend removes it. (Pointer capture hides dblclick.)
    const key = ds.seg ? `seg:${ds.seg}` : ds.bend ? `bend:${ds.bend}` : '';
    const now = performance.now();
    const double = key && lastDown.current.key === key && now - lastDown.current.t < 350;
    lastDown.current = { key, t: double ? 0 : now };

    if (ds.rotate) {
      hist.change({ type: 'rotateDevices', ids: [ds.rotate] });
      return;
    }
    if (ds.port) {
      const [device, port] = ds.port.split('|');
      const from = ports.find((p) => p.ref.device === device && p.ref.port === port);
      if (from) setMode({ kind: 'wire', from, cur: from.p, target: null });
      return;
    }
    if (ds.bend) {
      const [wireId, idx] = ds.bend.split(':');
      const wire = doc.wires.find((x) => x.id === wireId)!;
      const index = Number(idx);
      if (double) {
        hist.change({ type: 'setBends', id: wireId, bends: wire.bends.filter((_, i) => i !== index) });
        return;
      }
      setMode({ kind: 'bend', base: hist.begin(), wireId, index, orig: wire.bends[index], start: w, magnets: wireMagnets(wireId) });
      return;
    }
    if (ds.seg) {
      const [wireId, idx] = ds.seg.split(':');
      const wire = doc.wires.find((x) => x.id === wireId)!;
      const path = wirePoints(doc, catalog, wire)!;
      const index = Number(idx);
      if (double) {
        const a = path[index];
        const b = path[index + 1];
        const at = a.y === b.y ? { x: Math.round(w.x), y: a.y } : { x: a.x, y: Math.round(w.y) };
        const corners = path.slice(1, -1);
        corners.splice(index, 0, at);
        hist.change({ type: 'setBends', id: wireId, bends: withoutEnds(corners, wireEnds(doc, catalog, wire)) });
        return;
      }
      setMode({
        kind: 'segment', base: hist.begin(), wireId, index, path, ends: wireEnds(doc, catalog, wire), start: w, magnets: wireMagnets(wireId),
      });
      return;
    }
    if (ds.wire) {
      setSelection(e.shiftKey ? [...selection, ds.wire] : [ds.wire]);
      return;
    }
    if (ds.device) {
      const id = ds.device;
      const sel = selected.has(id) ? selection : e.shiftKey ? [...selection, id] : [id];
      setSelection(sel);
      const ids = sel.filter((s) => doc.devices.some((d) => d.id === s));
      setMode({ kind: 'move', base: hist.begin(), ids, start: w, moved: false, clickId: id, shift: e.shiftKey });
      return;
    }
    if (!e.shiftKey) setSelection([]);
    setMode({ kind: 'box', start: w, cur: w, shift: e.shiftKey });
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const m = modeRef.current;
    const w = toWorld(e.clientX, e.clientY);
    switch (m.kind) {
      case 'none': {
        const h = deviceAt(w);
        if (h !== hover) setHover(h);
        return;
      }
      case 'pan':
        setView({ ...m.view, x: m.view.x - (e.clientX - m.cx) / m.view.s, y: m.view.y - (e.clientY - m.cy) / m.view.s });
        return;
      case 'move': {
        const dx = w.x - m.start.x;
        const dy = w.y - m.start.y;
        if (!m.moved && Math.abs(dx) + Math.abs(dy) < 1) return;
        modeRef.current = { ...m, moved: true };
        hist.preview(apply(m.base, { type: 'moveDevices', ids: m.ids, dx, dy }));
        return;
      }
      case 'box':
        setMode({ ...m, cur: w });
        return;
      case 'wire': {
        const reach = 12 / view.s;
        let target: Port | null = null;
        let best = reach;
        for (const p of ports) {
          if (!canConnect(p.anchor, m.from.anchor) || samePort(p.ref, m.from.ref)) continue;
          const dist = Math.hypot(p.p.x - w.x, p.p.y - w.y);
          if (dist < best) {
            best = dist;
            target = p;
          }
        }
        setMode({ ...m, cur: w, target });
        return;
      }
      case 'segment': {
        const a = m.path[m.index];
        const horizontal = a.y === m.path[m.index + 1].y;
        const axis = horizontal ? 'y' : 'x';
        const c0 = a[axis];
        const c1 = magnet(c0 + (w[axis] - m.start[axis]), axis, m.magnets);
        const bends = dragSegment(m.path, m.index, c1 - c0, m.ends);
        hist.preview(apply(m.base, { type: 'setBends', id: m.wireId, bends }));
        return;
      }
      case 'bend': {
        const wire = m.base.wires.find((x) => x.id === m.wireId)!;
        const p = {
          x: magnet(m.orig.x + w.x - m.start.x, 'x', m.magnets),
          y: magnet(m.orig.y + w.y - m.start.y, 'y', m.magnets),
        };
        const bends = wire.bends.map((b, i) => (i === m.index ? p : b));
        hist.preview(apply(m.base, { type: 'setBends', id: m.wireId, bends }));
        return;
      }
    }
  };

  const onPointerUp = () => {
    const m = modeRef.current;
    switch (m.kind) {
      case 'move':
        hist.end(m.base);
        if (!m.moved && !m.shift) setSelection([m.clickId]);
        break;
      case 'segment':
      case 'bend':
        hist.end(m.base);
        break;
      case 'wire':
        if (m.target) {
          const id = nextId('w', doc.wires);
          hist.change({ type: 'addWire', layer: m.from.layer, from: m.from.ref, to: m.target.ref });
          setSelection([id]);
        }
        break;
      case 'box': {
        const x0 = Math.min(m.start.x, m.cur.x);
        const x1 = Math.max(m.start.x, m.cur.x);
        const y0 = Math.min(m.start.y, m.cur.y);
        const y1 = Math.max(m.start.y, m.cur.y);
        if (x1 - x0 < 1 && y1 - y0 < 1) break;
        const inside = (p: Point) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
        const ids = [
          ...doc.devices.filter((d) => {
            const b = boundsOf(catalog, d);
            return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0;
          }).map((d) => d.id),
          ...doc.wires.filter((w) => wirePoints(doc, catalog, w)?.every(inside)).map((w) => w.id),
        ];
        setSelection(m.shift ? [...new Set([...selection, ...ids])] : ids);
        break;
      }
    }
    setMode({ kind: 'none' });
  };

  const onDrop = (e: React.DragEvent<SVGSVGElement>) => {
    const slug = e.dataTransfer.getData(SLUG_MIME);
    const icon = catalog?.bySlug.get(slug);
    if (!icon) return;
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    const [, , fw, fh] = iconFrame(icon);
    const id = nextId('d', doc.devices);
    hist.change({ type: 'addDevice', slug, name: '', x: w.x - fw / 2, y: w.y - fh / 2 });
    setSelection([id]);
  };

  // What to draw.
  const visibleLayer = (l: Layer) => layer === 'all' || layer === l;
  const wiring = mode.kind === 'wire' ? mode : null;
  const shownPorts = wiring
    ? ports.filter((p) => canConnect(p.anchor, wiring.from.anchor) && !samePort(p.ref, wiring.from.ref))
    : ports.filter((p) => (p.ref.device === hover || selected.has(p.ref.device)) && visibleLayer(p.layer));
  const selDevice = selection.length === 1 && mode.kind === 'none' ? doc.devices.find((d) => d.id === selection[0]) : undefined;
  const rotateAt = selDevice ? boundsOf(catalog, selDevice) : null;
  const handleR = 10 / view.s; // 10 px on screen at any zoom
  const selWire = selection.length === 1 ? doc.wires.find((w) => w.id === selection[0]) : undefined;
  const selWirePts = selWire && visibleLayer(selWire.layer) ? wirePoints(doc, catalog, selWire) : null;
  const vb = `${view.x} ${view.y} ${size.w / view.s} ${size.h / view.s}`;
  const grid = view.s >= 1.5;

  return (
    <main className="canvas-wrap" ref={wrapRef}>
      <svg
        ref={svgRef} className={mode.kind === 'pan' ? 'canvas panning' : 'canvas'} viewBox={vb}
        style={{ cursor: space ? 'grab' : undefined }} aria-label="Diagram" role="application"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        onPointerLeave={() => modeRef.current.kind === 'none' && setHover(null)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(SLUG_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={onDrop}
      >
        <defs>
          <pattern id="grid-minor" width={5} height={5} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={0.22} fill="#c4ccd6" />
          </pattern>
          <pattern id="grid-major" width={25} height={25} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={0.45} fill="#a8b2c0" />
          </pattern>
        </defs>
        <rect x={view.x} y={view.y} width={size.w / view.s} height={size.h / view.s} fill="#ffffff" />
        {grid && <rect x={view.x} y={view.y} width={size.w / view.s} height={size.h / view.s} fill="url(#grid-minor)" pointerEvents="none" />}
        <rect x={view.x} y={view.y} width={size.w / view.s} height={size.h / view.s} fill="url(#grid-major)" pointerEvents="none" />

        {doc.devices.map((d) => {
          const icon = iconOf(catalog, d);
          return (
            <DeviceView
              key={d.id} device={d} icon={icon} body={bodies.get(d.slug)} tag={tagShown(doc, d.id) ? deviceTag(doc, d.id, catalog) : null}
              dim={layer !== 'all' && !(icon && iconLayers(icon).has(layer))} selected={selected.has(d.id)}
            />
          );
        })}

        {doc.wires.filter((w) => visibleLayer(w.layer)).map((w) => (
          <WireView key={w.id} wire={w} paths={renderWirePaths(doc, catalog, w)} points={wirePoints(doc, catalog, w)} selected={selected.has(w.id)} />
        ))}
        {selWire && selWirePts && <WireHandles wire={selWire} points={selWirePts} />}

        {shownPorts.map((p) => {
          const target = wiring?.target && samePort(wiring.target.ref, p.ref);
          return (
            <circle
              key={`${p.ref.device}|${p.ref.port}`} className="port" data-port={`${p.ref.device}|${p.ref.port}`}
              cx={p.p.x} cy={p.p.y} r={target ? PORT_R * 1.8 : wiring ? PORT_R * 1.2 : PORT_R}
              fill={KIND_COLOR[p.kind]} stroke="#ffffff" strokeWidth={0.5}
            >
              <title>{p.label}</title>
            </circle>
          );
        })}

        {selDevice && rotateAt && (
          <g
            data-rotate={selDevice.id} style={{ cursor: 'pointer' }}
            transform={`translate(${rotateAt.x + rotateAt.w + 2 + handleR} ${rotateAt.y - 2 - handleR}) scale(${handleR / 10})`}
          >
            <title>Rotate 90° (R)</title>
            <circle r={10} fill="#ffffff" stroke="#0969da" strokeWidth={1.5} />
            <path d="M -4.5 -3 A 5.5 5.5 0 1 1 -5 2.5" fill="none" stroke="#0969da" strokeWidth={1.8} strokeLinecap="round" />
            <path d="M -7.5 -5.5 L -4.5 -3 L -1.5 -6" fill="none" stroke="#0969da" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
        {wiring && (
          <line
            x1={wiring.from.p.x} y1={wiring.from.p.y} x2={(wiring.target?.p ?? wiring.cur).x} y2={(wiring.target?.p ?? wiring.cur).y}
            stroke={KIND_COLOR[wiring.from.kind]} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none"
          />
        )}
        {mode.kind === 'box' && (
          <rect
            x={Math.min(mode.start.x, mode.cur.x)} y={Math.min(mode.start.y, mode.cur.y)}
            width={Math.abs(mode.cur.x - mode.start.x)} height={Math.abs(mode.cur.y - mode.start.y)}
            fill="rgb(9 105 218 / 0.08)" stroke="#0969da" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none"
          />
        )}
      </svg>
      {!doc.devices.length && (
        <div className="canvas-empty">
          <strong>Start with a device</strong>
          <span>Drag one from the list on the left, or click it.</span>
        </div>
      )}
      <div className="zoom" aria-label="Zoom">
        <button type="button" onClick={() => setView((v) => ({ ...v, s: Math.max(MIN_S, v.s / 1.25) }))} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setView((v) => ({ ...v, s: BASE_PX_PER_MM }))} title="Zoom to 100 %">
          {Math.round((view.s / BASE_PX_PER_MM) * 100)}%
        </button>
        <button type="button" onClick={() => setView((v) => ({ ...v, s: Math.min(MAX_S, v.s * 1.25) }))} aria-label="Zoom in">+</button>
        <button type="button" onClick={fit}>Fit</button>
      </div>
    </main>
  );
}
