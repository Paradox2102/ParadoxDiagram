import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boundsOf } from '../../src/geometry/scene';
import { validateDoc } from '../../src/model/validate';
import { emptyDoc, type Doc } from '../../src/model/types';
import { loadNodeCatalog } from './catalog';
import { runOps, type Op } from './ops';
import { findProblems } from './problems';

const catalog = loadNodeCatalog();
const build = (ops: Op[]) => runOps(emptyDoc(), catalog, ops).doc;
const messages = (d: Doc) => findProblems(d, catalog).map((p) => p.message);

test('the example robot has no problems', () => {
  const ex = validateDoc(JSON.parse(readFileSync(join(import.meta.dirname, '../../examples/example-robot.paradox.json'), 'utf8')), catalog).doc;
  expect(findProblems(ex, catalog)).toEqual([]);
});

test('overlap gives the size of the overlap', () => {
  const d = build([
    { op: 'add_device', slug: 'kraken-x60-powerpole', id: 'intake', place: { x: 0, y: 0 } },
    { op: 'add_device', slug: 'kraken-x60-powerpole', id: 'indexer', place: { x: 10, y: 0 } },
    { op: 'set_label_hidden', ids: ['intake', 'indexer'], hidden: true },
  ]);
  const p = findProblems(d, catalog).find((x) => x.code === 'overlap')!;
  expect(p.message).toMatch(/^intake and indexer overlap \(\d+ × \d+ mm\)$/);
  expect(p.ids).toEqual(['intake', 'indexer']);
});

test('a label that covers another device', () => {
  const d0 = build([
    { op: 'add_device', slug: 'rev-pdh', id: 'pdh', name: 'Power distribution hub', place: { x: 0, y: 0 } },
    { op: 'add_device', slug: 'kraken-x60-powerpole', id: 'm', place: { x: 0, y: 0 } },
    { op: 'set_label_hidden', ids: ['m'], hidden: true },
  ]);
  // the motor's top edge 3 mm under the PDH body: inside the PDH label, clear of the PDH body
  const pdh = boundsOf(catalog, d0.devices[0]);
  const m = boundsOf(catalog, d0.devices[1]);
  const d = runOps(d0, catalog, [{ op: 'place', id: 'm', x: pdh.x + pdh.w / 2 - m.w / 2 - (m.x - d0.devices[1].x), y: pdh.y + pdh.h + 3 - (m.y - d0.devices[1].y) }]).doc;
  const codes = findProblems(d, catalog).map((p) => p.code);
  expect(codes).not.toContain('overlap');
  expect(messages(d)).toContain('the label of pdh covers m');
});

test('the same CAN ID twice on one bus, and not across buses', () => {
  const two = build([
    { op: 'add_device', slug: 'systemcore', id: 'sc', place: { x: 0, y: -300 } },
    { op: 'add_device', slug: 'neo-vortex-spark-flex', id: 'intake', can_id: 21, place: { x: 0, y: 0 } },
    { op: 'add_device', slug: 'neo-vortex-spark-flex', id: 'shooter', can_id: 21, place: { x: 300, y: 0 } },
    { op: 'connect', from: 'sc.can_s0', to: 'intake.can_a' },
    { op: 'connect', from: 'intake.can_b', to: 'shooter.can_a' },
  ]);
  expect(messages(two)).toContain('CAN ID 21 is used twice on bus S0: intake, shooter');
  const apart = runOps(two, catalog, [
    { op: 'disconnect', from: 'intake.can_b', to: 'shooter.can_a' }, { op: 'connect', from: 'sc.can_s1', to: 'shooter.can_a' },
  ]).doc;
  expect(messages(apart).filter((m) => m.startsWith('CAN ID'))).toEqual([]);
});

test('a CAN device with no CAN ID', () => {
  const d = build([{ op: 'add_device', slug: 'neo-vortex-spark-flex', id: 'intake' }]);
  expect(messages(d)).toContain('intake has CAN ports and no CAN ID');
});

test('a powered device with no power wire, but not a battery', () => {
  const d = build([
    { op: 'add_device', slug: 'vh-109', id: 'radio', place: { x: 0, y: 0 } },
    { op: 'add_device', slug: 'frc-battery', id: 'bat', place: { x: 400, y: 0 } },
  ]);
  expect(messages(d)).toEqual(['radio has a power port and no power wire']);
});

test('a power channel used twice', () => {
  const d = build([
    { op: 'add_device', slug: 'rev-pdh', id: 'pdh', can_id: 1, place: { x: 0, y: 0 } },
    { op: 'add_device', slug: 'vh-109', id: 'intake', place: { x: 400, y: 0 } },
    { op: 'add_device', slug: 'vh-109', id: 'indexer', place: { x: 400, y: 300 } },
    { op: 'connect', from: 'pdh.ch4', to: 'intake.pwr_in' },
    { op: 'connect', from: 'pdh.ch4', to: 'indexer.pwr_in' },
  ]);
  expect(messages(d)).toContain('pdh.ch4 feeds two devices: intake, indexer');
});

test('an unknown slug', () => {
  const d: Doc = { ...emptyDoc(), devices: [{ id: 'd9', slug: 'spark-maxx', x: 0, y: 0, rot: 0, name: '', canId: null, notes: '' }] };
  expect(messages(d)).toEqual(['d9 uses unknown device "spark-maxx"']);
});
