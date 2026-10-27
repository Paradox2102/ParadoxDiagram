// Orthogonal wire routes: port, 6 mm stub, the user's bends, stub, port.
import type { Point } from '../model/types';
import type { Dir } from './transform';

export const STUB_MM = 6;

const UNIT: Record<Dir, Point> = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
const horizontal = (d: Dir) => d === 'left' || d === 'right';

export function stub(p: Point, dir: Dir): Point {
  return { x: p.x + UNIT[dir].x * STUB_MM, y: p.y + UNIT[dir].y * STUB_MM };
}

const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/** Drop zero-length segments and middle points of straight runs. */
export function simplify(path: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of path) {
    if (out.length && same(out[out.length - 1], p)) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const straight = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      if (!straight) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

export function routeWire(start: Point, sDir: Dir, end: Point, eDir: Dir, bends: Point[]): Point[] {
  const s1 = stub(start, sDir);
  const e1 = stub(end, eDir);
  const pts: Point[] = [start, s1];
  if (!bends.length) {
    if (horizontal(sDir) && horizontal(eDir)) {
      const mx = (s1.x + e1.x) / 2;
      pts.push({ x: mx, y: s1.y }, { x: mx, y: e1.y });
    } else if (!horizontal(sDir) && !horizontal(eDir)) {
      const my = (s1.y + e1.y) / 2;
      pts.push({ x: s1.x, y: my }, { x: e1.x, y: my });
    } else if (horizontal(sDir)) {
      pts.push({ x: e1.x, y: s1.y });
    } else {
      pts.push({ x: s1.x, y: e1.y });
    }
  } else {
    pts.push(...bends);
  }
  pts.push(e1, end);

  // Join points that are not aligned with one elbow; turn away from the previous segment.
  const out: Point[] = [pts[0]];
  let lastHorizontal = horizontal(sDir);
  for (let i = 1; i < pts.length; i++) {
    const p = out[out.length - 1];
    const q = pts[i];
    if (p.x !== q.x && p.y !== q.y) {
      const elbow = lastHorizontal ? { x: p.x, y: q.y } : { x: q.x, y: p.y };
      out.push(elbow); // elbow to q runs the same way as the segment before p
    } else if (!same(p, q)) {
      lastHorizontal = p.y === q.y;
    }
    out.push(q);
  }
  return simplify(out);
}

/** Move segment `index` (path[index] to path[index + 1]) along its normal; the corners become bends. */
export function dragSegment(path: Point[], index: number, delta: number): Point[] {
  const a = path[index];
  const b = path[index + 1];
  const isH = a.y === b.y;
  const moved = path.map((p, i) =>
    i === index || i === index + 1 ? (isH ? { x: p.x, y: p.y + delta } : { x: p.x + delta, y: p.y }) : p,
  );
  return moved.slice(1, -1);
}
