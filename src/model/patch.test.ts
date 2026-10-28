import { apply } from './actions';
import { applyPatch, diffDocs, isEmptyPatch } from './patch';
import { emptyDoc, type Doc } from './types';

function base(): Doc {
  let d = emptyDoc();
  d = apply(d, { type: 'addDevice', id: 'pdh', slug: 'rev-pdh', name: 'PDH', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', id: 'intake', slug: 'kraken-x60-powerpole', name: 'Intake', x: 200, y: 0 });
  d = apply(d, { type: 'addDevice', id: 'shooter', slug: 'kraken-x60-powerpole', name: 'Shooter', x: 400, y: 0 });
  return apply(d, { type: 'addWire', id: 'p1', layer: 'power', from: { device: 'pdh', port: 'ch4' }, to: { device: 'intake', port: 'power' } });
}

test.each<[string, (d: Doc) => Doc]>([
  ['a move', (d) => apply(d, { type: 'moveDevices', ids: ['intake'], dx: 20, dy: 5 })],
  ['a rename', (d) => apply(d, { type: 'updateDevice', id: 'pdh', patch: { name: 'Main PDH' } })],
  ['an add', (d) => apply(d, { type: 'addDevice', id: 'radio', slug: 'vh-109', name: '', x: 0, y: 100 })],
  ['a delete of a device with wires', (d) => apply(d, { type: 'delete', ids: ['intake'] })],
  ['a title change', (d) => apply(d, { type: 'setTitle', title: 'Robot' })],
  ['a field change', (d) => apply(d, { type: 'updateWire', id: 'p1', patch: { fuseA: 40 } })],
  ['hide all labels', (d) => apply(d, { type: 'setHideTags', hidden: true })],
])('diff then apply gives the after doc: %s', (_, edit) => {
  const before = base();
  const after = edit(before);
  const p = diffDocs(before, after);
  expect(isEmptyPatch(p)).toBe(false);
  expect(applyPatch(before, p)).toEqual({ doc: after, error: null });
});

test('no change gives an empty patch', () => {
  expect(isEmptyPatch(diffDocs(base(), base()))).toBe(true);
});

test('key order does not count as a change', () => {
  const b = base();
  const a = { ...b, devices: b.devices.map((d) => Object.fromEntries(Object.entries(d).reverse()) as typeof d) };
  expect(isEmptyPatch(diffDocs(b, a))).toBe(true);
});

test('undo patch keeps a later change by the other side', () => {
  const b = base();
  const a = apply(b, { type: 'moveDevices', ids: ['intake'], dx: 50, dy: 0 });
  const a2 = apply(a, { type: 'updateDevice', id: 'pdh', patch: { name: 'Renamed by AI' } });
  const { doc, error } = applyPatch(a2, diffDocs(a, b));
  expect(error).toBeNull();
  expect(doc.devices.find((d) => d.id === 'intake')!.x).toBe(200);
  expect(doc.devices.find((d) => d.id === 'pdh')!.name).toBe('Renamed by AI');
});

test('a patch does not bring back a device the other side removed', () => {
  const b = base();
  const moved = apply(b, { type: 'moveDevices', ids: ['shooter'], dx: 10, dy: 0 });
  const removedByAi = apply(b, { type: 'delete', ids: ['shooter'] });
  const { doc, error } = applyPatch(removedByAi, diffDocs(b, moved));
  expect(error).toBe('shooter was removed by the other side');
  expect(doc).toBe(removedByAi);
});

test('a wire to a device that is gone is an error', () => {
  const b = base();
  const wired = apply(b, { type: 'addWire', id: 'p2', layer: 'power', from: { device: 'pdh', port: 'ch5' }, to: { device: 'shooter', port: 'power' } });
  const removedByAi = apply(b, { type: 'delete', ids: ['shooter'] });
  expect(applyPatch(removedByAi, diffDocs(b, wired)).error).toBe('wire p2 ends at a device that is gone');
});

test('re-adding a device that the patch lists as added works (undo of a delete)', () => {
  const b = base();
  const deleted = apply(b, { type: 'delete', ids: ['intake'] });
  const { doc, error } = applyPatch(deleted, diffDocs(deleted, b));
  expect(error).toBeNull();
  expect(doc.devices.map((d) => d.id).sort()).toEqual(['intake', 'pdh', 'shooter']);
  expect(doc.wires.map((w) => w.id)).toEqual(['p1']);
});

test('the order of devices stays', () => {
  const b = base();
  const a = apply(b, { type: 'updateDevice', id: 'intake', patch: { name: 'X' } });
  expect(applyPatch(b, diffDocs(b, a)).doc.devices.map((d) => d.id)).toEqual(['pdh', 'intake', 'shooter']);
});

test('the restore action applies a patch', () => {
  const b = base();
  const a = apply(b, { type: 'setTitle', title: 'New' });
  expect(apply(b, { type: 'restore', patch: diffDocs(b, a) })).toEqual(a);
});
