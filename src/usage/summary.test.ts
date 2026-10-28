import { summarize, type HttpRow } from './summary';

const row = (over: Partial<HttpRow>): HttpRow => ({
  timestamp: '2026-11-02T18:00:00Z', method: 'GET', path: '/', httpStatus: 200, srcIp: '203.0.113.1',
  clientUa: 'Mozilla/5.0 Firefox/159.0', ...over,
});

test('a day counts page visits, unique visitors and each kind of use', () => {
  const s = summarize([
    row({}),
    row({ path: '/gallery', httpStatus: 304 }),
    row({ srcIp: '203.0.113.2', path: '/api' }),
    row({ method: 'POST', path: '/e/share', httpStatus: 204 }),
    row({ method: 'POST', path: '/e/export', httpStatus: 204, srcIp: '203.0.113.3' }),
    row({ method: 'POST', path: '/e/icon', httpStatus: 204 }),
    row({ method: 'POST', path: '/e/icon', httpStatus: 204 }),
  ], 'UTC');
  expect(s.days).toEqual([{ day: '2026-11-02', visitors: 3, visits: 3, share: 1, export: 1, icon: 2 }]);
  expect(s.visitors).toBe(3);
});

test('files, missing pages, the header check ping and robots are not counted', () => {
  const s = summarize([
    row({ path: '/assets/index-D0S01u6h.js' }),
    row({ path: '/icons/power/rev/rev-pdh.svg' }),
    row({ path: '/logo.svg' }),
    row({ path: '/', httpStatus: 404 }),
    row({ method: 'POST', path: '/e/check', httpStatus: 204 }),
    row({ clientUa: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }),
    row({ clientUa: 'curl/8.7.1' }),
  ], 'UTC');
  expect(s.days).toEqual([]);
  expect(s.visitors).toBe(0);
});

test('days follow the time zone, and the week total counts a visitor once', () => {
  const s = summarize([
    row({ timestamp: '2026-11-03T06:00:00Z' }),
    row({ timestamp: '2026-11-03T20:00:00Z' }),
  ], 'America/Los_Angeles');
  expect(s.days.map((d) => [d.day, d.visitors])).toEqual([['2026-11-02', 1], ['2026-11-03', 1]]);
  expect(s.visitors).toBe(1);
});

test('the result holds no IP address', () => {
  expect(JSON.stringify(summarize([row({})], 'UTC'))).not.toContain('203.0.113');
});
