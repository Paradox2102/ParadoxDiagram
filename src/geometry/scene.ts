// Shared drawing facts for the canvas and the exports: wire points, colors, device boxes, tags.
import { findAnchor, partnerPort, portPolarity, type AnchorKind, type Catalog, type Icon } from '../catalog/catalog';
import { deviceTag } from '../model/tags';
import type { Device, Doc, Point, PortRef, TagSide, Wire } from '../model/types';
import { autoRouteSides, exitPoint, type Box, type SideChoice } from './autoroute';
import { nudgeRoutes } from './nudge';
import { offsetPolyline, segmentSides } from './offset';
import { branchTail, findSplit, type Split } from './split';
import { routeWire, stripPortRuns, stub } from './route';
import { deviceBounds, portSidesWorld, portWorld, type Dir } from './transform';

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
): { p: Point; dir: Dir; sides: SideChoice[]; kind: AnchorKind; polarity: '+' | '-' | null } | null {
  const dev = doc.devices.find((d) => d.id === ref.device);
  const icon = dev && iconOf(catalog, dev);
  const a = icon && findAnchor(icon, ref.port);
  if (!dev || !icon || !a) return null;
  return { ...portWorld(dev, icon, a), sides: portSidesWorld(dev, icon, a), kind: a.kind, polarity: portPolarity(a) };
}

/** The space between a device and a label beside it (left or right). */
export const TAG_GAP_MM = 2;
const NAME_PT = 3.6;
const FACTS_PT = 3;
/** About how wide a line of label text is (Helvetica; no font measuring in tests or exports). */
const textWidth = (s: string, size: number, bold: boolean) => s.length * size * (bold ? 0.6 : 0.55);

export interface TagLayout {
  /** The space the label takes. */
  box: Box;
  /** Where each line's text is centred, on its baseline. */
  name: Point;
  facts: Point;
  /** Beside the device, the lines turn 90 degrees and read top to bottom, like a book spine. */
  turned: boolean;
}

/** How far a line's letters rise above and fall below its baseline. */
const NAME_RISE = 2.6;
const DESCENT = 1;
/** From one line's baseline to the next. */
const LINE_MM = TAG_FACTS_DY - TAG_NAME_DY;

/** Where a device's label goes: under it (the default), over it, or turned beside it. */
export function tagLayout(b: Box, side: TagSide = 'bottom', tag: { name: string; facts: string }): TagLayout {
  const len = Math.max(textWidth(tag.name, NAME_PT, true), textWidth(tag.facts, FACTS_PT, false));
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  if (side === 'bottom' || side === 'top') {
    const y = side === 'bottom' ? b.y + b.h : b.y - TAG_H;
    const box = { x: cx - len / 2, y, w: len, h: TAG_H };
    if (side === 'bottom') return { box, name: { x: cx, y: y + TAG_NAME_DY }, facts: { x: cx, y: y + TAG_FACTS_DY }, turned: false };
    // over the device, the last line sits as close to it as the first line does under it
    const last = b.y - 2.5;
    return { box, name: { x: cx, y: tag.facts ? last - LINE_MM : last }, facts: { x: cx, y: last }, turned: false };
  }
  // Turned 90 degrees clockwise, the tops of the letters face right and each next line is to
  // the left of the one before.
  let nameX: number;
  let factsX: number;
  let x0: number;
  let x1: number;
  if (side === 'right') {
    const first = b.x + b.w + TAG_GAP_MM + DESCENT;
    factsX = first;
    nameX = tag.facts ? first + LINE_MM : first;
    x0 = b.x + b.w;
    x1 = nameX + NAME_RISE;
  } else {
    nameX = b.x - TAG_GAP_MM - NAME_RISE;
    factsX = nameX - LINE_MM;
    x0 = (tag.facts ? factsX : nameX) - DESCENT;
    x1 = b.x;
  }
  return {
    box: { x: x0, y: cy - len / 2, w: x1 - x0, h: len },
    name: { x: nameX, y: cy },
    facts: { x: factsX, y: cy },
    turned: true,
  };
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** A device and its label (when shown): the space a wire with no bends routes around. */
export function keepOutBox(
  catalog: Catalog | null, d: Device, hideTags = false,
  tag = { name: d.name.trim() || iconOf(catalog, d)?.name || d.slug, facts: '' },
): Box {
  const b = boundsOf(catalog, d);
  if (hideTags || d.hideTag) return b;
  // a label under the device keeps out the device's full width, as it always has
  const base = d.tagSide && d.tagSide !== 'bottom' ? b : { x: b.x, y: b.y, w: b.w, h: b.h + TAG_H };
  return union(base, tagLayout(b, d.tagSide, tag).box);
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
    const boxes = new Map(doc.devices.map((d) => [d.id, keepOutBox(catalog, d, doc.hideTags, deviceTag(doc, d.id, catalog))]));
    c = { catalog, boxes, routes: null };
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
  // A side the user chose is the only choice; otherwise each port offers its allowed sides.
  const sA: SideChoice[] = w.fromSide ? [{ dir: w.fromSide, penalty: 0 }] : a.sides;
  const sB: SideChoice[] = w.toSide ? [{ dir: w.toSide, penalty: 0 }] : b.sides;
  let pts: Point[] | null = null;
  if (!w.bends.length) pts = autoRouteSides(a.p, sA, b.p, sB, [...c.boxes.values()], boxA, boxB);
  const dA = w.fromSide ?? a.dir;
  const dB = w.toSide ?? b.dir;
  return pts ?? routeWire(a.p, dA, b.p, dB, w.bends, exitPoint(a.p, dA, boxA), exitPoint(b.p, dB, boxB));
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

const dirOf = (a: Point, b: Point): Dir =>
  Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? (b.x > a.x ? 'right' : 'left') : b.y > a.y ? 'down' : 'up';

/** The sides a drawn route leaves its two ports by. */
export function routeSides(path: Point[]): { from: Dir; to: Dir } {
  return { from: dirOf(path[0], path[1]), to: dirOf(path[path.length - 1], path[path.length - 2]) };
}

/** The corners of a dragged route that are worth saving as the wire's bends. */
export function savedBends(doc: Doc, catalog: Catalog | null, w: Wire, corners: Point[], path?: Point[]): Point[] {
  const a = portPoint(doc, catalog, w.from);
  const b = portPoint(doc, catalog, w.to);
  if (!a || !b) return corners;
  const sides = path ? routeSides(path) : { from: w.fromSide ?? a.dir, to: w.toSide ?? b.dir };
  return stripPortRuns(corners, a.p, sides.from, b.p, sides.to);
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
 * The free partner of a separate + / - terminal (vbat_neg for vbat_pos): a pair cable to the
 * terminal splits there, unless a wire of its own already uses the partner.
 */
function freePartner(doc: Doc, catalog: Catalog | null, ref: PortRef): { p: Point; dir: Dir; front: number } | null {
  const dev = doc.devices.find((d) => d.id === ref.device);
  const icon = dev && iconOf(catalog, dev);
  const a = icon && findAnchor(icon, ref.port);
  const b = icon && a && partnerPort(icon, a);
  if (!dev || !icon || !b) return null;
  const used = doc.wires.some((w) => [w.from, w.to].some((r) => r.device === dev.id && r.port === b.port));
  if (used) return null;
  const { p, dir } = portWorld(dev, icon, b);
  const e = exitPoint(p, dir, cacheFor(doc, catalog).boxes.get(dev.id) ?? null);
  return { p, dir, front: Math.hypot(e.x - p.x, e.y - p.y) };
}

interface EndSplit {
  split: Split;
  q: Point;
  dq: Dir;
}

function splitAt(path: Point[], partner: { p: Point; dir: Dir; front: number } | null): EndSplit | null {
  const split = partner && findSplit(path, partner.p, partner.dir, partner.front);
  return split ? { split, q: partner.p, dq: partner.dir } : null;
}

/**
 * A power cable that ends at a separate + or - terminal: the conductor of that polarity runs on
 * to it, the other leaves the cable near the device for the partner terminal. Null when no end
 * splits.
 */
function splitPair(doc: Doc, catalog: Catalog | null, w: Wire, pts: Point[]): WirePath[] | null {
  const a = portPoint(doc, catalog, w.from)?.polarity ?? null;
  const b = portPoint(doc, catalog, w.to)?.polarity ?? null;
  const pa = a ? freePartner(doc, catalog, w.from) : null;
  const pb = b ? freePartner(doc, catalog, w.to) : null;
  // between two one-polarity terminals, a cable only when both ends have their partner free
  if (a && b && !(pa && pb)) return null;
  const n = pts.length;
  const toEnd = splitAt(pts, pb);
  let fromEnd = splitAt([...pts].reverse(), pa);
  if (fromEnd) fromEnd = { ...fromEnd, split: { ...fromEnd.split, seg: n - 2 - fromEnd.split.seg } };
  if (fromEnd && toEnd) {
    const kf = fromEnd.split.seg;
    const kt = toEnd.split.seg;
    const dir = { x: pts[kt + 1].x - pts[kt].x, y: pts[kt + 1].y - pts[kt].y };
    const order = (toEnd.split.at.x - fromEnd.split.at.x) * dir.x + (toEnd.split.at.y - fromEnd.split.at.y) * dir.y;
    if (kf > kt || (kf === kt && order < 0)) fromEnd = null;
  }
  if (!fromEnd && !toEnd) return null;
  // the leaving conductor takes the side of the cable its split needs (the end at "to" wins)
  const sides = segmentSides(pts);
  const sideOf = (e: EndSplit) => {
    const s = sides[e.split.seg];
    return s.x * e.split.side.x + s.y * e.split.side.y >= 0 ? 1 : -1;
  };
  const sign = toEnd ? sideOf(toEnd) : sideOf(fromEnd!);
  const leaving = offsetPolyline(pts, sign * PAIR_OFFSET_MM);
  let line = leaving;
  if (toEnd) line = [...line.slice(0, toEnd.split.seg + 1), ...branchTail(toEnd.split, toEnd.q, toEnd.dq, PAIR_OFFSET_MM)];
  if (fromEnd) {
    const head = branchTail(fromEnd.split, fromEnd.q, fromEnd.dq, PAIR_OFFSET_MM).reverse();
    line = [...head, ...line.slice(fromEnd.split.seg + 1)];
  }
  const staying = offsetPolyline(pts, -sign * PAIR_OFFSET_MM);
  // the conductor that stays is the polarity of the split terminal
  const stays = (toEnd ? b : a) === '+' ? 'pos' : 'neg';
  const pos = stays === 'pos' ? staying : line;
  const neg = stays === 'pos' ? line : staying;
  return [
    { d: pathD(pos), stroke: COLORS.pos, width: 0.8 },
    { d: pathD(neg), stroke: COLORS.neg, width: 0.8 },
  ];
}

/**
 * The lines that draw a wire: a pair for power and CAN, one line for network and air. A power
 * wire between two one-polarity terminals (battery, breaker, distribution input) is one
 * conductor: red for +, black for -. A power cable to a device with separate + and - terminals
 * splits near the device.
 */
export function renderWirePaths(doc: Doc, catalog: Catalog | null, w: Wire): WirePath[] {
  const pts = wirePoints(doc, catalog, w);
  if (!pts) return [];
  if (w.layer === 'power') {
    const split = splitPair(doc, catalog, w, pts);
    if (split) return split;
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
