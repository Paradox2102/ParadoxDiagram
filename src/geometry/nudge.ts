// Wires that run along the same line are moved into separate lanes, so power, CAN and data
// never lie on top of each other. A run that touches a port stays put (it must meet the port);
// the other runs on that line step aside by one lane: +3 mm, -3 mm, +6 mm, ...
import type { Point } from '../model/types';

export const LANE_MM = 3;
const MIN_OVERLAP_MM = 0.5;

interface Seg {
  wire: number;
  index: number;
  horizontal: boolean;
  lo: number;
  hi: number;
  fixed: boolean;
  offset: number;
}

const laneOffset = (lane: number) => (lane === 0 ? 0 : (lane % 2 ? 1 : -1) * Math.ceil(lane / 2) * LANE_MM);

export function nudgeRoutes(routes: (Point[] | null)[]): (Point[] | null)[] {
  const groups = new Map<string, Seg[]>();
  const perWire: Seg[][] = routes.map(() => []);
  routes.forEach((r, wire) => {
    if (!r) return;
    for (let i = 0; i < r.length - 1; i++) {
      const a = r[i];
      const b = r[i + 1];
      const horizontal = a.y === b.y;
      const at = horizontal ? a.y : a.x;
      const [lo, hi] = horizontal ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
      const seg: Seg = { wire, index: i, horizontal, lo, hi, fixed: i === 0 || i === r.length - 2, offset: 0 };
      perWire[wire].push(seg);
      const key = `${horizontal ? 'h' : 'v'}${Math.round(at * 100)}`;
      const g = groups.get(key);
      if (g) g.push(seg);
      else groups.set(key, [seg]);
    }
  });

  for (const segs of groups.values()) {
    if (new Set(segs.map((s) => s.wire)).size < 2) continue;
    segs.sort((p, q) => Number(q.fixed) - Number(p.fixed) || p.lo - q.lo);
    const placed: { seg: Seg; lane: number }[] = [];
    for (const seg of segs) {
      let lane = 0;
      if (!seg.fixed) {
        const used = new Set(
          placed
            .filter(({ seg: o }) => o.wire !== seg.wire && Math.min(o.hi, seg.hi) - Math.max(o.lo, seg.lo) > MIN_OVERLAP_MM)
            .map((p) => p.lane),
        );
        while (used.has(lane)) lane++;
      }
      seg.offset = laneOffset(lane);
      placed.push({ seg, lane });
    }
  }

  return routes.map((r, wire) => {
    if (!r) return r;
    const segs = perWire[wire];
    // A run that turns back on itself keeps one offset along the whole straight line.
    for (let i = 1; i < segs.length; i++) if (segs[i].horizontal === segs[i - 1].horizontal) segs[i].offset = segs[i - 1].offset;
    if (segs.every((s) => s.offset === 0)) return r;
    const out = r.map((p) => ({ ...p }));
    for (const s of segs) {
      if (!s.offset) continue;
      for (const k of [s.index, s.index + 1]) {
        if (s.horizontal) out[k].y = r[k].y + s.offset;
        else out[k].x = r[k].x + s.offset;
      }
    }
    return out;
  });
}
