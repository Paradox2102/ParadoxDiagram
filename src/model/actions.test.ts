import { apply } from './actions';
import { emptyDoc } from './types';
import { commit, initHistory, undo } from './history';
import type { Doc } from './types';

function withTwo(): Doc {
  let d = apply(emptyDoc(), { type: 'addDevice', slug: 'rev-pdh', name: 'PDH', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', slug: 'kraken-x60-powerpole', name: 'Motor', x: 200, y: 0 });
  return d;
}

test('new devices get ids d1, d2', () => {
  expect(withTwo().devices.map((d) => d.id)).toEqual(['d1', 'd2']);
});

test('moves snap to the 5 mm grid', () => {
  const d = apply(withTwo(), { type: 'moveDevices', ids: ['d1'], dx: 3, dy: 7 });
  expect(d.devices[0]).toMatchObject({ x: 5, y: 5 });
});

test('rotation cycles 0, 90, 180, 270, 0', () => {
  let d = withTwo();
  const seen: number[] = [];
  for (let i = 0; i < 4; i++) {
    d = apply(d, { type: 'rotateDevices', ids: ['d1'] });
    seen.push(d.devices[0].rot);
  }
  expect(seen).toEqual([90, 180, 270, 0]);
});

test('deleting a device deletes its wires and undo brings both back', () => {
  const two = withTwo();
  const wired = apply(two, {
    type: 'addWire', layer: 'power',
    from: { device: 'd1', port: 'ch4' }, to: { device: 'd2', port: 'power' },
  });
  expect(wired.wires).toHaveLength(1);
  let h = commit(initHistory(two), wired);
  h = commit(h, apply(h.present, { type: 'delete', ids: ['d2'] }));
  expect(h.present.devices).toHaveLength(1);
  expect(h.present.wires).toHaveLength(0);
  h = undo(h);
  expect(h.present.devices).toHaveLength(2);
  expect(h.present.wires).toHaveLength(1);
});

test('a wire from a port to itself, or a duplicate wire, changes nothing', () => {
  const two = withTwo();
  const same = { device: 'd1', port: 'ch4' };
  expect(apply(two, { type: 'addWire', layer: 'power', from: same, to: same })).toBe(two);
  const w = apply(two, { type: 'addWire', layer: 'power', from: same, to: { device: 'd2', port: 'power' } });
  expect(apply(w, { type: 'addWire', layer: 'power', from: { device: 'd2', port: 'power' }, to: same })).toBe(w);
});

test('history keeps at most 100 past documents', () => {
  let h = initHistory(emptyDoc());
  for (let i = 0; i < 130; i++) h = commit(h, apply(h.present, { type: 'setTitle', title: `t${i}` }));
  expect(h.past).toHaveLength(100);
  expect(commit(h, h.present)).toBe(h);
});

test('labels hide per device and for the whole diagram', () => {
  let d = apply(withTwo(), { type: 'setTagHidden', ids: ['d1', 'd2'], hidden: true });
  expect(d.devices.map((x) => x.hideTag)).toEqual([true, true]);
  d = apply(d, { type: 'setTagHidden', ids: ['d2'], hidden: false });
  expect(d.devices.map((x) => x.hideTag)).toEqual([true, false]);
  d = apply(d, { type: 'setHideTags', hidden: true });
  expect(d.hideTags).toBe(true);
});
