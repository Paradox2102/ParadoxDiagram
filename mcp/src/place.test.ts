import { apply } from '../../src/model/actions';
import { emptyDoc, type Doc } from '../../src/model/types';
import { loadNodeCatalog } from './catalog';
import { alignOp, columnMoves, relativePlace, rowMoves, spaceBox } from './place';

const catalog = loadNodeCatalog();

function three(): Doc {
  let d = emptyDoc();
  d = apply(d, { type: 'addDevice', id: 'pdh', slug: 'rev-pdh', name: 'PDH', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', id: 'a', slug: 'kraken-x60-powerpole', name: 'A', x: 400, y: 300 });
  return apply(d, { type: 'addDevice', id: 'b', slug: 'vh-109', name: 'B', x: -300, y: 50 });
}
const box = (d: Doc, id: string) => spaceBox(d, catalog, d.devices.find((x) => x.id === id)!);

test('right_of with gap 20 puts the left edge 20 to 25 mm right of the other box, centres level', () => {
  const d0 = three();
  const d = apply(d0, relativePlace(d0, catalog, 'a', { right_of: 'pdh', gap: 20 }));
  const p = box(d, 'pdh');
  const a = box(d, 'a');
  expect(a.x - (p.x + p.w)).toBeGreaterThanOrEqual(20);
  expect(a.x - (p.x + p.w)).toBeLessThan(25);
  expect(Math.abs(a.y + a.h / 2 - (p.y + p.h / 2))).toBeLessThanOrEqual(2.5);
});

test('below with align start lines up the left edges', () => {
  const d0 = three();
  const d = apply(d0, relativePlace(d0, catalog, 'a', { below: 'pdh', align: 'start' }));
  const p = box(d, 'pdh');
  const a = box(d, 'a');
  expect(a.y - (p.y + p.h)).toBeGreaterThanOrEqual(20);
  expect(Math.abs(a.x - p.x)).toBeLessThanOrEqual(2.5);
});

test('positions after a placement are on the 5 mm grid', () => {
  const d0 = three();
  const d = apply(d0, relativePlace(d0, catalog, 'a', { left_of: 'pdh', gap: 13 }));
  const a = d.devices.find((x) => x.id === 'a')!;
  expect(Math.abs(a.x % 5)).toBe(0);
  expect(Math.abs(a.y % 5)).toBe(0);
});

test('row with gap 20 gives equal gaps from the start point', () => {
  const d0 = three();
  const d = apply(d0, rowMoves(d0, catalog, ['pdh', 'a', 'b'], 20, { x: 0, y: 0 }));
  const [p, a, b] = ['pdh', 'a', 'b'].map((id) => box(d, id));
  expect(Math.abs(p.x)).toBeLessThanOrEqual(2.5);
  for (const [l, r] of [[p, a], [a, b]]) {
    expect(r.x - (l.x + l.w)).toBeGreaterThanOrEqual(17.5);
    expect(r.x - (l.x + l.w)).toBeLessThanOrEqual(22.5);
  }
});

test('column stacks in order', () => {
  const d0 = three();
  const d = apply(d0, columnMoves(d0, catalog, ['b', 'a'], 20));
  expect(box(d, 'a').y).toBeGreaterThan(box(d, 'b').y + box(d, 'b').h);
});

test('align left lines up the device outlines', () => {
  const d0 = three();
  const d = apply(d0, alignOp(d0, catalog, ['pdh', 'a', 'b'], 'left'));
  const xs = d.devices.map((x) => x.x);
  expect(new Set(xs).size).toBe(1);
});
