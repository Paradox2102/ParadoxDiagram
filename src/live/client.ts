// The tab's side of the live link: connect to the MCP server on 127.0.0.1, say hello with the token, and pass the
// messages on. When the connection drops it tries again after 1, 2, 4 and 8 s, then every 10 s, for 2 minutes.
import type { Doc } from '../model/types';
import type { DocPatch } from '../model/patch';
import type { LiveTarget } from './link';
import { CLOSE_BAD_TOKEN, CLOSE_PROTOCOL, LIVE_PATH, LIVE_PROTOCOL, type ServerMessage, type TabMessage } from './protocol';

export type LiveState = 'connecting' | 'connected' | 'reconnecting' | 'stopped';

export interface LiveHandlers {
  onWelcome(m: { rev: number; doc: Doc; file: string | null; server: string }): void;
  onDoc(m: { rev: number; doc: Doc; by: 'ai' | 'tab'; seq?: number }): void;
  onReject(error: string): void;
  onState(state: LiveState): void;
  /** The server refused this tab for good (a bad token, or a version mismatch). */
  onFatal(message: string): void;
}

const DELAYS_MS = [1000, 2000, 4000, 8000];
const EVERY_MS = 10_000;
const GIVE_UP_MS = 120_000;

export function connectLive(
  target: LiveTarget, h: LiveHandlers, app: string, WS: typeof WebSocket = WebSocket,
): { send(patch: DocPatch): void; close(): void } {
  let ws: WebSocket | null = null;
  let joined = false;
  let ended = false;
  let attempt = 0;
  let failingSince: number | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  let fatal: string | null = null;
  const queue: DocPatch[] = [];
  let state: LiveState | null = null;
  const setState = (s: LiveState) => {
    if (s !== state) h.onState((state = s));
  };

  const write = (m: TabMessage) => ws?.send(JSON.stringify(m));
  const flush = () => {
    while (joined && queue.length) write({ t: 'action', seq: ++seq, action: { type: 'restore', patch: queue.shift()! } });
  };
  const stop = () => {
    ended = true;
    clearTimeout(timer);
    setState('stopped');
  };

  const open = () => {
    const sock = new WS(`ws://127.0.0.1:${target.port}${LIVE_PATH}`);
    ws = sock;
    joined = false;
    sock.onopen = () => write({ t: 'hello', token: target.token, protocol: LIVE_PROTOCOL, app });
    sock.onmessage = (e: MessageEvent) => {
      if (sock !== ws) return;
      let m: ServerMessage;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === 'welcome') {
        joined = true;
        attempt = 0;
        failingSince = null;
        setState('connected');
        h.onWelcome(m);
        flush();
      } else if (m.t === 'doc') h.onDoc(m);
      else if (m.t === 'reject') h.onReject(m.error);
      else if (m.t === 'error') fatal = m.message;
    };
    sock.onclose = (e: CloseEvent) => {
      if (sock !== ws || ended) return;
      joined = false;
      if (e.code === CLOSE_PROTOCOL || e.code === CLOSE_BAD_TOKEN) {
        h.onFatal(
          e.code === CLOSE_PROTOCOL
            ? fatal ?? 'The AI server is another version. Update it with npx @paradox2102/diagram-mcp@latest.'
            : 'This live link is not valid any more. Ask the AI for a new one (open_in_browser).',
        );
        stop();
        return;
      }
      const now = Date.now();
      failingSince ??= now;
      if (now - failingSince >= GIVE_UP_MS) {
        stop();
        return;
      }
      setState('reconnecting');
      timer = setTimeout(open, DELAYS_MS[attempt++] ?? EVERY_MS);
    };
  };

  setState('connecting');
  open();
  return {
    send(patch) {
      if (ended) return;
      queue.push(patch);
      flush();
    },
    close() {
      stop();
      ws?.close();
    },
  };
}
