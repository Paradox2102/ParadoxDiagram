import { connectLive, type LiveHandlers, type LiveState } from './client';
import { CLOSE_PROTOCOL } from './protocol';
import { emptyDoc } from '../model/types';
import type { DocPatch } from '../model/patch';

class FakeWS {
  static all: FakeWS[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeWS.all.push(this);
  }
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {
    this.readyState = 3;
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  msg(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const target = { port: 5199, token: 'abcdefghijklmnopqrstuv' };
const patch: DocPatch = { devices: [], wires: [], remove: [], added: [], title: 'T' };
function setup() {
  FakeWS.all = [];
  const states: LiveState[] = [];
  const h = {
    onWelcome: vi.fn(), onDoc: vi.fn(), onReject: vi.fn(), onFatal: vi.fn(),
    onState: (s: LiveState) => states.push(s),
  } satisfies LiveHandlers;
  const c = connectLive(target, h, '1.1.0', FakeWS as unknown as typeof WebSocket);
  return { c, h, states, ws: () => FakeWS.all[FakeWS.all.length - 1] };
}

afterEach(() => vi.useRealTimers());

test('client connects to 127.0.0.1, sends hello first, then actions with seq', () => {
  const { c, h, ws } = setup();
  expect(ws().url).toBe('ws://127.0.0.1:5199/live');
  c.send(patch); // before welcome: kept until the server says welcome
  ws().open();
  expect(ws().sent).toEqual([{ t: 'hello', token: target.token, protocol: 1, app: '1.1.0' }]);
  ws().msg({ t: 'welcome', rev: 3, doc: emptyDoc(), file: '/x', server: '1.1.0' });
  expect(h.onWelcome).toHaveBeenCalledWith(expect.objectContaining({ rev: 3 }));
  c.send(patch);
  expect(ws().sent.slice(1)).toEqual([
    { t: 'action', seq: 1, action: { type: 'restore', patch } },
    { t: 'action', seq: 2, action: { type: 'restore', patch } },
  ]);
});

test('doc and reject reach their handlers', () => {
  const { h, ws } = setup();
  ws().open();
  ws().msg({ t: 'welcome', rev: 1, doc: emptyDoc(), file: null, server: '1' });
  ws().msg({ t: 'doc', rev: 2, doc: emptyDoc(), by: 'ai' });
  ws().msg({ t: 'reject', seq: 1, error: 'x was removed by the other side' });
  expect(h.onDoc).toHaveBeenCalledWith(expect.objectContaining({ rev: 2 }));
  expect(h.onReject).toHaveBeenCalledWith('x was removed by the other side');
});

test('client reconnect backoff, then stopped after 2 minutes', () => {
  vi.useFakeTimers();
  const { states, ws } = setup();
  ws().open();
  ws().msg({ t: 'welcome', rev: 1, doc: emptyDoc(), file: null, server: '1' });
  expect(states).toEqual(['connecting', 'connected']);
  ws().drop();
  expect(states.at(-1)).toBe('reconnecting');
  const n = FakeWS.all.length;
  vi.advanceTimersByTime(999);
  expect(FakeWS.all.length).toBe(n);
  vi.advanceTimersByTime(1);
  expect(FakeWS.all.length).toBe(n + 1);
  // keep failing: 2, 4, 8 s, then every 10 s, until 2 minutes have passed
  for (let i = 0; i < 30; i++) {
    ws().drop();
    vi.advanceTimersByTime(10_000);
  }
  expect(states.at(-1)).toBe('stopped');
  const made = FakeWS.all.length;
  vi.advanceTimersByTime(60_000);
  expect(FakeWS.all.length).toBe(made);
});

test('a reconnect that says welcome again is connected', () => {
  vi.useFakeTimers();
  const { states, ws } = setup();
  ws().open();
  ws().msg({ t: 'welcome', rev: 1, doc: emptyDoc(), file: null, server: '1' });
  ws().drop();
  vi.advanceTimersByTime(1000);
  ws().open();
  ws().msg({ t: 'welcome', rev: 5, doc: emptyDoc(), file: null, server: '1' });
  expect(states.at(-1)).toBe('connected');
});

test('4426 gives onFatal with the update text and no reconnect', () => {
  vi.useFakeTimers();
  const { h, states, ws } = setup();
  ws().open();
  ws().msg({ t: 'error', code: CLOSE_PROTOCOL, message: 'Update it with npx @paradox2102/diagram-mcp@latest.' });
  ws().drop(CLOSE_PROTOCOL);
  expect(h.onFatal).toHaveBeenCalledWith('Update it with npx @paradox2102/diagram-mcp@latest.');
  expect(states.at(-1)).toBe('stopped');
  const n = FakeWS.all.length;
  vi.advanceTimersByTime(20_000);
  expect(FakeWS.all.length).toBe(n);
});

test('4401 gives onFatal about the link', () => {
  const { h, ws } = setup();
  ws().open();
  ws().drop(4401);
  expect(h.onFatal).toHaveBeenCalledWith(expect.stringMatching(/link is not valid/));
});

test('close stops it for good', () => {
  vi.useFakeTimers();
  const { c, states, ws } = setup();
  ws().open();
  c.close();
  ws().drop();
  vi.advanceTimersByTime(20_000);
  expect(FakeWS.all).toHaveLength(1);
  expect(states.at(-1)).toBe('stopped');
});
