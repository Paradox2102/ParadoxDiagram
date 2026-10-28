import { loadTarget, readLiveHash, saveTarget, withoutLive } from './link';

test('readLiveHash parses port.token', () => {
  expect(readLiveHash('#live=5199.AbC_d-0123456789abcdefgh')).toEqual({ port: 5199, token: 'AbC_d-0123456789abcdefgh' });
  expect(readLiveHash('#layer=can&live=6000.abcdefghijklmnopqrstuv')).toEqual({ port: 6000, token: 'abcdefghijklmnopqrstuv' });
});

test.each(['', '#share=abc', '#live=', '#live=99999.abcdefghijklmnopqrstuv', '#live=0.abcdefghijklmnopqrstuv', '#live=5199.short', '#live=5199.has space in it now ok', '#live=x.abcdefghijklmnopqrstuv'])(
  'readLiveHash rejects %j',
  (hash) => expect(readLiveHash(hash)).toBeNull(),
);

test('withoutLive keeps the other parts of the hash', () => {
  expect(withoutLive('#live=5199.abcdefghijklmnopqrstuv')).toBe('');
  expect(withoutLive('#layer=can&live=5199.abcdefghijklmnopqrstuv')).toBe('#layer=can');
});

test('the target survives in session storage', () => {
  saveTarget(sessionStorage, { port: 5199, token: 'abcdefghijklmnopqrstuv' });
  expect(loadTarget(sessionStorage)).toEqual({ port: 5199, token: 'abcdefghijklmnopqrstuv' });
  saveTarget(sessionStorage, null);
  expect(loadTarget(sessionStorage)).toBeNull();
});
