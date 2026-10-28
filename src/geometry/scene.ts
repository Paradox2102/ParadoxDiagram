// Shared drawing facts for the canvas and the exports: wire points, colors, device boxes, tags.
import { findAnchor, portPolarity, type AnchorKind, type Catalog, type Icon } from '../catalog/catalog';
import type { Device, Doc, Point, PortRef, Wire } from '../model/types';
import { autoRoute, exitPoint, type Box } from './autoroute';
import { nudgeRoutes } from './nudge';
import { offsetPolyline } from './offset';
import { routeWire, stripPortRuns, stub } from './route';
import { deviceBounds, portWorld, type Dir } from './transform';

export const COLORS = {
  pos: '#cf222e',
  neg: '#0d1117',
  canH: '#e3b341',
  canL: '#2da44e',
  ethernet: '#0969da',
  usb: '#8250df',
  signal: '#57606a',
  air: '#1b7c83',
  ink: '#1f2328',
  muted: '#57606a',
  missing: '#eaeef2',
} as const;

export const KIND_COLOR: Record<AnchorKind, string> = {
  power: COLORS.pos, can: COLORS.canH, ethernet: COLORS.ethernet, usb: COLORS.usb, signal: COLORS.signal, air: COLORS.air,
};

export const PAIR_OFFSET_MM = 0.7;
export const TAG_NAME_DY = 5;
export const TAG_FACTS_DY = 9.5;
export const TAG_H = 12;
export const OFF_LAYER_OPACITY = 0.15;
export const MISSING_W = 40;
export const MISSING_H = 30;

export function iconOf(catalog: Catalog | null, d: Device): Icon | undefined {
  return catalog?.bySlug.get(d.slug);
}

export function boundsOf(catalog: Catalog | null, d: Device) {
  const icon = iconOf(catalog, d);
  return icon ? deviceBounds(d, icon) : { x: d.x, y: d.y, w: MISSING_W, h: MISSING_H };
}

export function portPoint(
  doc: Doc, catalog: Catalog | null, ref: PortRef,
): { p: Point; dir: Dir; kind: AnchorKind; polarity: '+' | '-' | null } | null {
  const dev = doc.devices.find((d) => d.id === ref.device);
  const icon = dev && iconOf(catalog, dev);
  const a = icon && findAnchor(icon, ref.port);
  if (!dev || !icon || !a) return null;
  return { ...portWorld(dev, icon, a), kind: a.kind, polarity: portPolarity(a) };
}

/** A device and its label (when shown): the space a wire with no bends routes around. */
export function keepOutBox(catalog: Catalog | null, d: Device, hideTags = false): Box {
  const b = boundsOf(catalog, d);
  return { x: b.x, y: b.y, w: b.w, h: b.h + (hideTags || d.hideTag ? 0 : TAG_H) };
}

// Documents never change in place, so routes are cached per document object.
interface RouteCache {
  catalog: Catalog | null;
  boxes: Map<string, Box>;
  routes: Map<string, Point[] | null> | null;
}
const routeCache = new WeakMap<Doc, RouteCache>();

function cacheFor(doc: Doc, catalog: Catalog | null): RouteCache {
  let c = routeCache.get(doc);
  if (!c || c.catalog !== catalog) {
    c = { catalog, boxes: new Map(doc.devices.map((d) => [d.id, keepOutBox(catalog, d, doc.hideTags)])), routes: null };
    routeCache.set(doc, c);
  }
  return c;
}

function routeOne(doc: Doc, catalog: Catalog | null, c: RouteCache, w: Wire): Point[] | null {
  const a = portPoint(doc, catalog, w.from);
  const b = portPoint(doc, catalog, w.to);
  if (!a || !b) return null;
  const boxA = c.boxes.get(w.from.device) ?? null;
  const boxB = c.boxes.get(w.to.device) ?? null;
  let pts: Point[] | null = null;
  if (!w.bends.length) pts = autoRoute(a.p, a.dir, b.p, b.dir, [...c.boxes.values()], boxA, boxB);
  return pts ?? routeWire(a.p, a.dir, b.p, b.dir, w.bends, exitPoint(a.p, a.dir, boxA), exitPoint(b.p, b.dir, boxB));
}

/**
 * The wire's route, or null when an end cannot be placed (unknown icon). A wire with no bends
 * goes around every device; a wire with bends follows them. Runs that two wires share are then
 * split into lanes, so all wires of a document are routed together.
 */
export function wirePoints(doc: Doc, catalog: Catalog | null, w: Wire): Point[] | null {
  const c = cacheFor(doc, catalog);
  if (!c.routes) {
    const raw = doc.wires.map((x) => routeOne(doc, catalog, c, x));
    const lanes = nudgeRoutes(raw);
    c.routes = new Map(doc.wires.map((x, i) => [x.id, lanes[i]]));
  }
  return c.routes.get(w.id) ?? null;
}

/** The corners of a dragged route that are worth saving as the wire's bends. */
export function savedBends(doc: Doc, catalog: Catalog | null, w: Wire, corners: Point[]): Point[] {
  const a = portPoint(doc, catalog, w.from);
  const b = portPoint(doc, catalog, w.to);
  return a && b ? stripPortRuns(corners, a.p, a.dir, b.p, b.dir) : corners;
}

/** Where each end's run out of its port stops, plus the plain 6 mm stubs: never saved as bends. */
export function wireEnds(doc: Doc, catalog: Catalog | null, w: Wire): Point[] {
  const c = cacheFor(doc, catalog);
  const out: Point[] = [];
  for (const ref of [w.from, w.to]) {
    const p = portPoint(doc, catalog, ref);
    if (p) out.push(exitPoint(p.p, p.dir, c.boxes.get(ref.device) ?? null), stub(p.p, p.dir));
  }
  return out;
}

export interface WirePath {
  d: string;
  stroke: string;
  width: number;
  dash?: string;
}

const f = (v: number) => String(Math.round(v * 100) / 100 + 0);
export const pathD = (pts: Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ');

/**
 * The lines that draw a wire: a pair for power and CAN, one line for network and air. A power
 * wire between two one-polarity terminals (battery, breaker, distribution input) is one
 * conductor: red for +, black for -.
 */
export function renderWirePaths(doc: Doc, catalog: Catalog | null, w: Wire): WirePath[] {
  const pts = wirePoints(doc, catalog, w);
  if (!pts) return [];
  if (w.layer === 'power') {
    const a = portPoint(doc, catalog, w.from)?.polarity;
    const b = portPoint(doc, catalog, w.to)?.polarity;
    if (a && b) return [{ d: pathD(pts), stroke: a === '+' ? COLORS.pos : COLORS.neg, width: 1.2 }];
  }
  if (w.layer === 'power' || w.layer === 'can') {
    const [left, right] = w.layer === 'power' ? [COLORS.pos, COLORS.neg] : [COLORS.canH, COLORS.canL];
    return [
      { d: pathD(offsetPolyline(pts, PAIR_OFFSET_MM)), stroke: left, width: 0.8 },
      { d: pathD(offsetPolyline(pts, -PAIR_OFFSET_MM)), stroke: right, width: 0.8 },
    ];
  }
  if (w.layer === 'air') return [{ d: pathD(pts), stroke: COLORS.air, width: 1.2, dash: '3 1.5' }];
  const kind = portPoint(doc, catalog, w.from)?.kind ?? 'ethernet';
  return [{ d: pathD(pts), stroke: KIND_COLOR[kind], width: 1 }];
}
