import { apply, type Action } from './actions';
import { emptyDoc, type Doc } from './types';
import { busesInUse, busOf, foundBus } from './canbus';
import { catalog } from '../test/fixtures';

function build(devs: [string, string][], wires: [string, string][]): Doc {
  let d = emptyDoc();
  for (const [id, slug] of devs) d = apply(d, { type: 'addDevice', id, slug, name: '', x: 0, y: 0 });
  for (const [a, b] of wires) {
    const [da, pa] = a.split('.');
    const [db, pb] = b.split('.');
    const action: Action = { type: 'addWire', layer: 'can', from: { device: da, port: pa }, to: { device: db, port: pb } };
    d = apply(d, action);
  }
  return d;
}

test('foundBus follows a chain to SystemCore can_s1', () => {
  const d = build([['sc', 'systemcore'], ['a', 'neo-vortex-spark-flex'], ['b', 'neo-vortex-spark-flex']],
    [['sc.can_s1', 'a.can_a'], ['a.can_b', 'b.can_a']]);
  expect(foundBus(d, catalog, 'b')).toBe('S1');
  expect(foundBus(d, catalog, 'a')).toBe('S1');
});

test('foundBus keeps two buses apart', () => {
  const d = build([['sc', 'systemcore'], ['a', 'neo-vortex-spark-flex'], ['b', 'neo-vortex-spark-flex']],
    [['sc.can_s0', 'a.can_a'], ['sc.can_s1', 'b.can_a']]);
  expect(foundBus(d, catalog, 'a')).toBe('S0');
  expect(foundBus(d, catalog, 'b')).toBe('S1');
  expect([...busesInUse(d, catalog)].sort()).toEqual(['S0', 'S1']);
});

test('CANivore and roboRIO names', () => {
  const d = build([['rio', 'roborio-2'], ['cv', 'canivore'], ['a', 'kraken-x60-powerpole'], ['b', 'kraken-x60-powerpole']],
    [['rio.can', 'a.can_a'], ['cv.can', 'b.can_a']]);
  expect(foundBus(d, catalog, 'a')).toBe('RIO');
  expect(foundBus(d, catalog, 'b')).toBe('CANivore');
});

test('no path gives null', () => {
  const d = build([['a', 'kraken-x60-powerpole'], ['b', 'kraken-x60-powerpole']], [['a.can_a', 'b.can_a']]);
  expect(foundBus(d, catalog, 'a')).toBeNull();
});

test('a typed canBus wins', () => {
  let d = build([['sc', 'systemcore'], ['a', 'neo-vortex-spark-flex']], [['sc.can_s1', 'a.can_a']]);
  d = apply(d, { type: 'updateDevice', id: 'a', patch: { canBus: 'Drive' } });
  expect(busOf(d, catalog, 'a')).toBe('Drive');
  expect(foundBus(d, catalog, 'a')).toBe('S1');
});

test('the buses are found once per diagram, not once per label', () => {
  const d = build([['sc', 'systemcore'], ['a', 'neo-vortex-spark-flex']], [['sc.can_s0', 'a.can_a']]);
  expect(busesInUse(d, catalog)).toBe(busesInUse(d, catalog));
  const changed = apply(d, { type: 'setTitle', title: 'x' });
  expect(busesInUse(changed, catalog)).not.toBe(busesInUse(d, catalog));
});


test('two CANivores are numbered in the order they were added', () => {
  const d = build(
    [['cv1', 'canivore'], ['cv2', 'canivore'], ['a', 'kraken-x60-powerpole'], ['b', 'kraken-x60-powerpole']],
    [['cv1.can', 'a.can_a'], ['cv2.can', 'b.can_a']],
  );
  expect(foundBus(d, catalog, 'a')).toBe('CANivore 1');
  expect(foundBus(d, catalog, 'b')).toBe('CANivore 2');
  expect([...busesInUse(d, catalog)].sort()).toEqual(['CANivore 1', 'CANivore 2']);
});

test('CANivore numbers stay the same when a deleted CANivore comes back at the end of the list (undo in live mode)', () => {
  const d = build(
    [['cv1', 'canivore'], ['cv2', 'canivore'], ['a', 'kraken-x60-powerpole'], ['b', 'kraken-x60-powerpole']],
    [['cv1.can', 'a.can_a'], ['cv2.can', 'b.can_a']],
  );
  const [cv1, ...rest] = d.devices;
  const reordered = { ...d, devices: [...rest, cv1] };
  expect(foundBus(reordered, catalog, 'a')).toBe('CANivore 1');
  expect(foundBus(reordered, catalog, 'b')).toBe('CANivore 2');
});
