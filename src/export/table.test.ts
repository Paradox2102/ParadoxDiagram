import { apply } from '../model/actions';
import { emptyDoc, type Doc } from '../model/types';
import { catalog } from '../test/fixtures';
import { deviceTableCsv } from './table';

function rig(): Doc {
  let d = emptyDoc();
  d = apply(d, { type: 'addDevice', id: 'sc', slug: 'systemcore', name: '', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', id: 'pdh', slug: 'rev-pdh', name: 'PDH', x: 0, y: 200 });
  d = apply(d, { type: 'addDevice', id: 'fl', slug: 'kraken-x60-powerpole', name: 'Front left', x: 200, y: 0 });
  d = apply(d, { type: 'addDevice', id: 'fr', slug: 'kraken-x60-powerpole', name: 'Front right, "A"', x: 300, y: 0 });
  d = apply(d, { type: 'updateDevice', id: 'pdh', patch: { canId: 1 } });
  d = apply(d, { type: 'updateDevice', id: 'fl', patch: { canId: 11, notes: 'two\nlines', fields: [{ label: 'Gear', value: '6.75' }] } });
  d = apply(d, { type: 'updateDevice', id: 'fr', patch: { canId: 12 } });
  d = apply(d, { type: 'addWire', layer: 'can', from: { device: 'sc', port: 'can_s1' }, to: { device: 'fl', port: 'can_a' } });
  d = apply(d, { type: 'addWire', layer: 'can', from: { device: 'fl', port: 'can_b' }, to: { device: 'fr', port: 'can_a' } });
  d = apply(d, { type: 'addWire', id: 'p1', layer: 'power', from: { device: 'pdh', port: 'ch4' }, to: { device: 'fl', port: 'power' } });
  return apply(d, { type: 'updateWire', id: 'p1', patch: { fuseA: 40, awg: 12 } });
}

/** The CSV as rows of cells (enough of RFC 4180 for these tests). */
function parse(csv: string): string[][] {
  const rows: string[][] = [[]];
  let cell = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { rows.at(-1)!.push(cell); cell = ''; } else if (c === '\r' && csv[i + 1] === '\n') {
      rows.at(-1)!.push(cell); cell = ''; rows.push([]); i++;
    } else cell += c;
  }
  if (rows.at(-1)!.length === 0 && cell === '') rows.pop();
  return rows;
}

test('starts with a byte order mark and the header row, with a column for each custom field', () => {
  const csv = deviceTableCsv(rig(), catalog);
  expect(csv.startsWith('﻿Name,Device,Vendor,CAN bus,CAN ID,Power from,Fuse (A),Wire (AWG),IP,Notes,Gear\r\n')).toBe(true);
  expect(csv.endsWith('\r\n')).toBe(true);
});

test('a row has the bus, CAN ID, power channel, fuse, gauge and fields', () => {
  const rows = parse(deviceTableCsv(rig(), catalog).slice(1));
  const fl = rows.find((r) => r[0] === 'Front left')!;
  expect(fl).toEqual(['Front left', 'Kraken X60 + PowerPole Board', 'WestCoast Products', 'S1', '11', 'PDH 4', '40', '12', '', 'two\nlines', '6.75']);
});

test('rows sort by bus, then CAN ID; no bus found comes after the buses, and no CAN ID comes last', () => {
  const names = parse(deviceTableCsv(rig(), catalog).slice(1)).slice(1).map((r) => r[0]);
  expect(names).toEqual(['Front left', 'Front right, "A"', 'PDH', 'Limelight Systemcore (Beta hardware)']);
});

test('a comma, a quote and a line break are quoted', () => {
  const csv = deviceTableCsv(rig(), catalog);
  expect(csv).toContain('"Front right, ""A"""');
  expect(csv).toContain('"two\nlines"');
});
