import { branchTail, findSplit } from './split';

// P at (0, 0) and q at (-10, 0), both on the bottom edge (leaving down); routes end at P
const q = { x: -10, y: 0 };

test('a cable from the far side goes straight on past its last corner to the other terminal', () => {
  const path = [{ x: 30, y: 30 }, { x: 30, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
  const s = findSplit(path, q, 'down')!;
  expect(s).toEqual({ seg: 1, at: { x: -10, y: 10 }, side: { x: 0, y: 1 } });
  expect(branchTail(s, q, 'down', 0.7)).toEqual([{ x: -10, y: 10.7 }, q]);
});

test('a cable from the side of the other terminal leaves where it crosses that terminal', () => {
  const path = [{ x: -30, y: 30 }, { x: -30, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
  const s = findSplit(path, q, 'down')!;
  expect(s.seg).toBe(1);
  expect(s.at).toEqual({ x: -10, y: 10 });
  expect(s.side).toEqual({ x: 0, y: -1 });
  expect(branchTail(s, q, 'down', 0.7)).toEqual([{ x: -10, y: 9.3 }, q]);
});

test('a cable straight in from far away leaves its run a stub out from the terminal', () => {
  const path = [{ x: 0, y: 100 }, { x: 0, y: 0 }];
  const s = findSplit(path, q, 'down')!;
  expect(s).toEqual({ seg: 0, at: { x: 0, y: 6 }, side: { x: -1, y: 0 } });
  expect(branchTail(s, q, 'down', 0.7)).toEqual([{ x: -0.7, y: 6 }, { x: -10, y: 6 }, q]);
});

test('a crossing far from the other terminal is not used', () => {
  const path = [{ x: 30, y: 80 }, { x: -30, y: 80 }, { x: -30, y: 70 }, { x: 0, y: 70 }, { x: 0, y: 0 }];
  const s = findSplit(path, q, 'down')!;
  expect(s.seg).toBe(3);
  expect(s.at).toEqual({ x: 0, y: 6 });
});

test('no split when the other terminal leaves the opposite way', () => {
  const path = [{ x: 30, y: 30 }, { x: 30, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
  expect(findSplit(path, q, 'up')).toBeNull();
});
