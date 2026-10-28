// Checks a document read from a file or from browser storage.
import { findAnchor, layerOfKind, LAYERS, type Catalog, type Layer } from '../catalog/catalog';
import { SIDES, TAG_SIDES, type Device, type Doc, type Point, type PortRef, type Rot, type Side, type TagSide, type Wire } from './types';

const str = (v: unknown, dflt = '') => (typeof v === 'string' ? v : dflt);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function validateDoc(raw: unknown, catalog: Catalog | null): { doc: Doc; droppedWires: number } {
  const r = raw as Record<string, unknown>;
  if (!r || typeof r !== 'object' || r.format !== 'paradox-diagram') throw new Error('format is not paradox-diagram');
  if (r.version !== 1) throw new Error(`version ${String(r.version)} is not supported`);
  if (!Array.isArray(r.devices)) throw new Error('devices is not a list');
  if (!Array.isArray(r.wires)) throw new Error('wires is not a list');

  const devices: Device[] = [];
  const seen = new Set<string>();
  for (const d of r.devices as Record<string, unknown>[]) {
    const id = str(d?.id);
    if (!id || seen.has(id) || !str(d.slug)) throw new Error(`device ${id || '?'} has no unique id or no slug`);
    seen.add(id);
    const rot = [0, 90, 180, 270].includes(d.rot as number) ? (d.rot as Rot) : 0;
    const canId = typeof d.canId === 'number' && Number.isInteger(d.canId) ? d.canId : null;
    const device: Device = { id, slug: str(d.slug), x: num(d.x), y: num(d.y), rot, name: str(d.name), canId, notes: str(d.notes) };
    if (d.hideTag === true) device.hideTag = true;
    if (TAG_SIDES.includes(d.tagSide as TagSide) && d.tagSide !== 'bottom') device.tagSide = d.tagSide as TagSide;
    devices.push(device);
  }

  const byId = new Map(devices.map((d) => [d.id, d]));
  const kindOf = (ref: PortRef): Layer | null | undefined => {
    const dev = byId.get(ref?.device);
    if (!dev) return undefined;
    const icon = catalog?.bySlug.get(dev.slug);
    if (!catalog) return null; // no catalog: cannot check ports
    if (!icon) return null; // unknown icon: keep the wire as drawn
    const a = findAnchor(icon, ref.port);
    return a ? layerOfKind(a.kind) : undefined;
  };

  const wires: Wire[] = [];
  const wireIds = new Set<string>();
  let droppedWires = 0;
  for (const w of r.wires as Record<string, unknown>[]) {
    const id = str(w?.id);
    const layer = w?.layer as Layer;
    const from = w?.from as PortRef;
    const to = w?.to as PortRef;
    const a = kindOf(from);
    const b = kindOf(to);
    const ok =
      id && !wireIds.has(id) && LAYERS.includes(layer) &&
      a !== undefined && b !== undefined && (a === null || a === layer) && (b === null || b === layer);
    if (!ok) {
      droppedWires++;
      continue;
    }
    wireIds.add(id);
    const bends = Array.isArray(w.bends)
      ? (w.bends as Point[]).map((p) => ({ x: num(p?.x), y: num(p?.y) }))
      : [];
    const wire: Wire = {
      id, layer, from: { device: from.device, port: str(from.port) }, to: { device: to.device, port: str(to.port) },
      bends, note: str(w.note),
    };
    if (SIDES.includes(w.fromSide as Side)) wire.fromSide = w.fromSide as Side;
    if (SIDES.includes(w.toSide as Side)) wire.toSide = w.toSide as Side;
    wires.push(wire);
  }

  const doc: Doc = { format: 'paradox-diagram', version: 1, title: str(r.title, 'Untitled diagram'), devices, wires };
  if (r.hideTags === true) doc.hideTags = true;
  return { doc, droppedWires };
}
