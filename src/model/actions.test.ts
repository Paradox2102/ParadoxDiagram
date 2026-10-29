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

test('moveEach moves each device by its own exact amount in one step', () => {
  const d = apply(withTwo(), { type: 'moveEach', moves: [{ id: 'd1', dx: 1.25, dy: 0 }, { id: 'd2', dx: 0, dy: -3.5 }] });
  expect(d.devices.map((x) => [x.x, x.y])).toEqual([[1.25, 0], [200, -3.5]]);
});

test('a wire end side is set, kept with bends, and cleared by a route reset', () => {
  let d = apply(withTwo(), { type: 'addWire', layer: 'power', from: { device: 'd1', port: 'ch4' }, to: { device: 'd2', port: 'power' } });
  d = apply(d, { type: 'setWireSide', id: 'w1', end: 'to', side: 'down' });
  expect(d.wires[0].toSide).toBe('down');
  d = apply(d, { type: 'setBends', id: 'w1', bends: [{ x: 1, y: 2 }], sides: { from: 'right', to: 'left' } });
  expect([d.wires[0].fromSide, d.wires[0].toSide]).toEqual(['right', 'left']);
  d = apply(d, { type: 'resetRoute', id: 'w1' });
  expect([d.wires[0].bends, d.wires[0].fromSide, d.wires[0].toSide]).toEqual([[], undefined, undefined]);
});

test('a label side is set per device; bottom (the default) is not stored', () => {
  let d = apply(withTwo(), { type: 'setTagSide', ids: ['d1', 'd2'], side: 'right' });
  expect(d.devices.map((x) => x.tagSide)).toEqual(['right', 'right']);
  d = apply(d, { type: 'setTagSide', ids: ['d2'], side: 'bottom' });
  expect('tagSide' in d.devices[1]).toBe(false);
});

describe('new fields', () => {
  test('updateDevice sets fields and null deletes the key', () => {
    let d = apply(withTwo(), { type: 'updateDevice', id: 'd1', patch: { ip: '10.21.2.2', canBus: 'S0', fields: [{ label: 'A', value: 'b' }] } });
    expect(d.devices[0]).toMatchObject({ ip: '10.21.2.2', canBus: 'S0', fields: [{ label: 'A', value: 'b' }] });
    d = apply(d, { type: 'updateDevice', id: 'd1', patch: { ip: null, canBus: null, fields: null } });
    expect(d.devices[0]).not.toHaveProperty('ip');
    expect(d.devices[0]).not.toHaveProperty('canBus');
    expect(d.devices[0]).not.toHaveProperty('fields');
  });

  test('updateWire sets and clears fuse and gauge', () => {
    let d = apply(withTwo(), { type: 'addWire', layer: 'power', from: { device: 'd1', port: 'ch4' }, to: { device: 'd2', port: 'power' } });
    d = apply(d, { type: 'updateWire', id: 'w1', patch: { fuseA: 40, awg: 12 } });
    expect(d.wires[0]).toMatchObject({ fuseA: 40, awg: 12 });
    d = apply(d, { type: 'updateWire', id: 'w1', patch: { fuseA: null, awg: null } });
    expect(d.wires[0]).not.toHaveProperty('fuseA');
    expect(d.wires[0]).not.toHaveProperty('awg');
  });

  test('addDevice and addWire use a given id', () => {
    let d = apply(emptyDoc(), { type: 'addDevice', id: 'pdh', slug: 'rev-pdh', name: '', x: 0, y: 0 });
    d = apply(d, { type: 'addDevice', id: 'intake', slug: 'kraken-x60-powerpole', name: '', x: 0, y: 0 });
    d = apply(d, { type: 'addWire', id: 'intake_power', layer: 'power', from: { device: 'pdh', port: 'ch4' }, to: { device: 'intake', port: 'power' } });
    expect(d.devices.map((x) => x.id)).toEqual(['pdh', 'intake']);
    expect(d.wires[0].id).toBe('intake_power');
  });

  test('nextId still skips custom ids', () => {
    let d = apply(emptyDoc(), { type: 'addDevice', id: 'intake', slug: 'rev-pdh', name: '', x: 0, y: 0 });
    d = apply(d, { type: 'addDevice', id: 'd3', slug: 'rev-pdh', name: '', x: 0, y: 0 });
    d = apply(d, { type: 'addDevice', slug: 'rev-pdh', name: '', x: 0, y: 0 });
    expect(d.devices.map((x) => x.id)).toEqual(['intake', 'd3', 'd4']);
  });
});

test('setDetails sets team and revision, trims them, and an empty value removes the field', () => {
  let d = apply(emptyDoc(), { type: 'setDetails', team: ' 2102 Paradox ', revision: 'B' });
  expect(d).toMatchObject({ team: '2102 Paradox', revision: 'B' });
  d = apply(d, { type: 'setDetails', revision: '  ' });
  expect(d.team).toBe('2102 Paradox');
  expect('revision' in d).toBe(false);
});
