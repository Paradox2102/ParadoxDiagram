import { track } from './track';

const nav = () => ({ sendBeacon: vi.fn(() => true) });

test('the public site sends one empty beacon to /e/<event>', () => {
  const n = nav();
  track('share', { hostname: 'diagram.team2102.org' }, n);
  expect(n.sendBeacon).toHaveBeenCalledTimes(1);
  expect(n.sendBeacon).toHaveBeenCalledWith('/e/share');
});

test('a local copy (MCP server, dev server) sends nothing', () => {
  for (const hostname of ['127.0.0.1', 'localhost', '[::1]', 'app.localhost']) {
    const n = nav();
    track('export', { hostname }, n);
    expect(n.sendBeacon).not.toHaveBeenCalled();
  }
});

test('a browser with no sendBeacon, or one that throws, does not break the app', () => {
  expect(() => track('icon', { hostname: 'diagram.team2102.org' }, {})).not.toThrow();
  const bad = { sendBeacon: vi.fn(() => { throw new Error('blocked'); }) };
  expect(() => track('icon', { hostname: 'diagram.team2102.org' }, bad)).not.toThrow();
});
