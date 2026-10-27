import { buildShareUrl, decodeShare, encodeShare, needsConfirm, readIncoming, readShareHash, withoutShare } from './share';
import { catalog } from '../test/fixtures';
import { apply } from '../model/actions';
import { emptyDoc } from '../model/types';

function doc() {
  let d = apply(emptyDoc(), { type: 'addDevice', slug: 'rev-pdh', name: 'PDH', x: 0, y: 0 });
  d = apply(d, { type: 'addDevice', slug: 'kraken-x60', name: 'Shooter ü', x: 200, y: 0 });
  d = apply(d, { type: 'addWire', layer: 'power', from: { device: 'd1', port: 'ch4' }, to: { device: 'd2', port: 'vbat_pos' } });
  return apply(d, { type: 'setTitle', title: 'Swerve & shooter' });
}

test('a diagram survives encode and decode, as URL-safe text', async () => {
  const code = await encodeShare(doc());
  expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(await decodeShare(code)).toEqual(doc());
});

test('the code is much shorter than the JSON', async () => {
  let d = emptyDoc();
  for (let i = 0; i < 40; i++) d = apply(d, { type: 'addDevice', slug: 'kraken-x60', name: `Motor ${i}`, x: i * 10, y: 0 });
  expect((await encodeShare(d)).length).toBeLessThan(JSON.stringify(d).length / 3);
});

test('a damaged code gives a clear error', async () => {
  await expect(decodeShare('not-a-real-code')).rejects.toThrow('The share link is damaged or incomplete.');
});

test('the share code and the layer live together in the hash', () => {
  expect(buildShareUrl('https://x.test/app/', 'abc', 'all')).toBe('https://x.test/app/#share=abc');
  expect(buildShareUrl('https://x.test/', 'abc', 'can')).toBe('https://x.test/#share=abc&layer=can');
  expect(readShareHash('#share=abc&layer=can')).toBe('abc');
  expect(readShareHash('#layer=can&share=abc')).toBe('abc');
  expect(readShareHash('#layer=can')).toBeNull();
  expect(withoutShare('#share=abc&layer=can')).toBe('#layer=can');
  expect(withoutShare('#share=abc')).toBe('');
});

describe('readIncoming', () => {
  test('no share in the hash gives null', async () => {
    expect(await readIncoming('#layer=can', catalog)).toBeNull();
  });
  test('a good share gives the checked diagram', async () => {
    const code = await encodeShare(doc());
    expect(await readIncoming(`#share=${code}`, catalog)).toEqual({ doc: doc(), droppedWires: 0 });
  });
  test('a damaged share or a share of the wrong shape gives an error', async () => {
    expect(await readIncoming('#share=AAAA', catalog)).toEqual({ error: 'The share link is damaged or incomplete.' });
    const notADoc = await encodeShare({ hello: 1 } as never);
    expect(await readIncoming(`#share=${notADoc}`, catalog)).toEqual({ error: 'format is not paradox-diagram' });
  });
});

test('an empty diagram is replaced without asking; a diagram with content asks first', () => {
  expect(needsConfirm(emptyDoc())).toBe(false);
  expect(needsConfirm(doc())).toBe(true);
});
