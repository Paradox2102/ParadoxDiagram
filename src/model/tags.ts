// The tag under a device: its name, then CAN ID (with the bus when there are several), the channels its power
// comes from (PDH 4/5, PDP 2, PH 7, MPM 1, VRM 12V/2A, with fuse and gauge), the IP, and the fields marked for it.
import type { Catalog, Icon } from '../catalog/catalog';
import { busesInUse, busOf, canivoreBus } from './canbus';
import type { Doc, Wire } from './types';

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

/** The fuse and gauge of a power wire as the tag shows them: " (40 A, 12 AWG)", or "". */
function ratingOf(w: { fuseA?: number; awg?: number }): string {
  const parts = [w.fuseA !== undefined ? `${w.fuseA} A` : '', w.awg !== undefined ? `${w.awg} AWG` : ''].filter(Boolean);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/** True when the device's label is drawn. */
export function tagShown(doc: Doc, deviceId: string): boolean {
  return !doc.hideTags && !doc.devices.find((d) => d.id === deviceId)?.hideTag;
}

/** A device that feeds this one, by its short name (PDH), with the channels and each channel's fuse and gauge. */
export interface PowerFeed {
  feeder: string;
  channels: { channel: string; fuseA?: number; awg?: number }[];
}

/** The power channels that feed a device, grouped by feeding device, channels in number order. */
export function powerFeeds(doc: Doc, catalog: Catalog | null, deviceId: string): PowerFeed[] {
  const feeds = new Map<string, Map<string, Wire>>();
  for (const w of doc.wires) {
    if (w.layer !== 'power') continue;
    const other = w.from.device === deviceId ? w.to : w.to.device === deviceId ? w.from : null;
    if (!other || other.device === deviceId) continue;
    const channel = channelOf(other.port);
    const feeder = channel && doc.devices.find((d) => d.id === other.device);
    if (!channel || !feeder) continue;
    const short = feederName(feeder.slug, catalog?.bySlug.get(feeder.slug));
    if (!feeds.has(short)) feeds.set(short, new Map());
    const channels = feeds.get(short)!;
    // a channel drawn twice (a pair): the wire with a fuse or gauge wins
    const had = channels.get(channel);
    if (!had || !ratingOf(had)) channels.set(channel, w);
  }
  return [...feeds].map(([feeder, channels]) => ({
    feeder,
    channels: [...channels.keys()]
      .sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b))
      .map((channel) => {
        const w = channels.get(channel)!;
        return { channel, ...(w.fuseA !== undefined ? { fuseA: w.fuseA } : {}), ...(w.awg !== undefined ? { awg: w.awg } : {}) };
      }),
  }));
}

export function deviceTag(doc: Doc, deviceId: string, catalog: Catalog | null): { name: string; facts: string } {
  const dev = doc.devices.find((d) => d.id === deviceId);
  if (!dev) return { name: '', facts: '' };
  const icon = catalog?.bySlug.get(dev.slug);
  const name = dev.name.trim() || icon?.name || dev.slug;

  const facts: string[] = [];
  // with several CANivores, each one's label says which bus it is
  if (dev.slug === 'canivore' && doc.devices.filter((d) => d.slug === 'canivore').length > 1) {
    facts.push(`Bus ${canivoreBus(doc, dev.id)}`);
  }
  if (dev.canId !== null) {
    const bus = busOf(doc, catalog, deviceId);
    facts.push(bus && busesInUse(doc, catalog).size > 1 ? `CAN ${bus}·${dev.canId}` : `CAN ${dev.canId}`);
  }
  for (const f of powerFeeds(doc, catalog, deviceId)) {
    facts.push(`${f.feeder} ${f.channels.map((c) => c.channel + ratingOf(c)).join('/')}`);
  }
  if (dev.ip) facts.push(dev.ip);
  for (const f of dev.fields ?? []) if (f.onLabel) facts.push(`${f.label} ${f.value}`.trim());
  return { name, facts: facts.join('  ·  ') };
}
