import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findAnchor, iconLayers, layerOfKind, parseCatalog, searchIcons } from './catalog';

const raw = JSON.parse(readFileSync(join(import.meta.dirname, '../../public/icons/index.json'), 'utf8'));
const catalog = parseCatalog(raw);

test('parses the 92-icon index with anchors', () => {
  expect(catalog.icons).toHaveLength(92);
  const pdh = catalog.bySlug.get('rev-pdh')!;
  expect(findAnchor(pdh, 'ch4')?.kind).toBe('power');
});

test('maps anchor kinds to layers', () => {
  expect(layerOfKind('usb')).toBe('network');
  expect(layerOfKind('ethernet')).toBe('network');
  expect(layerOfKind('signal')).toBe('network');
  expect(layerOfKind('air')).toBe('air');
  expect(layerOfKind('can')).toBe('can');
  expect(iconLayers(catalog.bySlug.get('rev-pdh')!)).toEqual(new Set(['power', 'network', 'can']));
});

test('search needs every word to match', () => {
  const hits = searchIcons(catalog.icons, 'kraken x60', false);
  expect(hits.map((i) => i.slug)).toContain('kraken-x60-powerpole');
  for (const i of hits) {
    const hay = `${i.name} ${i.vendor_name} ${i.part_number ?? ''} ${i.slug}`.toLowerCase();
    expect(hay).toContain('kraken');
    expect(hay).toContain('x60');
  }
});

test('legacy icons stay hidden until asked for', () => {
  expect(searchIcons(catalog.icons, '', false).some((i) => i.status === 'legacy')).toBe(false);
  expect(searchIcons(catalog.icons, '', true)).toHaveLength(92);
});

test('rejects an index with no icons list', () => {
  expect(() => parseCatalog({})).toThrow('icons/index.json: no icons list');
});
