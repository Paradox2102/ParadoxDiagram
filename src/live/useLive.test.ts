import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { useRef } from 'react';
import { apply } from '../model/actions';
import { emptyDoc, type Doc } from '../model/types';
import { useDocHistory } from '../ui/useDocHistory';
import { autosaveAllowed, useLive, type LiveSend } from './useLive';
import { LIVE_KEY } from './link';

class FakeWS {
  static all: FakeWS[] = [];
  sent: { t: string; action?: { patch: { title?: string } } }[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeWS.all.push(this);
  }
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {}
}
const last = () => FakeWS.all[FakeWS.all.length - 1];
const TOKEN = 'abcdefghijklmnopqrstuv';
const aiDoc = (): Doc => apply(emptyDoc(), { type: 'addDevice', id: 'pdh', slug: 'rev-pdh', name: 'From AI', x: 0, y: 0 });

function mount(start: Doc, strict = false) {
  return renderHook(() => {
    const send = useRef<LiveSend | null>(null);
    const hist = useDocHistory(start, { onLocal: (b, a) => send.current?.(b, a) });
    const live = useLive(hist, send, { WS: FakeWS as unknown as typeof WebSocket, storage: sessionStorage });
    return { hist, live };
  }, strict ? { wrapper: StrictMode } : undefined);
}

function welcome() {
  act(() => {
    last().onopen?.();
    last().onmessage?.({ data: JSON.stringify({ t: 'welcome', rev: 1, doc: aiDoc(), file: '/r.json', server: '1.1.0' }) });
  });
}

beforeEach(() => {
  FakeWS.all = [];
  sessionStorage.clear();
  history.replaceState(null, '', '/');
});

test('a live link on an empty diagram connects at once and takes the AI diagram', () => {
  history.replaceState(null, '', `/#live=5199.${TOKEN}`);
  const { result } = mount(emptyDoc());
  expect(window.location.hash).toBe('');
  expect(result.current.live.pending).toBeNull();
  expect(last().url).toBe('ws://127.0.0.1:5199/live');
  welcome();
  expect(result.current.live.state).toBe('connected');
  expect(result.current.hist.live).toBe(true);
  expect(result.current.hist.doc.devices[0].name).toBe('From AI');
  expect(sessionStorage.getItem(LIVE_KEY)).toBe(`5199.${TOKEN}`);
});

test('a live link on a diagram with work asks first', () => {
  history.replaceState(null, '', `/#live=5199.${TOKEN}`);
  const { result } = mount(aiDoc());
  expect(result.current.live.pending).toEqual({ port: 5199, token: TOKEN });
  expect(FakeWS.all).toHaveLength(0);
  act(() => result.current.live.accept());
  expect(FakeWS.all).toHaveLength(1);
});

test('decline keeps the local diagram and forgets the link', () => {
  history.replaceState(null, '', `/#live=5199.${TOKEN}`);
  const { result } = mount(aiDoc());
  act(() => result.current.live.decline());
  expect(result.current.live.pending).toBeNull();
  expect(FakeWS.all).toHaveLength(0);
  expect(sessionStorage.getItem(LIVE_KEY)).toBeNull();
});

test('a reload with the stored target connects without the banner', () => {
  sessionStorage.setItem(LIVE_KEY, `5199.${TOKEN}`);
  const { result } = mount(aiDoc());
  expect(result.current.live.pending).toBeNull();
  expect(FakeWS.all).toHaveLength(1);
});

test('a local edit sends a patch; a remote doc does not', () => {
  history.replaceState(null, '', `/#live=5199.${TOKEN}`);
  const { result } = mount(emptyDoc());
  welcome();
  const before = last().sent.length;
  act(() => last().onmessage?.({ data: JSON.stringify({ t: 'doc', rev: 2, doc: { ...aiDoc(), title: 'AI title' }, by: 'ai' }) }));
  expect(result.current.hist.doc.title).toBe('AI title');
  expect(last().sent.length).toBe(before);
  act(() => result.current.hist.change({ type: 'setTitle', title: 'Mine' }));
  expect(last().sent.at(-1)).toMatchObject({ t: 'action', action: { patch: { title: 'Mine' } } });
});

test('leave ends live mode and lets autosave run again', () => {
  history.replaceState(null, '', `/#live=5199.${TOKEN}`);
  const { result } = mount(emptyDoc());
  welcome();
  expect(autosaveAllowed(result.current.live.state)).toBe(false);
  act(() => result.current.live.leave());
  expect(result.current.live.state).toBeNull();
  expect(result.current.hist.live).toBe(false);
  expect(autosaveAllowed(result.current.live.state)).toBe(true);
  expect(sessionStorage.getItem(LIVE_KEY)).toBeNull();
});

test('autosave pauses while live, and runs when stopped', () => {
  expect(autosaveAllowed(null)).toBe(true);
  expect(autosaveAllowed('connecting')).toBe(false);
  expect(autosaveAllowed('reconnecting')).toBe(false);
  expect(autosaveAllowed('stopped')).toBe(true);
});

test('a reject shows its message', () => {
  history.replaceState(null, '', `/#live=5199.${TOKEN}`);
  const { result } = mount(emptyDoc());
  welcome();
  act(() => last().onmessage?.({ data: JSON.stringify({ t: 'reject', seq: 1, error: 'pdh was removed by the other side' }) }));
  expect(result.current.live.message).toBe('pdh was removed by the other side');
});

test('under StrictMode a live link on an empty diagram connects and keeps its target', () => {
  history.replaceState(null, '', `/#live=5199.${TOKEN}`);
  const { result } = mount(emptyDoc(), true);
  welcome();
  expect(result.current.live.state).toBe('connected');
  expect(sessionStorage.getItem(LIVE_KEY)).toBe(`5199.${TOKEN}`);
});

test('under StrictMode a reload with the stored target connects', () => {
  sessionStorage.setItem(LIVE_KEY, `5199.${TOKEN}`);
  const { result } = mount(aiDoc(), true);
  welcome();
  expect(result.current.live.state).toBe('connected');
  expect(sessionStorage.getItem(LIVE_KEY)).toBe(`5199.${TOKEN}`);
});

test('a new live link while connected switches to it and keeps the new target', () => {
  history.replaceState(null, '', `/#live=5199.${TOKEN}`);
  const { result } = mount(emptyDoc());
  welcome();
  act(() => {
    history.replaceState(null, '', `/#live=6000.${TOKEN}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  expect(result.current.live.pending).toEqual({ port: 6000, token: TOKEN });
  act(() => result.current.live.accept());
  expect(last().url).toBe('ws://127.0.0.1:6000/live');
  expect(sessionStorage.getItem(LIVE_KEY)).toBe(`6000.${TOKEN}`);
  expect(result.current.live.state).not.toBe('stopped');
});

test('replaceLocally leaves live mode first, so New, Open and a share link never change the AI file', () => {
  history.replaceState(null, '', `/#live=5199.${TOKEN}`);
  const { result } = mount(emptyDoc());
  welcome();
  const sent = last().sent.length;
  act(() => result.current.live.replaceLocally(emptyDoc()));
  expect(last().sent.length).toBe(sent);
  expect(result.current.live.state).toBeNull();
  expect(result.current.hist.live).toBe(false);
  expect(result.current.hist.doc.devices).toHaveLength(0);
});

test('replaceLocally out of live mode is a plain replace', () => {
  const { result } = mount(aiDoc());
  act(() => result.current.live.replaceLocally(emptyDoc()));
  expect(result.current.hist.doc.devices).toHaveLength(0);
  expect(result.current.hist.canUndo).toBe(true);
});
