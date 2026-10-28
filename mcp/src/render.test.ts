import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateDoc } from '../../src/model/validate';
import { emptyDoc } from '../../src/model/types';
import { loadNodeCatalog } from './catalog';
import { runOps, type Op } from './ops';
import { renderPng } from './render';

const catalog = loadNodeCatalog();
const example = () =>
  validateDoc(JSON.parse(readFileSync(join(import.meta.dirname, '../../examples/example-robot.paradox.json'), 'utf8')), catalog).doc;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('PNG signature and width at most 1600', async () => {
  const r = await renderPng(example(), catalog, {});
  expect([...r.png.subarray(0, 8)]).toEqual(PNG);
  expect(r.width).toBeLessThanOrEqual(1600);
  expect(r.png.readUInt32BE(16)).toBe(r.width);
  expect(r.png.readUInt32BE(20)).toBe(r.height);
});

test('a large diagram lowers the scale', async () => {
  const ops: Op[] = Array.from({ length: 40 }, (_, i) => ({ op: 'add_device', slug: 'rev-pdh', id: `p${i}`, place: { x: i * 300, y: 0 } }));
  const r = await renderPng(runOps(emptyDoc(), catalog, ops).doc, catalog, { scale: 4 });
  expect(r.width).toBeLessThanOrEqual(1600);
  expect(r.scale).toBeLessThan(4);
});

test('a region crops to that area', async () => {
  const r = await renderPng(example(), catalog, { region: { x: -100, y: -100, width: 200, height: 100 }, scale: 2 });
  expect(r.width / r.height).toBeCloseTo(2, 1);
});

test('a region outside the content box gives an error that names the box', async () => {
  await expect(renderPng(example(), catalog, { region: { x: 5000, y: 5000, width: 100, height: 100 } })).rejects.toThrow(
    /region is outside the diagram, which spans x -?\d+ to -?\d+ and y -?\d+ to -?\d+ mm/,
  );
});

test('layer can dims devices', async () => {
  const all = await renderPng(example(), catalog, {});
  const can = await renderPng(example(), catalog, { layer: 'can' });
  expect(Buffer.compare(all.png, can.png)).not.toBe(0);
});
