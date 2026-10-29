import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apply } from '../../src/model/actions';
import { emptyDoc, type Doc } from '../../src/model/types';
import { loadNodeCatalog } from './catalog';
import { OP_EXAMPLES, OpError, OpSchema, runOps, type Op } from './ops';

const catalog = loadNodeCatalog();
const run = (doc: Doc, ops: Op[]) => runOps(doc, catalog, ops);
const err = (doc: Doc, ops: Op[]) => {
  try {
    run(doc, ops);
  } catch (e) {
    if (e instanceof OpError) return e;
    throw e;
  }
  throw new Error('no error');
};

function rig(): Doc {
  return run(emptyDoc(), [
    { op: 'add_device', slug: 'rev-pdh', id: 'pdh', name: 'PDH', can_id: 1 },
    { op: 'add_device', slug: 'systemcore', id: 'sc' },
    { op: 'add_device', slug: 'neo-vortex-spark-flex', id: 'intake', name: 'Intake', can_id: 21 },
    { op: 'add_device', slug: 'vh-109', id: 'radio' },
  ]).doc;
}

test('every op has an example that the schema accepts', () => {
  for (const ex of Object.values(OP_EXAMPLES)) expect(OpSchema.safeParse(ex).success).toBe(true);
});

test('add_device with fields, place and rotation', () => {
  const { doc, summary } = run(rig(), [{
    op: 'add_device', slug: 'kraken-x60', id: 'shooter', name: 'Shooter', can_id: 11, can_bus: 'S1',
    notes: 'left side', fields: [{ label: 'Gear', value: '1:1', on_label: true }], rot: 90, label_side: 'right',
    place: { right_of: 'pdh', gap: 30 },
  }]);
  const s = doc.devices.find((d) => d.id === 'shooter')!;
  expect(s).toMatchObject({ name: 'Shooter', canId: 11, canBus: 'S1', notes: 'left side', rot: 90, tagSide: 'right', fields: [{ label: 'Gear', value: '1:1', onLabel: true }] });
  expect(summary[0]).toMatch(/^added shooter \(kraken-x60\)/);
});

test('update_device sets and clears', () => {
  let doc = run(rig(), [{ op: 'update_device', id: 'radio', ip: 'dhcp', name: 'Radio' }]).doc;
  expect(doc.devices.find((d) => d.id === 'radio')).toMatchObject({ ip: 'DHCP', name: 'Radio' });
  doc = run(doc, [{ op: 'update_device', id: 'radio', ip: null }]).doc;
  expect(doc.devices.find((d) => d.id === 'radio')).not.toHaveProperty('ip');
});

test('connect takes its layer from the ports, with fuse, gauge, note and sides', () => {
  const { doc } = run(rig(), [
    { op: 'connect', from: 'pdh.ch4', to: 'intake.vbat_pos', id: 'p_intake', fuse_a: 40, awg: 12, note: 'front', from_side: 'left' },
    { op: 'connect', from: 'sc.can_s0', to: 'intake.can_a' },
    { op: 'connect', from: 'sc.eth0', to: 'radio.eth_rio' },
  ]);
  expect(doc.wires.map((w) => w.layer)).toEqual(['power', 'can', 'network']);
  expect(doc.wires[0]).toMatchObject({ id: 'p_intake', fuseA: 40, awg: 12, note: 'front', fromSide: 'left' });
});

test('connect refuses + to − with the polarity in the message', () => {
  let doc = run(emptyDoc(), [
    { op: 'add_device', slug: 'frc-battery', id: 'bat' }, { op: 'add_device', slug: 'main-breaker-120a', id: 'brk' },
  ]).doc;
  const e = err(doc, [{ op: 'connect', from: 'bat.sb50_neg', to: 'brk.bat' }]);
  expect(e.message).toBe('op 1 (connect): bat.sb50_neg (−) to brk.bat (+) is a short; connect + to + and − to −.');
  doc = run(doc, [{ op: 'connect', from: 'bat.sb50_pos', to: 'brk.bat' }]).doc;
  expect(doc.wires).toHaveLength(1);
});

test('connect refuses ports on different layers', () => {
  expect(err(rig(), [{ op: 'connect', from: 'pdh.ch4', to: 'intake.can_a' }]).message).toBe(
    'op 1 (connect): pdh.ch4 is a power port and intake.can_a is a can port; a wire joins two ports of one layer.',
  );
});

test('fuse on a CAN wire is refused', () => {
  expect(err(rig(), [{ op: 'connect', from: 'sc.can_s0', to: 'intake.can_a', fuse_a: 5 }]).message).toMatch(/fuse_a and awg are for power wires/);
});

test('an unknown port lists the device ports of that layer', () => {
  expect(err(rig(), [{ op: 'connect', from: 'pdh.ch4', to: 'intake.v+' }]).message).toBe(
    'op 1 (connect): neo-vortex-spark-flex "intake" has no port "v+". Its power ports are vbat_neg (−), vbat_pos (+).',
  );
});

test('an unknown device lists the device ids (the person removed it)', () => {
  const doc = apply(rig(), { type: 'delete', ids: ['intake'] });
  expect(err(doc, [{ op: 'update_device', id: 'intake', can_id: 3 }]).message).toBe(
    'op 1 (update_device): no device "intake". The devices are: pdh, sc, radio.',
  );
});

test('a later op uses an id from an earlier op', () => {
  const { doc } = run(rig(), [
    { op: 'add_device', slug: 'kraken-x60', id: 'k' },
    { op: 'connect', from: 'pdh.ch5', to: 'k.vbat_pos' },
    { op: 'place', id: 'k', below: 'pdh' },
  ]);
  expect(doc.wires).toHaveLength(1);
});

test('a failing op 3 leaves the doc unchanged and names op 3', () => {
  const doc = rig();
  const e = err(doc, [
    { op: 'set_title', title: 'X' }, { op: 'add_device', slug: 'kraken-x60', id: 'k' }, { op: 'remove', ids: ['nope'] },
  ]);
  expect(e.index).toBe(2);
  expect(e.message).toMatch(/^op 3 \(remove\): no device or wire "nope"/);
  expect(doc.title).toBe('Untitled diagram');
  expect(doc.devices).toHaveLength(4);
});

test('a duplicate or badly formed id is refused', () => {
  expect(err(rig(), [{ op: 'add_device', slug: 'kraken-x60', id: 'pdh' }]).message).toBe('op 1 (add_device): id "pdh" is already used.');
  expect(err(rig(), [{ op: 'add_device', slug: 'kraken-x60', id: '9lives' }]).message).toMatch(/must start with a letter/);
});

test('an unknown slug suggests search_devices', () => {
  expect(err(rig(), [{ op: 'add_device', slug: 'spark-maxx' }]).message).toMatch(/no device type "spark-maxx".*search_devices/);
});

test('a bad ip is refused with the rule', () => {
  expect(err(rig(), [{ op: 'update_device', id: 'radio', ip: '10.21.2' }]).message).toBe(
    'op 1 (update_device): ip "10.21.2" must be an IPv4 address like 10.21.2.11, or DHCP.',
  );
});

test('disconnect, remove, rotate, label_side, set_label_hidden, update_wire', () => {
  let doc = run(rig(), [{ op: 'connect', from: 'pdh.ch4', to: 'intake.vbat_pos', id: 'w' }]).doc;
  doc = run(doc, [
    { op: 'update_wire', id: 'w', fuse_a: 30 }, { op: 'rotate', ids: ['intake'], turns: 2 },
    { op: 'label_side', ids: ['intake'], side: 'left' }, { op: 'set_label_hidden', ids: ['radio'], hidden: true },
  ]).doc;
  expect(doc.wires[0].fuseA).toBe(30);
  expect(doc.devices.find((d) => d.id === 'intake')).toMatchObject({ rot: 180, tagSide: 'left' });
  expect(doc.devices.find((d) => d.id === 'radio')!.hideTag).toBe(true);
  expect(run(doc, [{ op: 'disconnect', from: 'intake.vbat_pos', to: 'pdh.ch4' }]).doc.wires).toHaveLength(0);
  expect(run(doc, [{ op: 'remove', ids: ['intake'] }]).doc.wires).toHaveLength(0);
});

test('the example robot can be built with ops only', () => {
  const ex = JSON.parse(readFileSync(join(import.meta.dirname, '../../examples/example-robot.paradox.json'), 'utf8')) as Doc;
  const ops: Op[] = [
    ...ex.devices.map((d): Op => ({ op: 'add_device', slug: d.slug, id: d.id, name: d.name, ...(d.canId !== null ? { can_id: d.canId } : {}), place: { x: d.x, y: d.y } })),
    ...ex.wires.map((w): Op => ({ op: 'connect', id: w.id, from: `${w.from.device}.${w.from.port}`, to: `${w.to.device}.${w.to.port}` })),
  ];
  const { doc } = run(emptyDoc(), ops);
  expect(doc.devices).toHaveLength(ex.devices.length);
  expect(doc.wires).toHaveLength(ex.wires.length);
});

test('set_title can set the team and the revision for the title block', () => {
  const { doc } = run(rig(), [{ op: 'set_title', title: 'Robot', team: '2102 Paradox', revision: 'B' }]);
  expect(doc).toMatchObject({ title: 'Robot', team: '2102 Paradox', revision: 'B' });
});
