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
