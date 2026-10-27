import { dragSegment, routeWire } from './route';
import { offsetPolyline } from './offset';
import type { Point } from '../model/types';

function expectOrthogonal(path: Point[]) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    expect(a.x === b.x || a.y === b.y).toBe(true);
    expect(a.x === b.x && a.y === b.y).toBe(false);
  }
}
const has = (path: Point[], x: number, y: number) => path.some((p) => p.x === x && p.y === y);

test('with no bends the route is orthogonal and passes both stubs', () => {
  const path = routeWire({ x: 0, y: 0 }, 'right', { x: 100, y: 50 }, 'left', []);
  expectOrthogonal(path);
  expect(path[0]).toEqual({ x: 0, y: 0 });
  expect(path.at(-1)).toEqual({ x: 100, y: 50 });
  // stubs at (6,0) and (94,50) lie on the first and last segments
  expect(path[1].y).toBe(0);
  expect(path[1].x).toBeGreaterThanOrEqual(6);
  expect(path.at(-2)!.y).toBe(50);
  expect(path.at(-2)!.x).toBeLessThanOrEqual(94);
});

test('a route visits its bend and stays orthogonal when the end moves', () => {
  const bend = [{ x: 50, y: 80 }];
  const a = routeWire({ x: 0, y: 0 }, 'right', { x: 100, y: 50 }, 'left', bend);
  expectOrthogonal(a);
  expect(has(a, 50, 80)).toBe(true);
  const b = routeWire({ x: 0, y: 0 }, 'right', { x: 130, y: 20 }, 'up', bend);
  expectOrthogonal(b);
  expect(b.at(-1)).toEqual({ x: 130, y: 20 });
});

test('ports that face away from each other still connect', () => {
  const path = routeWire({ x: 0, y: 0 }, 'left', { x: 100, y: 50 }, 'right', []);
  expectOrthogonal(path);
  expect(path.at(-1)).toEqual({ x: 100, y: 50 });
});

test('vertical ports meet with a Z through the middle', () => {
  const path = routeWire({ x: 0, y: 0 }, 'down', { x: 40, y: 100 }, 'up', []);
  expect(path).toEqual([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 40, y: 50 }, { x: 40, y: 100 }]);
});

test('dragging an interior segment moves it and returns the corners as bends', () => {
  const path = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 50 }];
  const bends = dragSegment(path, 1, 10);
  expect(bends).toEqual([{ x: 60, y: 0 }, { x: 60, y: 50 }]);
  const again = routeWire({ x: 0, y: 0 }, 'right', { x: 100, y: 50 }, 'left', bends);
  expect(again).toEqual([{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 50 }, { x: 100, y: 50 }]);
});

test('a pair line runs on the left of travel at 90 degree corners', () => {
  const out = offsetPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 0.7);
  expect(out.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3)])).toEqual([[0, -0.7], [10.7, -0.7], [10.7, 10]]);
});

test('a route that turns back keeps the stub out of the port', () => {
  const path = routeWire({ x: 0, y: 0 }, 'right', { x: -40, y: 20 }, 'right', []);
  expect(path[1]).toEqual({ x: 6, y: 0 });
  const back = routeWire({ x: 0, y: 0 }, 'right', { x: 100, y: 50 }, 'left', [{ x: -20, y: 0 }]);
  expect(back[1].x).toBeGreaterThan(0);
});

test('a dragged segment does not save the end stubs as bends', () => {
  const s1 = { x: 6, y: 0 };
  const e1 = { x: 94, y: 50 };
  const path = routeWire({ x: 0, y: 0 }, 'right', { x: 100, y: 50 }, 'left', [{ x: 50, y: 80 }]);
  const i = path.findIndex((p, k) => k > 1 && k < path.length - 2 && path[k + 1].y === p.y);
  const bends = dragSegment(path, i, 10, [s1, e1]);
  expect(bends.some((b) => (b.x === 6 && b.y === 0) || (b.x === 94 && b.y === 50))).toBe(false);
});

test('a route with bends uses the given exit points in place of the 6 mm stubs', () => {
  const path = routeWire({ x: 0, y: 0 }, 'down', { x: 100, y: 0 }, 'down', [{ x: 50, y: 80 }], { x: 0, y: 30 }, { x: 100, y: 30 });
  expect(path[1]).toEqual({ x: 0, y: 30 });
  expect(path.at(-2)!.x).toBe(100);
  expect(path.at(-2)!.y).toBeGreaterThanOrEqual(30);
});
