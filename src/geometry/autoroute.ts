// Automatic wire routes that go around devices. Each end first runs straight out of its port,
// on the port's side, until it is clear of its own device. Between those two points a
// shortest-path search runs on the grid of device edges: segment length plus a cost per turn,
// no U-turns, and no segment through the inside of a device box.
import type { Point } from '../model/types';
import { simplify, STUB_MM } from './route';
import type { Dir } from './transform';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Clearance kept around every device. */
export const MARGIN_MM = 4;
/** One turn costs as much as this many millimetres of wire. */
const TURN_COST = 25;

const DIRS: Dir[] = ['right', 'down', 'left', 'up'];
const STEP: Record<Dir, [number, number]> = { right: [1, 0], down: [0, 1], left: [-1, 0], up: [0, -1] };
const REVERSE: Record<Dir, Dir> = { right: 'left', left: 'right', up: 'down', down: 'up' };

const grow = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });

/** The end of the straight run out of a port: past its own device (plus margin), at least STUB_MM long. */
export function exitPoint(p: Point, dir: Dir, own: Box | null): Point {
  let len = STUB_MM;
  if (own) {
    const g = grow(own, MARGIN_MM);
    const edge = { right: g.x + g.w - p.x, left: p.x - g.x, down: g.y + g.h - p.y, up: p.y - g.y }[dir];
    len = Math.max(len, edge);
  }
  const [dx, dy] = STEP[dir];
  return { x: p.x + dx * len, y: p.y + dy * len };
}

const inside = (p: Point, b: Box) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;

class Heap {
  private a: [number, number][] = [];
  get size() {
    return this.a.length;
  }
  push(cost: number, id: number) {
    const a = this.a;
    a.push([cost, id]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Route from a port to a port around the boxes. `startBox` and `endBox` are the devices the
 * ports belong to (they are also in `boxes`). Returns null when no path exists.
 */
export function autoRoute(
  start: Point, sDir: Dir, end: Point, eDir: Dir, boxes: Box[], startBox: Box | null, endBox: Box | null,
): Point[] | null {
  const s1 = exitPoint(start, sDir, startBox);
  const e1 = exitPoint(end, eDir, endBox);
  // A box that holds an exit point (devices that overlap) cannot be routed around: leave it out.
  const obstacles = boxes.map((b) => grow(b, MARGIN_MM)).filter((b) => !inside(s1, b) && !inside(e1, b));

  const uniq = (v: number[]) => [...new Set(v.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);
  const xs = uniq([s1.x, e1.x, ...obstacles.flatMap((b) => [b.x, b.x + b.w])]);
  const ys = uniq([s1.y, e1.y, ...obstacles.flatMap((b) => [b.y, b.y + b.h])]);
  const nx = xs.length;
  const ny = ys.length;
  const node = (i: number, j: number) => j * nx + i;

  // Rasterise the boxes: blocked nodes, and blocked steps to the next node right (h) or down (v).
  const nodeBlocked = new Uint8Array(nx * ny);
  const hBlocked = new Uint8Array(nx * ny);
  const vBlocked = new Uint8Array(nx * ny);
  for (const b of obstacles) {
    const x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.h;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = xs[i], y = ys[j];
        if (x > x0 && x < x1 && y > y0 && y < y1) nodeBlocked[node(i, j)] = 1;
        if (i + 1 < nx && y > y0 && y < y1 && x >= x0 && xs[i + 1] <= x1) hBlocked[node(i, j)] = 1;
        if (j + 1 < ny && x > x0 && x < x1 && y >= y0 && ys[j + 1] <= y1) vBlocked[node(i, j)] = 1;
      }
    }
  }

  const si = xs.indexOf(Math.round(s1.x * 1000) / 1000);
  const sj = ys.indexOf(Math.round(s1.y * 1000) / 1000);
  const ei = xs.indexOf(Math.round(e1.x * 1000) / 1000);
  const ej = ys.indexOf(Math.round(e1.y * 1000) / 1000);
  const goal = node(ei, ej);
  if (nodeBlocked[node(si, sj)] || nodeBlocked[goal]) return null;

  // Search states are (node, direction of travel into the node).
  const best = new Float64Array(nx * ny * 4).fill(Infinity);
  const prev = new Int32Array(nx * ny * 4).fill(-1);
  const heap = new Heap();
  const h = (n: number) => Math.abs(xs[n % nx] - e1.x) + Math.abs(ys[Math.floor(n / nx)] - e1.y);
  const startState = node(si, sj) * 4 + DIRS.indexOf(sDir);
  best[startState] = 0;
  heap.push(h(node(si, sj)), startState);
  const finalDir = DIRS.indexOf(REVERSE[eDir]);
  let found = -1;

  while (heap.size) {
    const [, state] = heap.pop();
    const n = state >> 2;
    const d = state & 3;
    const cost = best[state];
    if (n === goal) {
      // the last run goes into the end port; arriving another way costs one more turn
      const total = cost + (d === finalDir ? 0 : d === DIRS.indexOf(eDir) ? Infinity : TURN_COST);
      if (total < Infinity) {
        found = state;
        break;
      }
      continue;
    }
    const i = n % nx;
    const j = Math.floor(n / nx);
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue; // no U-turns
      const [dx, dy] = STEP[DIRS[nd]];
      const ni = i + dx;
      const nj = j + dy;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const m = node(ni, nj);
      if (nodeBlocked[m]) continue;
      if (dx && hBlocked[node(Math.min(i, ni), j)]) continue;
      if (dy && vBlocked[node(i, Math.min(j, nj))]) continue;
      const step = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]) + (nd === d ? 0 : TURN_COST);
      const next = m * 4 + nd;
      if (cost + step < best[next]) {
        best[next] = cost + step;
        prev[next] = state;
        heap.push(cost + step + h(m), next);
      }
    }
  }
  if (found < 0) return null;

  const mid: Point[] = [];
  for (let st = found; st >= 0; st = prev[st]) {
    const n = st >> 2;
    mid.push({ x: xs[n % nx], y: ys[Math.floor(n / nx)] });
  }
  mid.reverse();
  return simplify([start, ...mid, end]);
}
