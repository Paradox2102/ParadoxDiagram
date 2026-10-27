import { validateDoc } from './validate';
import { catalog } from '../test/fixtures';

const base = {
  format: 'paradox-diagram', version: 1, title: 'T',
  devices: [
    { id: 'd1', slug: 'rev-pdh', x: 0, y: 0, rot: 0, name: 'PDH', canId: null, notes: '' },
    { id: 'd2', slug: 'future-thing', x: 100, y: 0, rot: 0, name: 'New', canId: 3, notes: '' },
  ],
  wires: [
    { id: 'w1', layer: 'power', from: { device: 'd1', port: 'ch4' }, to: { device: 'd1', port: 'nope' }, bends: [], note: '' },
  ],
};

test('keeps a device with an unknown slug and drops a wire to a missing port', () => {
  const { doc, droppedWires } = validateDoc(base, catalog);
  expect(doc.devices.map((d) => d.slug)).toEqual(['rev-pdh', 'future-thing']);
  expect(doc.wires).toHaveLength(0);
  expect(droppedWires).toBe(1);
});

test('drops a wire whose layer does not match the port kinds', () => {
  const bad = { ...base, wires: [{ ...base.wires[0], layer: 'can', to: { device: 'd1', port: 'ch5' } }] };
  expect(validateDoc(bad, catalog).droppedWires).toBe(1);
});

test('keeps a good wire', () => {
  const ok = { ...base, wires: [{ ...base.wires[0], to: { device: 'd1', port: 'ch5' } }] };
  expect(validateDoc(ok, catalog).doc.wires).toHaveLength(1);
});

test('rejects a file of another format', () => {
  expect(() => validateDoc({ format: 'x' }, catalog)).toThrow('format is not paradox-diagram');
  expect(() => validateDoc({ ...base, version: 2 }, catalog)).toThrow('version 2 is not supported');
  expect(() => validateDoc({ ...base, devices: 'no' }, catalog)).toThrow('devices is not a list');
});

test('label settings survive a file round trip and default to shown', () => {
  const withFlags = {
    ...base, hideTags: true,
    devices: [{ ...base.devices[0], hideTag: true }, base.devices[1]],
  };
  const { doc } = validateDoc(withFlags, catalog);
  expect(doc.hideTags).toBe(true);
  expect(doc.devices.map((d) => d.hideTag ?? false)).toEqual([true, false]);
  expect(validateDoc(base, catalog).doc.hideTags ?? false).toBe(false);
});
