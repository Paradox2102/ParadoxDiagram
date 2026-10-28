// The tag under a device: its name, then CAN ID and the channels its power comes from
// (PDH 4/5, PDP 2, PH 7, MPM 1, VRM 12V/2A).
import type { Catalog, Icon } from '../catalog/catalog';
import type { Doc } from './types';

const CHANNEL = /^ch(\d+)$/;
const VRM_OUTPUT = /^v(\d+)_(\d+)(m?a)_\d+$/;

/** Short names of feeding devices whose icon name has none in brackets. */
const FEEDER_SHORT: Record<string, string> = { 'thrifty-powerhub': 'PH' };

/** The feeding device's short name: PDH from "Power Distribution Hub (PDH)". */
function feederName(slug: string, icon: Icon | undefined): string {
  return FEEDER_SHORT[slug] ?? /\(([^)]+)\)\s*$/.exec(icon?.name ?? '')?.[1] ?? icon?.name ?? slug;
}

/** The channel a power output is, as the tag shows it: 4 for ch4, 12V/2A for a VRM output. */
function channelOf(port: string): string | null {
  const ch = CHANNEL.exec(port);
  if (ch) return ch[1];
  const v = VRM_OUTPUT.exec(port);
  return v ? `${v[1]}V/${v[2]}${v[3] === 'ma' ? 'mA' : 'A'}` : null;
}

/** True when the device's label is drawn. */
export function tagShown(doc: Doc, deviceId: string): boolean {
  return !doc.hideTags && !doc.devices.find((d) => d.id === deviceId)?.hideTag;
}

export function deviceTag(doc: Doc, deviceId: string, catalog: Catalog | null): { name: string; facts: string } {
  const dev = doc.devices.find((d) => d.id === deviceId);
  if (!dev) return { name: '', facts: '' };
  const icon = catalog?.bySlug.get(dev.slug);
  const name = dev.name.trim() || icon?.name || dev.slug;

  // feeding device short name -> the channels it feeds this device from
  const feeds = new Map<string, Set<string>>();
  for (const w of doc.wires) {
    if (w.layer !== 'power') continue;
    const other = w.from.device === deviceId ? w.to : w.to.device === deviceId ? w.from : null;
    if (!other || other.device === deviceId) continue;
    const channel = channelOf(other.port);
    const feeder = channel && doc.devices.find((d) => d.id === other.device);
    if (!channel || !feeder) continue;
    const short = feederName(feeder.slug, catalog?.bySlug.get(feeder.slug));
    if (!feeds.has(short)) feeds.set(short, new Set());
    feeds.get(short)!.add(channel);
  }

  const facts: string[] = [];
  if (dev.canId !== null) facts.push(`CAN ${dev.canId}`);
  for (const [short, channels] of feeds) {
    const sorted = [...channels].sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b));
    facts.push(`${short} ${sorted.join('/')}`);
  }
  return { name, facts: facts.join('  ·  ') };
}
