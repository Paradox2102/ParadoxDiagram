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

test('the channel names the device it comes from: PDP, PowerHub (PH), MPM or VRM', () => {
  const feeds = (slug: string, port: string) => {
    let d = apply(emptyDoc(), { type: 'addDevice', slug, name: 'Feeder', x: 0, y: 0 });
    d = apply(d, { type: 'addDevice', slug: 'limelight-4', name: '', x: 200, y: 0 });
    d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd1', port }, to: { device: 'd2', port: 'pwr_pos' } });
    return deviceTag(d, 'd2', catalog).facts;
  };
  expect(feeds('rev-pdh', 'ch4')).toBe('PDH 4');
  expect(feeds('ctre-pdp', 'ch2')).toBe('PDP 2');
  expect(feeds('thrifty-powerhub', 'ch7')).toBe('PH 7');
  expect(feeds('rev-mpm', 'ch1')).toBe('MPM 1');
  expect(feeds('ctre-vrm', 'v12_2a_1')).toBe('VRM 12V/2A');
  expect(feeds('ctre-vrm', 'v5_500ma_2')).toBe('VRM 5V/500mA');
});

test('a device fed from two kinds of device lists both', () => {
  let d = apply(emptyDoc(), { type: 'addDevice', slug: 'rev-pdh', name: '', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', slug: 'rev-mpm', name: '', x: 0, y: 300 });
  d = apply(d, { type: 'addDevice', slug: 'talon-fxs', name: '', x: 200, y: 0 });
  d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd1', port: 'ch12' }, to: { device: 'd3', port: 'vbat_pos' } });
  d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd2', port: 'ch3' }, to: { device: 'd3', port: 'vbat_neg' } });
  expect(deviceTag(d, 'd3', catalog).facts).toBe('PDH 12  ·  MPM 3');
});
