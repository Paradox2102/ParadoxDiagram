import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => JSON.parse(readFileSync(join(import.meta.dirname, '../..', p), 'utf8'));
const validate = new Ajv2020({ strict: false }).compile(read('public/api/schema.json'));

test('the example robot validates against schema.json', () => {
  expect(validate(read('examples/example-robot.paradox.json')), JSON.stringify(validate.errors)).toBe(true);
});

test('the new fields validate, and bad values do not', () => {
  const ex = read('examples/example-robot.paradox.json');
  ex.devices[4] = { ...ex.devices[4], ip: '10.21.2.1', canBus: 'S1', fields: [{ label: 'Firmware', value: '1.2', onLabel: true }] };
  ex.wires[3] = { ...ex.wires[3], fuseA: 40, awg: 12 };
  expect(validate(ex), JSON.stringify(validate.errors)).toBe(true);
  ex.devices[4].ip = '10.21.2';
  expect(validate(ex)).toBe(false);
});
