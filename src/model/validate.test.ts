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

test('wire end sides survive a file round trip; a bad side is dropped', () => {
  const ok = { ...base, wires: [{ ...base.wires[0], to: { device: 'd1', port: 'ch5' }, fromSide: 'up', toSide: 'sideways' }] };
  const w = validateDoc(ok, catalog).doc.wires[0];
  expect([w.fromSide, w.toSide]).toEqual(['up', undefined]);
});

test('a label side survives a file round trip; bottom and bad sides are left out', () => {
  const sides = { ...base, devices: [{ ...base.devices[0], tagSide: 'left' }, { ...base.devices[1], tagSide: 'under' }] };
  const { doc } = validateDoc(sides, catalog);
  expect(doc.devices.map((d) => d.tagSide)).toEqual(['left', undefined]);
});

describe('new fields', () => {
  const rich = {
    format: 'paradox-diagram', version: 1, title: 'T',
    devices: [
      { id: 'pdh', slug: 'rev-pdh', x: 0, y: 0, rot: 0, name: 'PDH', canId: 1, notes: '' },
      {
        id: 'radio', slug: 'vh-109', x: 100, y: 0, rot: 0, name: 'Radio', canId: null, notes: '',
        ip: '10.21.2.1', canBus: 'S1', fields: [{ label: 'Firmware', value: '25.1' }, { label: 'Spot', value: 'belly pan', onLabel: true }],
      },
      { id: 'm1', slug: 'kraken-x60-powerpole', x: 200, y: 0, rot: 0, name: 'M1', canId: 2, notes: '' },
      { id: 'm2', slug: 'kraken-x60-powerpole', x: 300, y: 0, rot: 0, name: 'M2', canId: 3, notes: '' },
    ],
    wires: [
      { id: 'w1', layer: 'power', from: { device: 'pdh', port: 'ch4' }, to: { device: 'm1', port: 'power' }, bends: [], note: '', fuseA: 40, awg: 12 },
      { id: 'w2', layer: 'can', from: { device: 'm1', port: 'can_a' }, to: { device: 'm2', port: 'can_a' }, bends: [], note: '' },
    ],
  };
  const radio = (patch: object) => ({ ...rich, devices: rich.devices.map((d) => (d.id === 'radio' ? { ...d, ...patch } : d)) });
  const power = (patch: object) => ({ ...rich, wires: rich.wires.map((w) => (w.id === 'w1' ? { ...w, ...patch } : w)) });

  test('validate keeps good new fields', () => {
    const { doc } = validateDoc(rich, catalog);
    expect(doc.devices[1]).toMatchObject({ ip: '10.21.2.1', canBus: 'S1', fields: rich.devices[1].fields });
    expect(doc.wires[0]).toMatchObject({ fuseA: 40, awg: 12 });
  });

  test('validate accepts DHCP in any case', () => {
    expect(validateDoc(radio({ ip: 'dhcp' }), catalog).doc.devices[1].ip).toBe('DHCP');
  });

  test.each([
    ['ip', { ip: '10.21.2' }], ['ip', { ip: '300.1.1.1' }], ['canBus', { canBus: '' }], ['canBus', { canBus: 'x'.repeat(21) }],
    ['fields', { fields: Array.from({ length: 21 }, (_, i) => ({ label: `L${i}`, value: 'v' })) }],
    ['fields', { fields: [{ label: '', value: 'v' }] }], ['fields', { fields: [{ label: 'L', value: 'v'.repeat(201) }] }],
  ])('validate drops a bad %s and keeps the rest of the device', (key, patch) => {
    const d = validateDoc(radio(patch), catalog).doc.devices[1];
    expect(d).not.toHaveProperty(key);
    expect(d.name).toBe('Radio');
  });

  test.each([[{ fuseA: 0 }, 'fuseA'], [{ fuseA: 250 }, 'fuseA'], [{ awg: 3 }, 'awg'], [{ awg: 12.5 }, 'awg']])(
    'validate drops a bad power wire value %o',
    (patch, key) => {
      const w = validateDoc(power(patch), catalog).doc.wires[0];
      expect(w).not.toHaveProperty(key);
      expect(w.from.port).toBe('ch4');
    },
  );

  test('validate drops fuse and gauge on a CAN wire', () => {
    const can = { ...rich, wires: [rich.wires[0], { ...rich.wires[1], fuseA: 5, awg: 22 }] };
    const w = validateDoc(can, catalog).doc.wires[1];
    expect(w).not.toHaveProperty('fuseA');
    expect(w).not.toHaveProperty('awg');
  });
});
