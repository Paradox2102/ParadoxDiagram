import { alignMoves, distributeMoves, snapMove, type Box } from './align';

const boxes = (...b: [string, number, number, number, number][]) =>
  new Map<string, Box>(b.map(([id, x, y, w, h]) => [id, { x, y, w, h }]));
const apply = (src: Map<string, Box>, moves: Map<string, { dx: number; dy: number }>) =>
  new Map([...src].map(([id, b]) => [id, { ...b, x: b.x + (moves.get(id)?.dx ?? 0), y: b.y + (moves.get(id)?.dy ?? 0) }]));

const three = boxes(['a', 10, 0, 20, 10], ['b', 40, 30, 10, 40], ['c', 25, 80, 30, 20]);

test('align left, right and center use the outer box of the selection', () => {
  const left = apply(three, alignMoves(three, 'left'));
  expect([...left.values()].map((b) => b.x)).toEqual([10, 10, 10]);
  const right = apply(three, alignMoves(three, 'right'));
  expect([...right.values()].map((b) => b.x + b.w)).toEqual([55, 55, 55]);
  const center = apply(three, alignMoves(three, 'center'));
  expect([...center.values()].map((b) => b.x + b.w / 2)).toEqual([32.5, 32.5, 32.5]);
});

test('align top, middle and bottom only move up or down', () => {
  const moves = alignMoves(three, 'bottom');
  expect([...moves.values()].every((m) => m.dx === 0)).toBe(true);
  const bottom = apply(three, moves);
  expect([...bottom.values()].map((b) => b.y + b.h)).toEqual([100, 100, 100]);
  const middle = apply(three, alignMoves(three, 'middle'));
  expect([...middle.values()].map((b) => b.y + b.h / 2)).toEqual([50, 50, 50]);
});

test('distribute keeps the end devices and makes the gaps equal', () => {
  const row = boxes(['a', 0, 0, 10, 10], ['b', 30, 0, 20, 10], ['c', 100, 0, 10, 10]);
  const out = apply(row, distributeMoves(row, 'x'));
  expect([...out.values()].map((b) => b.x)).toEqual([0, 45, 100]);
});

test('a set gap packs the devices from the first one, in their order', () => {
  const row = boxes(['a', 0, 0, 10, 10], ['c', 100, 0, 10, 10], ['b', 30, 0, 20, 10]);
  const out = apply(row, distributeMoves(row, 'x', 5));
  expect(out.get('a')!.x).toBe(0);
  expect(out.get('b')!.x).toBe(15);
  expect(out.get('c')!.x).toBe(40);
  const col = boxes(['a', 0, 0, 10, 10], ['b', 0, 50, 10, 30]);
  expect(apply(col, distributeMoves(col, 'y', 8)).get('b')!.y).toBe(18);
});

test('a drag snaps to the edge of a nearby device and reports a guide', () => {
  const moving: Box = { x: 0, y: 100, w: 20, h: 20 };
  const others: Box[] = [{ x: 51, y: 0, w: 30, h: 30 }];
  // dragged to x 49.2: its left edge is 1.8 mm from the other's left edge (51)
  const s = snapMove(moving, others, 49.2, 0, 3, 5);
  expect(s.dx).toBe(51);
  expect(s.guides).toContainEqual({ axis: 'x', at: 51, from: 0, to: 120 });
});

test('a drag snaps centers to centers', () => {
  const moving: Box = { x: 0, y: 0, w: 10, h: 10 };
  const others: Box[] = [{ x: 100, y: 40, w: 30, h: 30 }];
  // other center y = 55; moving center would be 5 + 49 = 54
  expect(snapMove(moving, others, 7, 49, 3, 5).dy).toBe(50);
});

test('far from every device, the top-left corner snaps to the grid', () => {
  const moving: Box = { x: 1, y: 2, w: 10, h: 10 };
  const s = snapMove(moving, [{ x: 500, y: 500, w: 10, h: 10 }], 12.6, 7.1, 3, 5);
  expect([moving.x + s.dx, moving.y + s.dy]).toEqual([15, 10]);
  expect(s.guides).toEqual([]);
});
