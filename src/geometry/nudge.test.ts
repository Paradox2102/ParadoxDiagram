import { LANE_MM, nudgeRoutes } from './nudge';
import type { Point } from '../model/types';

const P = (x: number, y: number): Point => ({ x, y });

function orthogonal(path: Point[]) {
  return path.every((p, i) => i === 0 || p.x === path[i - 1].x || p.y === path[i - 1].y);
}

test('two wires on the same run are moved into separate lanes', () => {
  // both run along y = 50 from x = 20 to x = 180
  const a = [P(0, 0), P(0, 50), P(200, 50), P(200, 100)];
  const b = [P(20, 10), P(20, 50), P(180, 50), P(180, 90)];
  const [na, nb] = nudgeRoutes([a, b]) as Point[][];
  expect(orthogonal(na) && orthogonal(nb)).toBe(true);
  expect(Math.abs(na[1].y - nb[1].y)).toBe(LANE_MM);
  // ends stay on their ports
  expect([na[0], na.at(-1), nb[0], nb.at(-1)]).toEqual([a[0], a.at(-1), b[0], b.at(-1)]);
});

test('runs that do not overlap stay where they are', () => {
  const a = [P(0, 0), P(0, 50), P(80, 50), P(80, 100)];
  const b = [P(120, 0), P(120, 50), P(200, 50), P(200, 100)];
  expect(nudgeRoutes([a, b])).toEqual([a, b]);
});

test('a run that touches a port is not moved; the other wire moves off it', () => {
  // a's first run (from its port) lies on y = 0; b has an interior run on the same line
  const a = [P(0, 0), P(100, 0), P(100, 60)];
  const b = [P(20, -40), P(20, 0), P(90, 0), P(90, 40), P(150, 40)];
  const [na, nb] = nudgeRoutes([a, b]) as Point[][];
  expect(na).toEqual(a);
  expect(nb[1].y).not.toBe(0);
  expect(orthogonal(nb)).toBe(true);
  expect(nb[0]).toEqual(b[0]);
});

test('three wires on one run take three lanes', () => {
  const mk = (x: number) => [P(x, 0), P(x, 50), P(x + 300, 50), P(x + 300, 100)];
  const out = nudgeRoutes([mk(0), mk(5), mk(10)]) as Point[][];
  expect(new Set(out.map((p) => p[1].y)).size).toBe(3);
});
