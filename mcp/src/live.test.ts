import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { apply } from '../../src/model/actions';
import { diffDocs } from '../../src/model/patch';
import type { Doc } from '../../src/model/types';
import { CLOSE_BAD_TOKEN, CLOSE_PROTOCOL, LIVE_PROTOCOL, type ServerMessage } from '../../src/live/protocol';
import { loadNodeCatalog } from './catalog';
import { startLive, type LiveHandle } from './live';
import { DiagramStore } from './store';

const SITE = 'https://diagram.team2102.org';
const catalog = loadNodeCatalog();
let store: DiagramStore;
let live: LiveHandle;

beforeEach(async () => {
  store = new DiagramStore(catalog);
  store.create(join(mkdtempSync(join(tmpdir(), 'pd-live-')), 'r.paradox.json'));
  store.commit(apply(store.doc, { type: 'addDevice', id: 'pdh', slug: 'rev-pdh', name: '', x: 0, y: 0 }), 'ai');
  live = await startLive(store, { port: 0, site: SITE, version: '9.9.9' });
});
afterEach(() => live.close());

/** A client that keeps every message it gets. */
function client(origin = SITE) {
  const ws = new WebSocket(`ws://127.0.0.1:${live.port}/live`, { origin });
  const got: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (m) => {
    got.push(JSON.parse(String(m)));
    waiters.splice(0).forEach((w) => w());
  });
  const next = (pred: (m: ServerMessage) => boolean) =>
    new Promise<ServerMessage>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout; got ${JSON.stringify(got)}`)), 2000);
      const check = () => {
        const m = got.find(pred);
        if (m) {
          clearTimeout(t);
          got.splice(got.indexOf(m), 1);
          resolve(m);
        } else waiters.push(check);
      };
      check();
    });
  const open = new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('unexpected-response', (_, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    ws.on('error', reject);
  });
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  const send = (m: unknown) => ws.send(JSON.stringify(m));
  return { ws, got, next, open, closed, send };
}

async function joined() {
  const c = client();
  await c.open;
  c.send({ t: 'hello', token: live.token, protocol: LIVE_PROTOCOL, app: '1.1.0' });
  await c.next((m) => m.t === 'welcome');
  return c;
}

test('good hello gets welcome with the doc and rev', async () => {
  const c = client();
  await c.open;
  c.send({ t: 'hello', token: live.token, protocol: LIVE_PROTOCOL, app: '1.1.0' });
  const w = await c.next((m) => m.t === 'welcome');
  expect(w).toMatchObject({ t: 'welcome', rev: store.rev, file: store.file, server: '9.9.9' });
  expect((w as { doc: Doc }).doc.devices.map((d) => d.id)).toEqual(['pdh']);
  c.ws.close();
});

test('wrong token closes 4401', async () => {
  const c = client();
  await c.open;
  c.send({ t: 'hello', token: 'nope', protocol: LIVE_PROTOCOL, app: '1.1.0' });
  expect(await c.closed).toBe(CLOSE_BAD_TOKEN);
});

test('an action before hello closes 4401', async () => {
  const c = client();
  await c.open;
  c.send({ t: 'action', seq: 1, action: { type: 'restore', patch: diffDocs(store.doc, store.doc) } });
  expect(await c.closed).toBe(CLOSE_BAD_TOKEN);
});

test('wrong origin gets 403', async () => {
  await expect(client('https://evil.example').open).rejects.toThrow('HTTP 403');
});

test('a localhost origin is allowed (development and the local app)', async () => {
  await client('http://localhost:5180').open;
  await client(`http://127.0.0.1:${live.port}`).open;
});

test('wrong protocol closes 4426 with a message', async () => {
  const c = client();
  await c.open;
  c.send({ t: 'hello', token: live.token, protocol: 99, app: '3.0.0' });
  const e = await c.next((m) => m.t === 'error');
  expect(e).toMatchObject({ code: CLOSE_PROTOCOL });
  expect((e as { message: string }).message).toMatch(/npx @paradox2102\/diagram-mcp@latest/);
  expect(await c.closed).toBe(CLOSE_PROTOCOL);
});

test('a tab action is applied and both clients get the doc; only the sender gets seq', async () => {
  const a = await joined();
  const b = await joined();
  const next = apply(store.doc, { type: 'moveDevices', ids: ['pdh'], dx: 50, dy: 0 });
  a.send({ t: 'action', seq: 7, action: { type: 'restore', patch: diffDocs(store.doc, next) } });
  const da = await a.next((m) => m.t === 'doc');
  const db = await b.next((m) => m.t === 'doc');
  expect(da).toMatchObject({ by: 'tab', seq: 7 });
  expect(db).toMatchObject({ by: 'tab' });
  expect(db).not.toHaveProperty('seq');
  expect(store.doc.devices[0].x).toBe(50);
  a.ws.close();
  b.ws.close();
});

test('an AI commit reaches both clients', async () => {
  const a = await joined();
  const b = await joined();
  expect(live.clients()).toBe(2);
  store.commit(apply(store.doc, { type: 'setTitle', title: 'From AI' }), 'ai');
  for (const c of [a, b]) expect(await c.next((m) => m.t === 'doc')).toMatchObject({ by: 'ai', doc: { title: 'From AI' } });
  a.ws.close();
  b.ws.close();
});

test('a patch on a removed device gets reject then doc', async () => {
  const a = await joined();
  const moved = apply(store.doc, { type: 'moveDevices', ids: ['pdh'], dx: 50, dy: 0 });
  const patch = diffDocs(store.doc, moved);
  store.commit(apply(store.doc, { type: 'delete', ids: ['pdh'] }), 'ai');
  await a.next((m) => m.t === 'doc');
  a.send({ t: 'action', seq: 3, action: { type: 'restore', patch } });
  expect(await a.next((m) => m.t === 'reject')).toMatchObject({ seq: 3, error: 'pdh was removed by the other side' });
  const d = await a.next((m) => m.t === 'doc');
  expect((d as { doc: Doc }).doc.devices).toHaveLength(0);
  a.ws.close();
});

test('revisions arrive in order under 50 mixed AI and tab edits', async () => {
  const a = await joined();
  for (let i = 0; i < 50; i++) {
    if (i % 2) store.commit(apply(store.doc, { type: 'setTitle', title: `ai ${i}` }), 'ai');
    else a.send({ t: 'action', seq: i, action: { type: 'restore', patch: { devices: [], wires: [], remove: [], added: [], title: `tab ${i}` } } });
  }
  const revs: number[] = [];
  while (revs.length < 50) revs.push(((await a.next((m) => m.t === 'doc')) as { rev: number }).rev);
  expect([...revs].sort((x, y) => x - y)).toEqual(revs);
  a.ws.close();
});

test('a port that is in use gives the --port 0 message', async () => {
  await expect(startLive(store, { port: live.port, site: SITE, version: '1' })).rejects.toThrow(
    `port ${live.port} is in use; start with --port 0 to pick a free port`,
  );
});

test('links carry the port and token', () => {
  expect(live.link()).toBe(`${SITE}/#live=${live.port}.${live.token}`);
  expect(live.localLink()).toBe(`http://127.0.0.1:${live.port}/#live=${live.port}.${live.token}`);
  expect(live.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
});
