import { autoRoute, type Box } from './autoroute';
import type { Point } from '../model/types';

const MARGIN = 4;

function expectOrthogonal(path: Point[]) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    expect(a.x === b.x || a.y === b.y).toBe(true);
    expect(a.x === b.x && a.y === b.y).toBe(false);
  }
}

/** True when the segment a-b passes through the inside of the box (edges do not count). */
function crosses(a: Point, b: Point, box: Box): boolean {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return x0 < box.x + box.w && x1 > box.x && y0 < box.y + box.h && y1 > box.y;
}

const motor: Box = { x: 100, y: 100, w: 80, h: 90 };
const pdh: Box = { x: 0, y: 0, w: 60, h: 120 };

test('a port on the bottom of a device reaches a target above without crossing the device', () => {
  const start = { x: 140, y: 185 }; // bottom leads of the motor
  const end = { x: 60, y: 30 }; // right side of the PDH
  const path = autoRoute(start, 'down', end, 'right', [motor, pdh], motor, pdh)!;
  expectOrthogonal(path);
  expect(path[0]).toEqual(start);
  expect(path.at(-1)).toEqual(end);
  // first run goes down, out of the motor; every later segment stays out of both devices
  expect(path[1].x).toBe(140);
  expect(path[1].y).toBeGreaterThanOrEqual(motor.y + motor.h + MARGIN);
  for (let i = 1; i < path.length - 2; i++) {
    expect(crosses(path[i], path[i + 1], motor)).toBe(false);
    expect(crosses(path[i], path[i + 1], pdh)).toBe(false);
  }
  // last run arrives from the right, moving left into the port
  expect(path.at(-2)!.y).toBe(30);
  expect(path.at(-2)!.x).toBeGreaterThan(60);
});

test('a route goes around a device that sits between the two ports', () => {
  const block: Box = { x: 80, y: -20, w: 40, h: 60 };
  const path = autoRoute({ x: 0, y: 0 }, 'right', { x: 200, y: 0 }, 'left', [block], null, null)!;
  expectOrthogonal(path);
  for (let i = 0; i < path.length - 1; i++) expect(crosses(path[i], path[i + 1], block)).toBe(false);
});

test('two facing ports with nothing between join with a straight line', () => {
  expect(autoRoute({ x: 0, y: 0 }, 'right', { x: 100, y: 0 }, 'left', [], null, null)).toEqual([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]);
});

test('a port deep inside its device runs out past the device edge before it turns', () => {
  const dev: Box = { x: 0, y: 0, w: 100, h: 100 };
  const path = autoRoute({ x: 50, y: 70 }, 'down', { x: 300, y: 300 }, 'up', [dev], dev, null)!;
  expect(path[1].x).toBe(50);
  expect(path[1].y).toBeGreaterThanOrEqual(100 + MARGIN);
});

test('an end port shut in by devices on all four sides gives null', () => {
  const ring: Box[] = [
    { x: -100, y: 40, w: 200, h: 20 },
    { x: -100, y: 180, w: 200, h: 20 },
    { x: -100, y: 40, w: 20, h: 160 },
    { x: 80, y: 40, w: 20, h: 160 },
  ];
  expect(autoRoute({ x: 0, y: 0 }, 'down', { x: 0, y: 100 }, 'up', ring, null, null)).toBeNull();
});
