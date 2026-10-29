// Copy and paste of devices: a copy holds the selected devices and the wires between them. A paste gives them new
// ids, moves them by an offset, and gives each copy with a CAN ID the smallest free ID above its original.
import { nextId } from './ids';
import type { Device, Doc, Wire } from './types';

export interface Clip {
  devices: Device[];
  wires: Wire[];
}

/** The highest CAN ID that CTRE and REV devices take. */
export const MAX_CAN_ID = 62;

/** The selected devices and the wires with both ends among them, or null when no device is selected. */
export function copyItems(doc: Doc, ids: string[]): Clip | null {
  const picked = new Set(ids);
  const devices = doc.devices.filter((d) => picked.has(d.id));
  if (!devices.length) return null;
  const inside = new Set(devices.map((d) => d.id));
  const wires = doc.wires.filter((w) => inside.has(w.from.device) && inside.has(w.to.device));
  return structuredClone({ devices, wires });
}

/** The clip as new devices and wires for this document, moved by offset mm right and down. */
export function pasteItems(doc: Doc, clip: Clip, offset: number): Clip {
  const usedIds = { devices: [...doc.devices], wires: [...doc.wires] };
  const usedCan = new Set(doc.devices.map((d) => d.canId).filter((c): c is number => c !== null));
  const newId = new Map<string, string>();
  const devices = clip.devices.map((d) => {
    const id = nextId('d', usedIds.devices);
    newId.set(d.id, id);
    let canId: number | null = null;
    if (d.canId !== null) {
      for (let c = d.canId + 1; c <= MAX_CAN_ID && canId === null; c++) if (!usedCan.has(c)) canId = c;
      if (canId !== null) usedCan.add(canId);
    }
    const copy: Device = { ...structuredClone(d), id, canId, x: d.x + offset, y: d.y + offset };
    usedIds.devices.push(copy);
    return copy;
  });
  const wires = clip.wires.map((w) => {
    const copy: Wire = {
      ...structuredClone(w), id: nextId('w', usedIds.wires),
      from: { ...w.from, device: newId.get(w.from.device)! }, to: { ...w.to, device: newId.get(w.to.device)! },
      bends: w.bends.map((p) => ({ x: p.x + offset, y: p.y + offset })),
    };
    usedIds.wires.push(copy);
    return copy;
  });
  return { devices, wires };
}
