// The CAN bus a device is on: the name the user gave it, or the bus found by following the CAN wires
// back to a robot controller port (SystemCore can_s1 is S1, a roboRIO is RIO) or a CANivore. With two or more
// CANivores, their buses are CANivore 1, CANivore 2, ... in id order (d3 before d12: the order they were added). The
// id, not the place in the device list, keeps a number stable when an undo puts a deleted CANivore back at the end.
import type { Catalog, Icon } from '../catalog/catalog';
import type { Doc } from './types';

/** A CAN port that starts a bus: any CAN port of a robot controller, or a CANivore's. */
function isRoot(icon: Icon | undefined, port: string): boolean {
  if (!icon || (icon.type !== 'controllers' && icon.slug !== 'canivore')) return false;
  return icon.anchors.some((a) => a.port === port && a.kind === 'can');
}

function isRootDevice(icon: Icon | undefined): boolean {
  return !!icon && (icon.type === 'controllers' || icon.slug === 'canivore');
}

/** The bus name of a CANivore: CANivore when it is the only one, else CANivore and its number in id order. */
export function canivoreBus(doc: Doc, deviceId: string): string {
  const ids = doc.devices.filter((d) => d.slug === 'canivore').map((d) => d.id);
  if (ids.length < 2) return 'CANivore';
  ids.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return `CANivore ${ids.indexOf(deviceId) + 1}`;
}

function rootName(doc: Doc, icon: Icon, deviceId: string, port: string): string {
  const s = /^can_s(\d+)$/.exec(port);
  if (s) return `S${s[1]}`;
  if (icon.slug.startsWith('roborio')) return 'RIO';
  if (icon.slug === 'canivore') return canivoreBus(doc, deviceId);
  return port.toUpperCase();
}

/** The bus found from the CAN chain: the nearest bus root along the CAN wires, or null. */
export function foundBus(doc: Doc, catalog: Catalog | null, deviceId: string): string | null {
  const iconOf = (id: string) => {
    const d = doc.devices.find((x) => x.id === id);
    return d ? catalog?.bySlug.get(d.slug) : undefined;
  };
  if (isRootDevice(iconOf(deviceId))) return null;
  const seen = new Set([deviceId]);
  let level = [deviceId];
  while (level.length) {
    const next: string[] = [];
    for (const id of level) {
      for (const w of doc.wires) {
        if (w.layer !== 'can') continue;
        const other = w.from.device === id ? w.to : w.to.device === id ? w.from : null;
        if (!other || seen.has(other.device)) continue;
        const icon = iconOf(other.device);
        if (icon && isRoot(icon, other.port)) return rootName(doc, icon, other.device, other.port);
        seen.add(other.device);
        if (!isRootDevice(icon)) next.push(other.device);
      }
    }
    level = next;
  }
  return null;
}

/**
 * The far ends of each bus that starts at a bus root port: the devices on that chain with only one CAN wire. The root
 * is the other end (SystemCore, a roboRIO and a CANivore have a 120 Ω terminator built in).
 */
export function busEnds(doc: Doc, catalog: Catalog): { bus: string; device: string }[] {
  const iconOf = (id: string) => {
    const d = doc.devices.find((x) => x.id === id);
    return d ? catalog.bySlug.get(d.slug) : undefined;
  };
  const can = doc.wires.filter((w) => w.layer === 'can');
  const degree = new Map<string, number>();
  for (const w of can) for (const id of [w.from.device, w.to.device]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const out: { bus: string; device: string }[] = [];
  for (const root of doc.devices) {
    const icon = iconOf(root.id);
    if (!icon || !isRootDevice(icon)) continue;
    for (const a of icon.anchors) {
      if (a.kind !== 'can') continue;
      const seen = new Set<string>();
      let level = can
        .map((w) => (w.from.device === root.id && w.from.port === a.port ? w.to.device : w.to.device === root.id && w.to.port === a.port ? w.from.device : null))
        .filter((id): id is string => id !== null && !isRootDevice(iconOf(id)));
      level.forEach((id) => seen.add(id));
      while (level.length) {
        const next: string[] = [];
        for (const id of level) {
          for (const w of can) {
            const other = w.from.device === id ? w.to.device : w.to.device === id ? w.from.device : null;
            if (!other || seen.has(other) || isRootDevice(iconOf(other))) continue;
            seen.add(other);
            next.push(other);
          }
        }
        level = next;
      }
      const bus = rootName(doc, icon, root.id, a.port);
      for (const id of seen) if (degree.get(id) === 1) out.push({ bus, device: id });
    }
  }
  return out;
}

/** The bus the user named, else the one found from the chain. */
export function busOf(doc: Doc, catalog: Catalog | null, deviceId: string): string | null {
  const typed = doc.devices.find((d) => d.id === deviceId)?.canBus?.trim();
  return typed || foundBus(doc, catalog, deviceId);
}

// Documents never change in place, so the buses are found once per document (each label needs them).
const busCache = new WeakMap<Doc, { catalog: Catalog | null; buses: Set<string> }>();

/** Every bus a device of the diagram is on. */
export function busesInUse(doc: Doc, catalog: Catalog | null): Set<string> {
  const hit = busCache.get(doc);
  if (hit && hit.catalog === catalog) return hit.buses;
  const buses = new Set<string>();
  for (const d of doc.devices) {
    const bus = busOf(doc, catalog, d.id);
    if (bus) buses.add(bus);
  }
  busCache.set(doc, { catalog, buses });
  return buses;
}
