import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportSvg, renderWirePaths, stripAnchors } from './svg';
import { apply } from '../model/actions';
import { emptyDoc, type Doc } from '../model/types';
import { catalog } from '../test/fixtures';
import { keepOutBox, wirePoints } from '../geometry/scene';

const wirePointsOf = (d: Doc) => wirePoints(d, catalog, d.wires[0])!;

const iconFile = (p: string) => readFileSync(join(import.meta.dirname, '../../public/icons', p), 'utf8');
const realIcons = async (p: string) => iconFile(p);

function doc(): Doc {
  let d = apply(emptyDoc(), { type: 'addDevice', slug: 'rev-pdh', name: 'PDH', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', slug: 'kraken-x60-powerpole', name: 'Shooter', x: 200, y: 0 });
  d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd1', port: 'ch4' }, to: { device: 'd2', port: 'power' } });
  return d;
}

test('stripAnchors removes the anchors group, the only ids in an icon', () => {
  const text = stripAnchors(iconFile(catalog.bySlug.get('kraken-x60-powerpole')!.path));
  expect(text).not.toContain('id=');
  expect(text).toContain('</svg>');
});

test('a power wire draws as a red and a black line', () => {
  const d = doc();
  const paths = renderWirePaths(d, catalog, d.wires[0]);
  expect(paths.map((p) => p.stroke)).toEqual(['#cf222e', '#0d1117']);
  expect(paths[0].d).toMatch(/^M[-\d.]+ [-\d.]+( L[-\d.]+ [-\d.]+)+$/);
});

test('the SVG export is standalone, in mm, on white, with each icon nested', async () => {
  const svg = await exportSvg(doc(), catalog, 'all', realIcons);
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg).toMatch(/ width="[\d.]+mm" height="[\d.]+mm"/);
  expect(svg).toContain('<rect');
  expect(svg).toContain('fill="#ffffff"');
  expect(svg).toContain('<svg x="-10" y="-6" width="131" height="235.5" viewBox="-10 -6 131 235.5"');
  expect(svg).not.toContain('class="caption"');
  expect(svg).toMatch(/<g data-layer="wires">\s*<path [^>]*stroke="#cf222e"/);
  expect(svg).toContain('>PDH 4<');
  expect(svg).not.toContain('id="anchors"');
});

test('a single-layer export leaves out wires of other layers', async () => {
  const svg = await exportSvg(doc(), catalog, 'air', realIcons);
  expect(svg).toMatch(/<g data-layer="wires">\s*<\/g>/);
  expect(svg).toContain('opacity="0.15"');
});

test('an icon that fails to load exports as a gray box with the device name', async () => {
  const svg = await exportSvg(doc(), catalog, 'all', async () => null);
  expect(svg).toContain('fill="#eaeef2"');
  expect(svg).toContain('>Shooter<');
});

test('a wire with no bends routes around the devices it joins', () => {
  // PDH at the left, motor below and to the right: the motor leads point down, the PDH port right
  let d = apply(emptyDoc(), { type: 'addDevice', slug: 'rev-pdh', name: 'PDH', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', slug: 'kraken-x60', name: 'M', x: 200, y: 150 });
  d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd2', port: 'vbat_pos' }, to: { device: 'd1', port: 'ch4' } });
  const pts = wirePointsOf(d);
  const motor = keepOutBox(catalog, d.devices[1]);
  expect(pts[1].x).toBe(pts[0].x);
  expect(pts[1].y).toBeGreaterThan(pts[0].y); // leaves downward, on the side of the leads
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    expect(x0 < motor.x + motor.w && x1 > motor.x && y0 < motor.y + motor.h && y1 > motor.y).toBe(false);
  }
});
