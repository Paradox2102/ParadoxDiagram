import { apply } from './actions';
import { emptyDoc, type Doc } from './types';
import { deviceTag } from './tags';
import { catalog } from '../test/fixtures';

function doc(): Doc {
  let d = apply(emptyDoc(), { type: 'addDevice', slug: 'rev-pdh', name: 'PDH', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', slug: 'talon-fxs', name: '', x: 200, y: 0 });
  d = apply(d, { type: 'addDevice', slug: 'kraken-x60-powerpole', name: 'Motor B', x: 300, y: 0 });
  return d;
}

test('a CAN ID shows as CAN <id> and an empty name falls back to the icon name', () => {
  const d = apply(doc(), { type: 'updateDevice', id: 'd2', patch: { canId: 12 } });
  expect(deviceTag(d, 'd2', catalog)).toEqual({ name: 'Talon FXS', facts: 'CAN 12' });
});

test('two power wires from PDH channels read PDH 4/5 in channel order', () => {
  let d = doc();
  d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd1', port: 'ch5' }, to: { device: 'd2', port: 'vbat_pos' } });
  d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd2', port: 'vbat_neg' }, to: { device: 'd1', port: 'ch4' } });
  expect(deviceTag(d, 'd2', catalog).facts).toBe('PDH 4/5');
});

test('CAN ID and PDH channel join with a middle dot', () => {
  let d = apply(doc(), { type: 'updateDevice', id: 'd2', patch: { canId: 3 } });
  d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd1', port: 'ch9' }, to: { device: 'd2', port: 'vbat_pos' } });
  expect(deviceTag(d, 'd2', catalog).facts).toBe('CAN 3  ·  PDH 9');
});

test('CAN wires and motor-to-motor power wires add no PDH channel', () => {
  let d = doc();
  d = apply(d, { type: 'addWire', layer: 'can', from: { device: 'd1', port: 'can_a' }, to: { device: 'd2', port: 'can' } });
  d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd2', port: 'stator_a' }, to: { device: 'd3', port: 'power' } });
  expect(deviceTag(d, 'd2', catalog).facts).toBe('');
  expect(deviceTag(d, 'd3', catalog)).toEqual({ name: 'Motor B', facts: '' });
});
