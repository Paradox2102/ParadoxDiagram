import { apply } from './actions';
import { copyItems, pasteItems } from './paste';
import { emptyDoc, type Doc } from './types';

function rig(): Doc {
  let d = emptyDoc();
  d = apply(d, { type: 'addDevice', id: 'pdh', slug: 'rev-pdh', name: 'PDH', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', id: 'd1', slug: 'kraken-x60-powerpole', name: 'Front left', x: 200, y: 0 });
  d = apply(d, { type: 'addDevice', id: 'd2', slug: 'kraken-x60-powerpole', name: 'Front right', x: 300, y: 0 });
  d = apply(d, { type: 'updateDevice', id: 'd1', patch: { canId: 3, ip: 'DHCP', fields: [{ label: 'Gear', value: '6.75' }] } });
  d = apply(d, { type: 'updateDevice', id: 'd2', patch: { canId: 4 } });
  d = apply(d, { type: 'addWire', id: 'w1', layer: 'can', from: { device: 'd1', port: 'can_b' }, to: { device: 'd2', port: 'can_a' } });
  d = apply(d, { type: 'setBends', id: 'w1', bends: [{ x: 250, y: 50 }] });
  d = apply(d, { type: 'addWire', id: 'w2', layer: 'power', from: { device: 'pdh', port: 'ch4' }, to: { device: 'd1', port: 'power' } });
  return apply(d, { type: 'updateWire', id: 'w2', patch: { fuseA: 40 } });
}

test('copy takes the selected devices and only the wires with both ends in the selection', () => {
  const clip = copyItems(rig(), ['d1', 'd2', 'w2'])!;
  expect(clip.devices.map((d) => d.id)).toEqual(['d1', 'd2']);
  expect(clip.wires.map((w) => w.id)).toEqual(['w1']);
});

test('copy with no device selected gives null', () => {
  expect(copyItems(rig(), ['w1'])).toBeNull();
  expect(copyItems(rig(), [])).toBeNull();
});

test('paste gives new ids, moves by the offset, keeps the details and links the wire to the copies', () => {
  const doc = rig();
  const out = pasteItems(doc, copyItems(doc, ['d1', 'd2'])!, 10);
  expect(out.devices.map((d) => d.id)).toEqual(['d3', 'd4']);
  expect(out.devices[0]).toMatchObject({ slug: 'kraken-x60-powerpole', name: 'Front left', x: 210, y: 10, ip: 'DHCP', fields: [{ label: 'Gear', value: '6.75' }] });
  expect(out.wires).toHaveLength(1);
  expect(out.wires[0]).toMatchObject({ id: 'w3', from: { device: 'd3', port: 'can_b' }, to: { device: 'd4', port: 'can_a' }, bends: [{ x: 260, y: 60 }] });
});

test('a copy gets the smallest free CAN ID above the original, counting the other copies', () => {
  const doc = rig();
  const out = pasteItems(doc, copyItems(doc, ['d1', 'd2'])!, 10);
  // 3 -> 5 (4 is used), 4 -> 6 (5 is now the first copy's)
  expect(out.devices.map((d) => d.canId)).toEqual([5, 6]);
});

test('a copy of CAN ID 62 has no CAN ID; a device with none keeps none', () => {
  let doc = apply(rig(), { type: 'updateDevice', id: 'd1', patch: { canId: 62 } });
  expect(pasteItems(doc, copyItems(doc, ['d1'])!, 10).devices[0].canId).toBeNull();
  doc = rig();
  expect(pasteItems(doc, copyItems(doc, ['pdh'])!, 10).devices[0].canId).toBeNull();
});

test('the clipboard still pastes after its devices were deleted', () => {
  const doc = rig();
  const clip = copyItems(doc, ['d1'])!;
  const gone = apply(doc, { type: 'delete', ids: ['d1'] });
  const out = pasteItems(gone, clip, 10);
  expect(out.devices).toHaveLength(1);
  expect(out.devices[0].canId).toBe(5);
});

test('the paste action adds the devices and wires in one step', () => {
  const doc = rig();
  const out = pasteItems(doc, copyItems(doc, ['d1', 'd2'])!, 10);
  const after = apply(doc, { type: 'paste', ...out });
  expect(after.devices).toHaveLength(5);
  expect(after.wires).toHaveLength(3);
});
