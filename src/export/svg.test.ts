import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportSvg, renderWirePaths, stripAnchors } from './svg';
import { apply } from '../model/actions';
import { emptyDoc, type Doc } from '../model/types';
import { catalog } from '../test/fixtures';
import { keepOutBox, routeSides, wirePoints } from '../geometry/scene';

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

test('battery to breaker to PDH draws one conductor per wire; a channel cable stays a pair', () => {
  let d = apply(emptyDoc(), { type: 'addDevice', slug: 'frc-battery', name: '', x: 0, y: 300 });
  d = apply(d, { type: 'addDevice', slug: 'main-breaker-120a', name: '', x: 0, y: 150 });
  d = apply(d, { type: 'addDevice', slug: 'rev-pdh', name: '', x: 200, y: 0 });
  d = apply(d, { type: 'addDevice', slug: 'kraken-x60', name: '', x: 400, y: 0 });
  const wire = (a: string, ap: string, b: string, bp: string) =>
    (d = apply(d, { type: 'addWire', layer: 'power', from: { device: a, port: ap }, to: { device: b, port: bp } }));
  wire('d1', 'sb50_pos', 'd2', 'bat');
  wire('d2', 'aux', 'd3', 'batt_pos');
  wire('d1', 'sb50_neg', 'd3', 'batt_neg');
  wire('d3', 'ch4', 'd4', 'vbat_pos');
  const strokes = d.wires.map((w) => renderWirePaths(d, catalog, w).map((p) => p.stroke));
  expect(strokes).toEqual([['#cf222e'], ['#cf222e'], ['#0d1117'], ['#cf222e', '#0d1117']]);
});

test('a hidden label is left out of the export, for one device or all', async () => {
  const one = apply(doc(), { type: 'setTagHidden', ids: ['d2'], hidden: true });
  const svg1 = await exportSvg(one, catalog, 'all', realIcons);
  expect(svg1).not.toContain('>Shooter<');
  expect(svg1).toContain('>PDH<');
  const all = apply(doc(), { type: 'setHideTags', hidden: true });
  const svg2 = await exportSvg(all, catalog, 'all', realIcons);
  expect(svg2).not.toContain('>Shooter<');
  expect(svg2).not.toContain('>PDH<');
});

test('a device with a hidden label keeps wires out of its body only', () => {
  const d = apply(emptyDoc(), { type: 'addDevice', slug: 'kraken-x60', name: '', x: 0, y: 0 });
  const shown = keepOutBox(catalog, d.devices[0]);
  const hidden = keepOutBox(catalog, { ...d.devices[0], hideTag: true });
  expect(shown.h - hidden.h).toBe(12);
  expect(keepOutBox(catalog, d.devices[0], true).h).toBe(hidden.h);
});

test('two wires sharing a run are drawn in separate lanes', () => {
  let d = apply(emptyDoc(), { type: 'addDevice', slug: 'rev-pdh', name: '', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', slug: 'kraken-x60', name: '', x: 500, y: 0 });
  d = apply(d, { type: 'addDevice', slug: 'systemcore', name: '', x: 500, y: 250 });
  d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd1', port: 'ch4' }, to: { device: 'd2', port: 'vbat_pos' } });
  d = apply(d, { type: 'addWire', layer: 'can', from: { device: 'd1', port: 'can_a' }, to: { device: 'd3', port: 'can_s0' } });
  const shared = [{ x: 300, y: -80 }, { x: 300, y: 400 }];
  d = apply(d, { type: 'setBends', id: 'w1', bends: shared });
  d = apply(d, { type: 'setBends', id: 'w2', bends: shared });
  const vx = (pts: { x: number; y: number }[]) =>
    pts.slice(1).flatMap((p, i) => (p.x === pts[i].x && Math.abs(p.y - pts[i].y) > 300 ? [p.x] : []));
  const a = vx(wirePoints(d, catalog, d.wires[0])!);
  const b = vx(wirePoints(d, catalog, d.wires[1])!);
  expect(a.length && b.length).toBeTruthy();
  expect(a.some((x) => b.includes(x))).toBe(false);
});

test('a wire end set to leave upward leaves upward', () => {
  let d = apply(emptyDoc(), { type: 'addDevice', slug: 'rev-pdh', name: '', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', slug: 'kraken-x60', name: '', x: 300, y: 300 });
  d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd2', port: 'vbat_pos' }, to: { device: 'd1', port: 'ch4' } });
  d = apply(d, { type: 'setWireSide', id: 'w1', end: 'from', side: 'up' });
  const p = wirePoints(d, catalog, d.wires[0])!;
  expect(p[1].x).toBe(p[0].x);
  expect(p[1].y).toBeLessThan(p[0].y);
  expect(routeSides(p)).toEqual({ from: 'up', to: 'right' });
});
