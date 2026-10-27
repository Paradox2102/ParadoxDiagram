import { readLayerHash } from './useLayerHash';

test('the layer comes from #layer= and falls back to all', () => {
  expect(readLayerHash('#layer=can')).toBe('can');
  expect(readLayerHash('#layer=air')).toBe('air');
  expect(readLayerHash('#layer=bogus')).toBe('all');
  expect(readLayerHash('')).toBe('all');
});
