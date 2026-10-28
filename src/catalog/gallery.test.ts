import { groupIcons, iconsZip, zipSlug } from './gallery';
import { searchIcons } from './catalog';
import { catalog } from '../test/fixtures';

test('type groups follow the catalog type order and hold every icon once', () => {
  const groups = groupIcons(catalog, catalog.icons, 'type');
  const order = catalog.types.map((t) => t.id).filter((id) => groups.some((g) => g.id === id));
  expect(groups.map((g) => g.id)).toEqual(order);
  expect(groups.reduce((n, g) => n + g.icons.length, 0)).toBe(catalog.icons.length);
});

test('vendor groups are in name order, with several makers last', () => {
  const groups = groupIcons(catalog, catalog.icons, 'vendor');
  const named = groups.filter((g) => g.id !== 'vendor-generic').map((g) => g.name);
  expect(named).toEqual([...named].sort((a, b) => a.localeCompare(b)));
  expect(groups[groups.length - 1].id).toBe('vendor-generic');
  expect(groups.every((g) => g.id.startsWith('vendor-'))).toBe(true);
});

test('a search keeps only the groups with matches', () => {
  const groups = groupIcons(catalog, searchIcons(catalog.icons, 'kraken', true), 'type');
  expect(groups.map((g) => g.id)).toEqual(['motors']);
});

test('ZIP names are plain lower case with dashes', () => {
  expect(zipSlug('Motor controllers')).toBe('motor-controllers');
  expect(zipSlug('REV Robotics')).toBe('rev-robotics');
  expect(zipSlug('  ')).toBe('icons');
});

test('a ZIP holds the license, each icon at its collection path, and index.json only for all icons', async () => {
  const icons = catalog.icons.filter((i) => i.vendor === 'rev').slice(0, 2);
  const asked: string[] = [];
  const fetchText = async (p: string) => {
    asked.push(p);
    return `file ${p}`;
  };
  const zip = await iconsZip(icons, 'frc-device-icons-rev', fetchText);
  const text = new TextDecoder().decode(zip);
  expect(asked).toEqual(['LICENSE.md', ...icons.map((i) => i.path)]);
  for (const i of icons) expect(text).toContain(`frc-device-icons-rev/${i.path}`);
  expect(text).not.toContain('index.json');
  asked.length = 0;
  await iconsZip(icons, 'frc-device-icons', fetchText, true);
  expect(asked).toContain('index.json');
});
