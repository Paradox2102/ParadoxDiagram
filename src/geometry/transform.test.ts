import { catalog } from '../test/fixtures';
import { deviceBounds, portWorld } from './transform';
import type { Device } from '../model/types';

const pdh = catalog.bySlug.get('rev-pdh')!;
const ch9 = pdh.anchors.find((a) => a.port === 'ch9')!;
const dev = (rot: Device['rot']): Device => ({ id: 'd1', slug: 'rev-pdh', x: 0, y: 0, rot, name: '', canId: null, notes: '' });

test('a port on the right side of an unrotated icon leaves to the right', () => {
  const { p, dir } = portWorld(dev(0), pdh, ch9);
  expect(dir).toBe('right');
  // body view -10 -6 131 235.5: local (113, 19.3) sits at world (123, 25.3)
  expect(p.x).toBeCloseTo(123);
  expect(p.y).toBeCloseTo(25.3);
});

test('rotation by 90 turns the port about the body view centre and points it down', () => {
  const { p, dir } = portWorld(dev(90), pdh, ch9);
  expect(dir).toBe('down');
  expect(p.x).toBeCloseTo(157.95);
  expect(p.y).toBeCloseTo(175.25);
});

test('bounds swap width and height at 90 degrees about the centre', () => {
  expect(deviceBounds(dev(0), pdh)).toEqual({ x: 0, y: 0, w: 131, h: 235.5 });
  const b = deviceBounds(dev(90), pdh);
  expect(b.w).toBeCloseTo(235.5);
  expect(b.h).toBeCloseTo(131);
  expect(b.x + b.w / 2).toBeCloseTo(65.5);
  expect(b.y + b.h / 2).toBeCloseTo(117.75);
});
