import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveApp } from './app-server';

let server: Server;
let base: string;
const dir = mkdtempSync(join(tmpdir(), 'pd-app-'));
writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
mkdirSync(join(dir, 'icons'));
writeFileSync(join(dir, 'icons/index.json'), '{"icons":[]}');
writeFileSync(join(tmpdir(), 'pd-secret.txt'), 'secret');

beforeAll(async () => {
  server = createServer(serveApp(dir));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

test('GET / returns the app with the CSP that allows the live link', async () => {
  const res = await fetch(`${base}/`);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toMatch(/text\/html/);
  expect(res.headers.get('content-security-policy')).toMatch(/connect-src 'self' ws:\/\/127\.0\.0\.1:\*/);
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(await res.text()).toMatch(/id="root"/);
});

test('GET /icons/index.json returns JSON', async () => {
  const res = await fetch(`${base}/icons/index.json`);
  expect(res.headers.get('content-type')).toMatch(/application\/json/);
});

test('a page path (/gallery, /api) gets the app', async () => {
  for (const p of ['/gallery', '/api']) expect(await (await fetch(base + p)).text()).toMatch(/id="root"/);
});

test('a missing file under /icons is 404, and no path leaves the app folder', async () => {
  expect((await fetch(`${base}/icons/nope.svg`)).status).toBe(404);
  const res = await fetch(`${base}/..%2fpd-secret.txt`);
  expect(await res.text()).not.toBe('secret');
});

test('only GET and HEAD', async () => {
  expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(405);
});
