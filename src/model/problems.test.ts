import { catalog } from '../test/fixtures';
import { apply } from './actions';
import { findProblems } from './problems';
import { emptyDoc, type Doc } from './types';

function twoMotors(): Doc {
  let d = emptyDoc();
  d = apply(d, { type: 'addDevice', id: 'd1', slug: 'kraken-x60-powerpole', name: 'Front left', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', id: 'd2', slug: 'kraken-x60-powerpole', name: 'Front right', x: 300, y: 0 });
  d = apply(d, { type: 'updateDevice', id: 'd1', patch: { canId: 3 } });
  return apply(d, { type: 'updateDevice', id: 'd2', patch: { canId: 3 } });
}

test('messages use the ids by default, as the MCP server shows them', () => {
  const m = findProblems(twoMotors(), catalog).map((p) => p.message);
  expect(m).toContain('CAN ID 3 is used twice on devices with no bus found: d1, d2');
  expect(m).toContain('d1 has a power port and no power wire');
});

test('messages use nameOf when the app gives it, and the ids stay for selection', () => {
  const d = twoMotors();
  const name = (id: string) => d.devices.find((x) => x.id === id)!.name;
  const ps = findProblems(d, catalog, name);
  const dup = ps.find((p) => p.code === 'can-duplicate')!;
  expect(dup.message).toBe('CAN ID 3 is used twice on devices with no bus found: Front left, Front right');
  expect(dup.ids).toEqual(['d1', 'd2']);
  expect(ps.map((p) => p.message)).toContain('Front left has a power port and no power wire');
});

test('the same CAN ID on two CANivore buses is not a duplicate', () => {
  let d = twoMotors();
  d = apply(d, { type: 'addDevice', id: 'cv1', slug: 'canivore', name: '', x: 0, y: 200 });
  d = apply(d, { type: 'addDevice', id: 'cv2', slug: 'canivore', name: '', x: 300, y: 200 });
  d = apply(d, { type: 'addWire', layer: 'can', from: { device: 'cv1', port: 'can' }, to: { device: 'd1', port: 'can_a' } });
  d = apply(d, { type: 'addWire', layer: 'can', from: { device: 'cv2', port: 'can' }, to: { device: 'd2', port: 'can_a' } });
  expect(findProblems(d, catalog).filter((p) => p.code === 'can-duplicate')).toEqual([]);
});

test('terminators and SWYFT CANnect modules have no CAN ID, so Check does not ask for one', () => {
  let d = emptyDoc();
  ['swyft-canender-wago', 'swyft-canender-molex', 'swyft-inject-v2', 'swyft-direct-v2'].forEach((slug, i) => {
    d = apply(d, { type: 'addDevice', id: `t${i}`, slug, name: '', x: i * 200, y: 0 });
  });
  expect(findProblems(d, catalog).filter((p) => p.code === 'can-missing')).toEqual([]);
});

function krakenChain(root: 'systemcore' | 'canivore', port: string): Doc {
  let d = emptyDoc();
  d = apply(d, { type: 'addDevice', id: 'r', slug: root, name: '', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', id: 'd1', slug: 'kraken-x60', name: '', x: 300, y: 0 });
  d = apply(d, { type: 'addDevice', id: 'd2', slug: 'kraken-x60', name: '', x: 600, y: 0 });
  d = apply(d, { type: 'updateDevice', id: 'd1', patch: { canId: 1 } });
  d = apply(d, { type: 'updateDevice', id: 'd2', patch: { canId: 2 } });
  d = apply(d, { type: 'addWire', layer: 'can', from: { device: 'r', port }, to: { device: 'd1', port: 'can' } });
  return apply(d, { type: 'addWire', layer: 'can', from: { device: 'd1', port: 'can' }, to: { device: 'd2', port: 'can' } });
}

const unterminated = (d: Doc) => findProblems(d, catalog).filter((p) => p.code === 'can-unterminated');

test('a CAN bus that ends at a device with no terminator is a problem', () => {
  const ps = unterminated(krakenChain('systemcore', 'can_s1'));
  expect(ps.map((p) => p.message)).toEqual(['CAN bus S1 ends at d2 with no 120 Ω terminator']);
  expect(ps[0].ids).toEqual(['d2']);
});

test('a CANivore bus needs a terminator at its far end too', () => {
  expect(unterminated(krakenChain('canivore', 'can')).map((p) => p.message)).toEqual(['CAN bus CANivore ends at d2 with no 120 Ω terminator']);
});

test.each(['swyft-canender-wago', 'rev-pdh', 'ctre-pdp'])('a bus that ends at %s is terminated', (slug) => {
  let d = krakenChain('systemcore', 'can_s0');
  d = apply(d, { type: 'addDevice', id: 'end', slug, name: '', x: 900, y: 0 });
  const port = catalog.bySlug.get(slug)!.anchors.find((a) => a.kind === 'can')!.port;
  d = apply(d, { type: 'addWire', layer: 'can', from: { device: 'd2', port: 'can' }, to: { device: 'end', port } });
  expect(unterminated(d)).toEqual([]);
});

test('CAN devices on no bus, and a controller with nothing on its bus, give no terminator problem', () => {
  let d = emptyDoc();
  d = apply(d, { type: 'addDevice', id: 'r', slug: 'systemcore', name: '', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', id: 'd1', slug: 'kraken-x60', name: '', x: 300, y: 0 });
  d = apply(d, { type: 'addDevice', id: 'd2', slug: 'kraken-x60', name: '', x: 600, y: 0 });
  d = apply(d, { type: 'addWire', layer: 'can', from: { device: 'd1', port: 'can' }, to: { device: 'd2', port: 'can' } });
  expect(unterminated(d)).toEqual([]);
});
