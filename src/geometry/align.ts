// Alignment, spacing and drag snapping for devices, on their visible outlines (labels excluded).
import type { Box } from './autoroute';

export type { Box };
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type Move = { dx: number; dy: number };
export interface Guide {
  axis: 'x' | 'y'; // 'x': a vertical line at x = at; 'y': a horizontal line at y = at
  at: number;
  from: number;
  to: number;
}

function union(boxes: Iterable<Box>): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export { union as unionBox };

/** Line every box up with the outer box of the whole selection. */
export function alignMoves(boxes: Map<string, Box>, mode: AlignMode): Map<string, Move> {
  const u = union(boxes.values());
  const out = new Map<string, Move>();
  for (const [id, b] of boxes) {
    const m: Move = { dx: 0, dy: 0 };
    if (mode === 'left') m.dx = u.x - b.x;
    if (mode === 'center') m.dx = u.x + u.w / 2 - (b.x + b.w / 2);
    if (mode === 'right') m.dx = u.x + u.w - (b.x + b.w);
    if (mode === 'top') m.dy = u.y - b.y;
    if (mode === 'middle') m.dy = u.y + u.h / 2 - (b.y + b.h / 2);
    if (mode === 'bottom') m.dy = u.y + u.h - (b.y + b.h);
    out.set(id, m);
  }
  return out;
}

/**
 * Space the boxes along one axis, in their current order. With no gap the first and last stay
 * and the gaps become equal; with a gap (mm) the boxes pack from the first one.
 */
export function distributeMoves(boxes: Map<string, Box>, axis: 'x' | 'y', gap?: number): Map<string, Move> {
  const pos = (b: Box) => (axis === 'x' ? b.x : b.y);
  const size = (b: Box) => (axis === 'x' ? b.w : b.h);
  const order = [...boxes].sort((p, q) => pos(p[1]) - pos(q[1]));
  const out = new Map<string, Move>([...boxes.keys()].map((id) => [id, { dx: 0, dy: 0 }]));
  if (order.length < 2 || (gap === undefined && order.length < 3)) return out;
  let g = gap;
  if (g === undefined) {
    const first = order[0][1];
    const last = order[order.length - 1][1];
    const span = pos(last) + size(last) - pos(first);
    g = (span - order.reduce((s, [, b]) => s + size(b), 0)) / (order.length - 1);
  }
  let at = pos(order[0][1]);
  for (const [id, b] of order) {
    const d = at - pos(b);
    out.set(id, axis === 'x' ? { dx: d, dy: 0 } : { dx: 0, dy: d });
    at += size(b) + g;
  }
  return out;
}

const edges = (lo: number, size: number) => [lo, lo + size / 2, lo + size];

/** The best snap on one axis: an edge or centre of another box within `tol`, else the grid. */
function snapAxis(lo: number, size: number, others: Box[], axis: 'x' | 'y', tol: number, grid: number) {
  let best: { shift: number; at: number; other: Box } | null = null;
  for (const o of others) {
    const oe = axis === 'x' ? edges(o.x, o.w) : edges(o.y, o.h);
    for (const e of edges(lo, size)) {
      for (const t of oe) {
        const shift = t - e;
        if (Math.abs(shift) <= tol && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, at: t, other: o };
      }
    }
  }
  if (best) return best;
  return { shift: Math.round(lo / grid) * grid - lo, at: NaN, other: null };
}

/**
 * Where a dragged box lands: (dx, dy) is the raw drag; the result lines an edge or centre up
 * with another box within `tol` mm, or puts the top-left corner on the grid. Guides show the
 * lines it lined up with.
 */
export function snapMove(moving: Box, others: Box[], dx: number, dy: number, tol: number, grid: number) {
  const sx = snapAxis(moving.x + dx, moving.w, others, 'x', tol, grid);
  const sy = snapAxis(moving.y + dy, moving.h, others, 'y', tol, grid);
  const outX = dx + sx.shift;
  const outY = dy + sy.shift;
  const moved = { x: moving.x + outX, y: moving.y + outY, w: moving.w, h: moving.h };
  const guides: Guide[] = [];
  if (sx.other) {
    const o = sx.other;
    guides.push({ axis: 'x', at: sx.at, from: Math.min(o.y, moved.y), to: Math.max(o.y + o.h, moved.y + moved.h) });
  }
  if (sy.other) {
    const o = sy.other;
    guides.push({ axis: 'y', at: sy.at, from: Math.min(o.x, moved.x), to: Math.max(o.x + o.w, moved.x + moved.w) });
  }
  return { dx: outX, dy: outY, guides };
}
