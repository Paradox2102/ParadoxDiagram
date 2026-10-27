// Shared drawing facts for the canvas and the exports: wire points, colors, device boxes, tags.
import { findAnchor, type AnchorKind, type Catalog, type Icon } from '../catalog/catalog';
import type { Device, Doc, Point, PortRef, Wire } from '../model/types';
import { offsetPolyline } from './offset';
import { routeWire } from './route';
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

export function portPoint(doc: Doc, catalog: Catalog | null, ref: PortRef): { p: Point; dir: Dir; kind: AnchorKind } | null {
  const dev = doc.devices.find((d) => d.id === ref.device);
  const icon = dev && iconOf(catalog, dev);
  const a = icon && findAnchor(icon, ref.port);
  if (!dev || !icon || !a) return null;
  return { ...portWorld(dev, icon, a), kind: a.kind };
}

/** The wire's route, or null when an end cannot be placed (unknown icon). */
export function wirePoints(doc: Doc, catalog: Catalog | null, w: Wire): Point[] | null {
  const a = portPoint(doc, catalog, w.from);
  const b = portPoint(doc, catalog, w.to);
  if (!a || !b) return null;
  return routeWire(a.p, a.dir, b.p, b.dir, w.bends);
}

export interface WirePath {
  d: string;
  stroke: string;
  width: number;
  dash?: string;
}

const f = (v: number) => String(Math.round(v * 100) / 100 + 0);
export const pathD = (pts: Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ');

/** The lines that draw a wire: a pair for power and CAN, one line for network and air. */
export function renderWirePaths(doc: Doc, catalog: Catalog | null, w: Wire): WirePath[] {
  const pts = wirePoints(doc, catalog, w);
  if (!pts) return [];
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

export const TAG_NAME_DY = 5;
export const TAG_FACTS_DY = 9.5;
export const TAG_H = 12;
