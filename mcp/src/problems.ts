// Problems a diagram can have, for check (and the counts after edit and render): devices or labels on top of each
// other, CAN IDs missing or used twice on one bus, devices with no power, power channels that feed two devices.
import type { Catalog } from '../../src/catalog/catalog';
import type { Box } from '../../src/geometry/align';
import { boundsOf, tagLayout } from '../../src/geometry/scene';
import { busOf } from '../../src/model/canbus';
import { deviceTag, tagShown } from '../../src/model/tags';
import type { Doc } from '../../src/model/types';

export interface Problem {
  code: 'overlap' | 'label-covers' | 'can-duplicate' | 'can-missing' | 'no-power' | 'channel-shared' | 'unknown-device';
  message: string;
  ids: string[];
}

/** The overlap of two boxes (w, h), or null when they only touch or are apart. */
function overlap(a: Box, b: Box): { w: number; h: number } | null {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0.5 && h > 0.5 ? { w, h } : null;
}

const CHANNEL = /^ch\d+$/;
const times = (n: number) => (n === 2 ? 'twice' : `${n} times`);
const isBusRoot = (type: string | undefined, slug: string) => type === 'controllers' || slug === 'canivore';

export function findProblems(doc: Doc, catalog: Catalog): Problem[] {
  const out: Problem[] = [];
  const known = doc.devices.filter((d) => catalog.bySlug.has(d.slug));
  for (const d of doc.devices) {
    if (!catalog.bySlug.has(d.slug)) out.push({ code: 'unknown-device', message: `${d.id} uses unknown device "${d.slug}"`, ids: [d.id] });
  }

  const bodies = new Map(known.map((d) => [d.id, boundsOf(catalog, d)]));
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      const a = known[i];
      const b = known[j];
      const o = overlap(bodies.get(a.id)!, bodies.get(b.id)!);
      if (o) out.push({ code: 'overlap', message: `${a.id} and ${b.id} overlap (${Math.round(o.w)} × ${Math.round(o.h)} mm)`, ids: [a.id, b.id] });
    }
  }
  for (const d of known) {
    if (!tagShown(doc, d.id)) continue;
    const label = tagLayout(bodies.get(d.id)!, d.tagSide, deviceTag(doc, d.id, catalog)).box;
    for (const other of known) {
      if (other.id !== d.id && overlap(label, bodies.get(other.id)!)) {
        out.push({ code: 'label-covers', message: `the label of ${d.id} covers ${other.id}`, ids: [d.id, other.id] });
      }
    }
  }

  const byBusAndId = new Map<string, string[]>();
  for (const d of known) {
    const icon = catalog.bySlug.get(d.slug)!;
    if (!icon.anchors.some((a) => a.kind === 'can') || isBusRoot(icon.type, icon.slug)) continue;
    if (d.canId === null) {
      out.push({ code: 'can-missing', message: `${d.id} has CAN ports and no CAN ID`, ids: [d.id] });
      continue;
    }
    const key = `${busOf(doc, catalog, d.id) ?? ''}\u0000${d.canId}`;
    byBusAndId.set(key, [...(byBusAndId.get(key) ?? []), d.id]);
  }
  for (const [key, list] of byBusAndId) {
    if (list.length < 2) continue;
    const [bus, canId] = key.split('\u0000');
    const where = bus ? `on bus ${bus}` : 'on devices with no bus found';
    out.push({ code: 'can-duplicate', message: `CAN ID ${canId} is used ${times(list.length)} ${where}: ${list.join(', ')}`, ids: list });
  }

  const powered = new Set(doc.wires.filter((w) => w.layer === 'power').flatMap((w) => [w.from.device, w.to.device]));
  for (const d of known) {
    const icon = catalog.bySlug.get(d.slug)!;
    if (icon.anchors.some((a) => a.kind === 'power') && !powered.has(d.id) && !/battery/.test(icon.slug)) {
      out.push({ code: 'no-power', message: `${d.id} has a power port and no power wire`, ids: [d.id] });
    }
  }

  const feeds = new Map<string, Set<string>>();
  for (const w of doc.wires) {
    if (w.layer !== 'power') continue;
    for (const [end, other] of [[w.from, w.to], [w.to, w.from]] as const) {
      if (!CHANNEL.test(end.port) || other.device === end.device) continue;
      const key = `${end.device}.${end.port}`;
      feeds.set(key, (feeds.get(key) ?? new Set()).add(other.device));
    }
  }
  for (const [port, devices] of feeds) {
    if (devices.size > 1) {
      const list = [...devices];
      const n = list.length === 2 ? 'two' : String(list.length);
      out.push({ code: 'channel-shared', message: `${port} feeds ${n} devices: ${list.join(', ')}`, ids: list });
    }
  }
  return out;
}
