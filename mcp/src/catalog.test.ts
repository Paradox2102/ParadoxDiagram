import { iconTextNode, loadNodeCatalog } from './catalog';

test('loadNodeCatalog has 94 icons and rev-pdh', () => {
  const c = loadNodeCatalog();
  expect(c.icons).toHaveLength(94);
  expect(c.bySlug.get('rev-pdh')?.name).toMatch(/PDH/);
});

test('iconTextNode returns the PDH SVG, and null for a missing file', async () => {
  const c = loadNodeCatalog();
  expect(await iconTextNode(c.bySlug.get('rev-pdh')!.path)).toMatch(/^<svg|<\?xml/);
  expect(await iconTextNode('nope/missing.svg')).toBeNull();
  expect(await iconTextNode('../../package.json')).toBeNull();
});
