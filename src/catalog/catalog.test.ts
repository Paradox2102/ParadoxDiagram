import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canConnect, findAnchor, iconLayers, layerOfKind, parseCatalog, partnerPort, portPolarity, searchIcons } from './catalog';

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

test('every icon has a body view, the frame without the caption', () => {
  expect(catalog.icons.every((i) => i.body_view?.length === 4)).toBe(true);
  expect(catalog.bySlug.get('rev-pdh')!.body_view).toEqual([-10, -6, 131, 235.5]);
});

test('power ports with one polarity are found by name', () => {
  const pol = (slug: string, port: string) => portPolarity(findAnchor(catalog.bySlug.get(slug)!, port)!);
  expect(pol('frc-battery', 'sb50_pos')).toBe('+');
  expect(pol('frc-battery', 'sb50_neg')).toBe('-');
  expect(pol('main-breaker-120a', 'bat')).toBe('+');
  expect(pol('main-breaker-120a', 'aux')).toBe('+');
  expect(pol('rev-pdh', 'batt_pos')).toBe('+');
  expect(pol('rev-pdh', 'batt_neg')).toBe('-');
  expect(pol('thrifty-powerhub', 'battery_neg')).toBe('-');
  expect(pol('redux-zinc-v', 'gnd_1')).toBe('-');
  expect(pol('redux-zinc-v', 'vin_1')).toBe('+');
  expect(pol('rev-pdh', 'ch4')).toBeNull();
  expect(pol('ctre-vrm', 'v12_2a_1')).toBeNull();
  expect(pol('systemcore', 'can_s0')).toBeNull();
});

test('a separate + or - terminal finds its partner on the same device', () => {
  const partner = (slug: string, port: string) => {
    const icon = catalog.bySlug.get(slug)!;
    return partnerPort(icon, findAnchor(icon, port)!)?.port;
  };
  expect(partner('neo-vortex-spark-flex', 'vbat_pos')).toBe('vbat_neg');
  expect(partner('talon-srx', 'vbat_neg')).toBe('vbat_pos');
  expect(partner('talon-srx', 'motor_pos')).toBe('motor_neg');
  expect(partner('ctre-vrm', 'vin_pos')).toBe('vin_neg');
  expect(partner('redux-zinc-v', 'vin_2')).toBe('gnd_2');
  expect(partner('canandgyro', 'vin')).toBe('gnd');
  expect(partner('lumyn-led-matrix', 'in_v5')).toBe('in_gnd');
  expect(partner('candle', 'vout_5v')).toBe('vout_neg');
  expect(partner('main-breaker-120a', 'bat')).toBeUndefined();
  expect(partner('rev-pdh', 'ch4')).toBeUndefined();
});

test('a + port never joins a - port', () => {
  const a = (slug: string, port: string) => findAnchor(catalog.bySlug.get(slug)!, port)!;
  expect(canConnect(a('frc-battery', 'sb50_pos'), a('rev-pdh', 'batt_neg'))).toBe(false);
  expect(canConnect(a('frc-battery', 'sb50_pos'), a('main-breaker-120a', 'bat'))).toBe(true);
  expect(canConnect(a('rev-pdh', 'ch4'), a('kraken-x60', 'vbat_neg'))).toBe(true);
  expect(canConnect(a('rev-pdh', 'ch4'), a('systemcore', 'can_s0'))).toBe(false);
});
