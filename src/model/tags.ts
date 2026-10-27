// The tag under a device: its name, then CAN ID and the PDH channels its power wires reach.
import type { Catalog } from '../catalog/catalog';
import type { Doc } from './types';

const CHANNEL = /^ch(\d+)$/;

/** True when the device's label is drawn. */
export function tagShown(doc: Doc, deviceId: string): boolean {
  return !doc.hideTags && !doc.devices.find((d) => d.id === deviceId)?.hideTag;
}

export function deviceTag(doc: Doc, deviceId: string, catalog: Catalog | null): { name: string; facts: string } {
  const dev = doc.devices.find((d) => d.id === deviceId);
  if (!dev) return { name: '', facts: '' };
  const icon = catalog?.bySlug.get(dev.slug);
  const name = dev.name.trim() || icon?.name || dev.slug;

  const channels = new Set<number>();
  for (const w of doc.wires) {
    if (w.layer !== 'power') continue;
    const other = w.from.device === deviceId ? w.to : w.to.device === deviceId ? w.from : null;
    if (!other || other.device === deviceId) continue;
    const m = CHANNEL.exec(other.port);
    if (m) channels.add(Number(m[1]));
  }

  const facts: string[] = [];
  if (dev.canId !== null) facts.push(`CAN ${dev.canId}`);
  if (channels.size) facts.push(`PDH ${[...channels].sort((a, b) => a - b).join('/')}`);
  return { name, facts: facts.join('  ·  ') };
}
