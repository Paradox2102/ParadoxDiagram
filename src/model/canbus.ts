// The CAN bus a device is on: the name the user gave it, or the bus found by following the CAN wires
// back to a robot controller port (SystemCore can_s1 is S1, a roboRIO is RIO) or a CANivore. With two or more
// CANivores, their buses are CANivore 1, CANivore 2, ... in the order the devices were added.
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

/** The bus name of a CANivore: CANivore when it is the only one, else CANivore and its number in device order. */
export function canivoreBus(doc: Doc, deviceId: string): string {
  const all = doc.devices.filter((d) => d.slug === 'canivore');
  return all.length > 1 ? `CANivore ${all.findIndex((d) => d.id === deviceId) + 1}` : 'CANivore';
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
