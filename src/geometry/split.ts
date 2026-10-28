// A power cable to a device with separate + and - terminals: one conductor leaves the cable
// near the device for the other terminal.
import type { Point } from '../model/types';
import { STUB_MM, UNIT } from './route';
import type { Dir } from './transform';

/** The longest run of the leaving conductor alone; past this it leaves the terminal's run. */
export const SPLIT_FAR_MM = 40;

export interface Split {
  /** The segment of the route (index of its first point) the conductor leaves from. */
  seg: number;
  /** Where it leaves, on the route's center line: on the segment, or on its line past the end. */
  at: Point;
  /** The side of the cable the leaving conductor must be on, so it crosses no other line. */
  side: Point;
  /**
   * When the conductor leaves along q's exit line direction: how far out from q it crosses over
   * to q's exit line, before it turns into q.
   */
  level?: number;
}

/** The point of q's exit line level with p (exact, so the turn there is square). */
const onLine = (q: Point, u: Point, p: Point): Point => (u.y === 0 ? { x: p.x, y: q.y } : { x: q.x, y: p.y });

const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/**
 * For a route that ends at one terminal of a + / - pair, where the other conductor leaves the
 * cable for the partner terminal q, which leaves its device going dq. In order: where the route
 * crosses q's exit line near q (or would, if it went straight on at the last corner), else a
 * short way out along the terminal's own run. `front` is how far out from q a line across q's
 * exit line clears q's device and label. Null when nothing fits.
 */
export function findSplit(path: Point[], q: Point, dq: Dir, front = STUB_MM): Split | null {
  const n = path.length;
  if (n < 2) return null;
  const u = UNIT[dq];
  const along = (p: Point) => (p.x - q.x) * u.x + (p.y - q.y) * u.y;
  const across = (p: Point) => (p.x - q.x) * u.y - (p.y - q.y) * u.x;
  const toward = { x: -u.x + 0, y: -u.y + 0 };
  const end = path[n - 1];
  const corner = path[n - 2];
  const runLen = Math.hypot(corner.x - end.x, corner.y - end.y);
  const out = { x: (corner.x - end.x) / (runLen || 1), y: (corner.y - end.y) / (runLen || 1) };

  const meet = (k: number, pastEnd: boolean): Split | null => {
    if (k < 0) return null;
    const a = path[k];
    const b = path[k + 1];
    if (Math.abs((b.x - a.x) * u.x + (b.y - a.y) * u.y) > 1e-9) return null;
    const ca = across(a);
    const cb = across(b);
    if (Math.abs(ca - cb) < 1e-9) return null;
    const s = ca / (ca - cb);
    const t = along(a);
    if (t < 0 || t > SPLIT_FAR_MM) return null;
    const at = onLine(q, u, a);
    if (s >= -1e-9 && s <= 1 + 1e-9) return { seg: k, at, side: toward };
    // straight on past the corner into the terminal's run: that conductor turns at the
    // corner on the inside, so the leaving one keeps to the outside
    if (pastEnd && s > 1) return { seg: k, at, side: out };
    return null;
  };

  // the leaving conductor must not cross the cable on its way to q
  const clear = (sp: Split | null) => (sp && !crossesRoute(path, sp.seg, branchTail(sp, q, dq, 0)) ? sp : null);
  const found = clear(meet(n - 2, false)) ?? clear(meet(n - 3, true)) ?? clear(meet(n - 4, false)) ?? clear(meet(n - 5, false));
  if (found) return found;

  // else leave the terminal's own run, clear of the device
  if (same(out, u)) {
    // the run is parallel to q's exit line: sideways to that line, then into q
    const depth = Math.min(Math.max(STUB_MM, front - along(end)), runLen - 1);
    if (depth < 1) return null;
    const at = { x: end.x + out.x * depth, y: end.y + out.y * depth };
    const c = across(at);
    if (Math.abs(c) < 1e-9) return null;
    // across() is measured along (u.y, -u.x); the side toward q's line is the other way
    const s = c > 0 ? -1 : 1;
    return clear({ seg: n - 2, at, side: { x: u.y * s + 0, y: -u.x * s + 0 } });
  }
  if (Math.abs(out.x * u.x + out.y * u.y) > 1e-9) return null;
  // the run is square to q's exit line: a stub out, to the front of q's device, across, into q
  const depth = Math.min(STUB_MM, runLen - 1);
  if (depth < 1) return null;
  const at = { x: end.x + out.x * depth, y: end.y + out.y * depth };
  const a = along(at);
  const level = Math.abs(a - front) < 2 ? a + 3 : front;
  const s = level > a ? 1 : -1;
  return clear({ seg: n - 2, at, side: { x: u.x * s + 0, y: u.y * s + 0 }, level });
}

/** True when the orthogonal line crosses or touches a segment of the route other than `seg`. */
function crossesRoute(path: Point[], seg: number, line: Point[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    if (i === seg) continue;
    for (let j = 0; j < line.length - 1; j++) {
      if (meets(path[i], path[i + 1], line[j], line[j + 1])) return true;
    }
  }
  return false;
}

/** Two orthogonal segments share a point (a zero-length segment meets nothing). */
function meets(a: Point, b: Point, c: Point, d: Point): boolean {
  if (same(a, b) || same(c, d)) return false;
  const lo = (m: number, n: number) => Math.min(m, n) - 1e-6;
  const hi = (m: number, n: number) => Math.max(m, n) + 1e-6;
  return (
    Math.max(lo(a.x, b.x), lo(c.x, d.x)) <= Math.min(hi(a.x, b.x), hi(c.x, d.x)) &&
    Math.max(lo(a.y, b.y), lo(c.y, d.y)) <= Math.min(hi(a.y, b.y), hi(c.y, d.y))
  );
}

/** The leaving conductor from the cable to q: beside the split point, the turns it needs, q. */
export function branchTail(split: Split, q: Point, dq: Dir, d: number): Point[] {
  const u = UNIT[dq];
  const x = { x: split.at.x + split.side.x * d, y: split.at.y + split.side.y * d };
  if (split.level !== undefined) {
    const front = { x: q.x + u.x * split.level, y: q.y + u.y * split.level };
    const level = u.y === 0 ? { x: front.x, y: x.y } : { x: x.x, y: front.y };
    return [x, level, front, q];
  }
  const z = onLine(q, u, x);
  return same(z, x) ? [x, q] : [x, z, q];
}
