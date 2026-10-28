import { apply } from '../model/actions';
import { emptyDoc, type Point } from '../model/types';
import { catalog } from '../test/fixtures';
import { wirePoints } from './scene';
import { savedBends } from './scene';

const shortRuns = (p: Point[]) => p.slice(1).filter((q, k) => Math.hypot(q.x - p[k].x, q.y - p[k].y) < 4).length;

test('wires with saved bends keep no short jogs after the motor moves a few mm', () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let jogged = 0;
  for (let k = 0; k < 200; k++) {
    let d = apply(emptyDoc(), { type: 'addDevice', slug: 'rev-pdh', name: '', x: 0, y: 0 });
    d = apply(d, { type: 'addDevice', slug: 'kraken-x60', name: '', x: 180 + rnd() * 100, y: 200 + rnd() * 100 });
    d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd1', port: 'ch4' }, to: { device: 'd2', port: 'vbat_pos' } });
    const path = wirePoints(d, catalog, d.wires[0])!;
    d = apply(d, { type: 'setBends', id: 'w1', bends: savedBends(d, catalog, d.wires[0], path.slice(1, -1)) });
    d = apply(d, { type: 'moveEach', moves: [{ id: 'd2', dx: (rnd() - 0.5) * 8, dy: (rnd() - 0.5) * 8 }] });
    if (shortRuns(wirePoints(d, catalog, d.wires[0])!)) jogged++;
  }
  expect(jogged).toBe(0);
});
