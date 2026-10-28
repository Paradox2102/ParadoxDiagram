import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateDoc } from '../../src/model/validate';
import { emptyDoc, type Doc } from '../../src/model/types';
import { loadNodeCatalog } from './catalog';
import { autoLayout } from './layout';
import { runOps } from './ops';
import { spaceBox } from './place';
import { findProblems } from './problems';

const catalog = loadNodeCatalog();
const example = () =>
  validateDoc(JSON.parse(readFileSync(join(import.meta.dirname, '../../examples/example-robot.paradox.json'), 'utf8')), catalog).doc;
const atZero = (d: Doc): Doc => ({ ...d, devices: d.devices.map((x) => ({ ...x, x: 0, y: 0 })) });
const box = (d: Doc, id: string) => spaceBox(d, catalog, d.devices.find((x) => x.id === id)!);

test('example robot with all positions at 0 gives no overlap and no label-covers', () => {
  const d = autoLayout(atZero(example()), catalog);
  const codes = findProblems(d, catalog).map((p) => p.code);
  expect(codes).not.toContain('overlap');
  expect(codes).not.toContain('label-covers');
});

test('the power row is below the control row', () => {
  const d = autoLayout(atZero(example()), catalog);
  const sc = box(d, 'd4'); // SystemCore
  for (const id of ['d1', 'd2', 'd3']) expect(box(d, id).y).toBeGreaterThan(sc.y + sc.h);
  // battery, breaker, PDH from left to right
  expect(box(d, 'd2').x).toBeLessThan(box(d, 'd3').x);
  expect(box(d, 'd3').x).toBeLessThan(box(d, 'd1').x);
});

test('motor controllers follow CAN chain order', () => {
  const d = autoLayout(atZero(example()), catalog);
  // S0 chain: intake (d6) then indexer (d7); S1: shooter left (d8) then right (d9)
  const order = ['d6', 'd7', 'd8', 'd9'].map((id) => box(d, id));
  for (let i = 1; i < order.length; i++) {
    const a = order[i - 1];
    const b = order[i];
    expect(b.y > a.y || b.x > a.x).toBe(true);
  }
});

test('each motor is beside its controller', () => {
  const d0 = runOps(emptyDoc(), catalog, [
    { op: 'add_device', slug: 'systemcore', id: 'sc' },
    { op: 'add_device', slug: 'spark-max', id: 'ctl', can_id: 5 },
    { op: 'add_device', slug: 'neo-2', id: 'motor' },
    { op: 'connect', from: 'sc.can_s0', to: 'ctl.can_a' },
    { op: 'connect', from: 'ctl.motor_a', to: 'motor.phase_a' },
  ]).doc;
  const d = autoLayout(d0, catalog);
  const c = box(d, 'ctl');
  const m = box(d, 'motor');
  expect(m.x).toBeGreaterThanOrEqual(c.x + c.w);
  expect(m.x - (c.x + c.w)).toBeLessThanOrEqual(25);
  expect(Math.abs(m.y + m.h / 2 - (c.y + c.h / 2))).toBeLessThanOrEqual(5);
});

test('positions are on the 5 mm grid', () => {
  for (const x of autoLayout(atZero(example()), catalog).devices) {
    expect(Math.abs(x.x % 5)).toBe(0);
    expect(Math.abs(x.y % 5)).toBe(0);
  }
});

test('ids limits what moves, and the moved devices stay clear of the others', () => {
  const ex = example();
  const d = autoLayout(ex, catalog, ['d10', 'd11']);
  for (const x of d.devices) {
    if (!['d10', 'd11'].includes(x.id)) expect(x).toBe(ex.devices.find((y) => y.id === x.id));
  }
  expect(findProblems(d, catalog).map((p) => p.code)).not.toContain('overlap');
});
