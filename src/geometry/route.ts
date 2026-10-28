// Orthogonal wire routes: port, 6 mm stub, the user's bends, stub, port.
import type { Point } from '../model/types';
import type { Dir } from './transform';

export const STUB_MM = 6;

export const UNIT: Record<Dir, Point> = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
const horizontal = (d: Dir) => d === 'left' || d === 'right';

export function stub(p: Point, dir: Dir): Point {
  return { x: p.x + UNIT[dir].x * STUB_MM, y: p.y + UNIT[dir].y * STUB_MM };
}

const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/** Drop zero-length segments and middle points of straight runs (a run that turns back is kept). */
export function simplify(path: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of path) {
    if (out.length && same(out[out.length - 1], p)) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const straight = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
      const sameWay = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0;
      if (!straight || !sameWay) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** `s1` and `e1` are where each end's straight run out of its port stops (default: the 6 mm stub). */
export function routeWire(
  start: Point, sDir: Dir, end: Point, eDir: Dir, bends: Point[], s1 = stub(start, sDir), e1 = stub(end, eDir),
): Point[] {
  if (bends.length) {
    // The run out of each port stretches or shortens to meet its nearest bend, so a bend does
    // not leave a small step when its device moves a little.
    const a = slideToBend(start, sDir, bends);
    const b = slideToBend(end, eDir, [...bends].reverse());
    const from = a?.drop ? 1 : 0;
    const to = b?.drop ? bends.length - 1 : bends.length;
    if (to - from >= 1) {
      if (a) s1 = a.exit;
      if (b) e1 = b.exit;
      bends = bends.slice(from, to);
    }
  }
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

/**
 * Move segment `index` (path[index] to path[index + 1]) along its normal; the corners become bends,
 * except the end points of the runs out of the ports (`ends`), which follow their device.
 */
export function dragSegment(path: Point[], index: number, delta: number, ends: Point[] = []): Point[] {
  const a = path[index];
  const b = path[index + 1];
  const isH = a.y === b.y;
  const moved = path.map((p, i) =>
    i === index || i === index + 1 ? (isH ? { x: p.x, y: p.y + delta } : { x: p.x + delta, y: p.y }) : p,
  );
  return withoutEnds(moved.slice(1, -1), ends);
}

/** How far `p` lies along the ray from `port` in `dir`, and how far off the ray. */
function onRay(port: Point, dir: Dir, p: Point) {
  const u = UNIT[dir];
  return { along: (p.x - port.x) * u.x + (p.y - port.y) * u.y, off: Math.abs((p.x - port.x) * u.y - (p.y - port.y) * u.x) };
}

/**
 * Where the run out of a port meets the first bend of a saved route, so the run follows its
 * port. Two cases, both at least STUB_MM out along the run:
 * - the next bend is level with the first (the first only marks the old turn off the run):
 *   drop the first bend and stop the run level with the second;
 * - the first bend is a corner whose next leg runs parallel to the run: stop the run level with it.
 * Null in any other case (one bend, or a bend behind the port): the normal exit is used.
 */
function slideToBend(port: Point, dir: Dir, bends: Point[]): { exit: Point; drop: boolean } | null {
  if (bends.length < 2) return null;
  const u = UNIT[dir];
  const at = (b: Point) => {
    const t = onRay(port, dir, b).along;
    return t >= STUB_MM ? { x: port.x + u.x * t, y: port.y + u.y * t } : null;
  };
  const [b0, b1] = bends;
  const across = horizontal(dir) ? b0.x === b1.x : b0.y === b1.y; // b0 to b1 crosses the run
  const along = horizontal(dir) ? b0.y === b1.y : b0.x === b1.x; // b0 to b1 runs beside it
  if (across) {
    const exit = at(b1);
    return exit ? { exit, drop: true } : null;
  }
  if (along) {
    const exit = at(b0);
    return exit ? { exit, drop: false } : null;
  }
  return null;
}

/**
 * Corners to save as bends after a drag: points on a port's run are left out (the run follows
 * its port), except the corner where the wire turns off the run.
 */
export function stripPortRuns(corners: Point[], start: Point, sDir: Dir, end: Point, eDir: Dir): Point[] {
  const ray = (port: Point, dir: Dir, p: Point) => {
    const r = onRay(port, dir, p);
    return r.off < 1e-6 && r.along > 0;
  };
  const out = [...corners];
  while (out.length >= 2 && ray(start, sDir, out[0]) && ray(start, sDir, out[1])) out.shift();
  while (out.length >= 2 && ray(end, eDir, out[out.length - 1]) && ray(end, eDir, out[out.length - 2])) out.pop();
  return out;
}

export function withoutEnds(corners: Point[], ends: Point[]): Point[] {
  return corners.filter((c) => !ends.some((e) => same(c, e)));
}
