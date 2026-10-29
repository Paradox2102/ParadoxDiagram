import { catalog } from '../test/fixtures';
import { exampleDoc } from './example';
import { findProblems } from './problems';

test('the example robot opens with every wire and no problems', () => {
  const doc = exampleDoc(catalog);
  expect(doc.title).toBe('Example robot');
  expect(doc.devices.length).toBeGreaterThan(5);
  expect(doc.wires).toHaveLength(18);
  expect(findProblems(doc, catalog)).toEqual([]);
});

test('each call gives a fresh copy', () => {
  const a = exampleDoc(catalog);
  a.devices[0].name = 'changed';
  expect(exampleDoc(catalog).devices[0].name).not.toBe('changed');
});
