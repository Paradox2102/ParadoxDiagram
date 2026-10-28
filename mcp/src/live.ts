// The live link: a WebSocket server on 127.0.0.1 that browser tabs of the app connect to. A tab must come from the
// site (or localhost) and must know the token from the link. It gets the diagram, sends its edits as patches, and
// gets every change, from the AI or another tab, as the whole diagram with its revision number.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { applyPatch } from '../../src/model/patch';
import {
  CLOSE_BAD_TOKEN, CLOSE_PROTOCOL, LIVE_PATH, LIVE_PROTOCOL, type ServerMessage, type TabMessage,
} from '../../src/live/protocol';
import type { DiagramStore } from './store';
import type { LiveLinks } from './tools';

export interface LiveHandle extends LiveLinks {
  port: number;
  token: string;
  close(): Promise<void>;
}

export interface LiveOptions {
  port: number;
  /** The site origin that may connect, for example https://diagram.team2102.org. */
  site: string;
  /** This server's version, sent in welcome and in a version error. */
  version: string;
  /** Serves other GET requests (the local copy of the app); default 404. */
  serve?: (req: IncomingMessage, res: ServerResponse) => void;
}

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const MAX_FRAME = 4 * 1024 * 1024;
/** A socket that has not said hello by then is closed. */
const HELLO_MS = 10_000;

const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function startLive(store: DiagramStore, opts: LiveOptions): Promise<LiveHandle> {
  const token = randomBytes(16).toString('base64url');
  const clients = new Set<WebSocket>();
  const sockets = new Set<WebSocket>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });
  const http = createServer((req, res) => {
    if (opts.serve) return opts.serve(req, res);
    res.writeHead(404).end();
  });

  const send = (ws: WebSocket, m: ServerMessage) => ws.send(JSON.stringify(m));
  // the tab whose action is being applied: only it gets the seq of the change
  let sender: WebSocket | null = null;

  const unsubscribe = store.onChange((e) => {
    for (const ws of clients) {
      send(ws, { t: 'doc', rev: e.rev, doc: e.doc, by: e.by, ...(ws === sender && e.seq !== undefined ? { seq: e.seq } : {}) });
    }
  });

  http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const origin = req.headers.origin ?? '';
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path !== LIVE_PATH) {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    if (origin !== opts.site && !LOCAL_ORIGIN.test(origin)) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      let joined = false;
      sockets.add(ws);
      const hello = setTimeout(() => ws.close(CLOSE_BAD_TOKEN, 'no hello'), HELLO_MS);
      ws.on('message', (raw) => {
        let m: TabMessage;
        try {
          m = JSON.parse(String(raw));
        } catch {
          ws.close(1003, 'not JSON');
          return;
        }
        if (!joined) {
          if (m.t !== 'hello' || typeof m.token !== 'string' || !sameToken(m.token, token)) {
            ws.close(CLOSE_BAD_TOKEN, 'bad token');
            return;
          }
          if (m.protocol !== LIVE_PROTOCOL) {
            send(ws, {
              t: 'error', code: CLOSE_PROTOCOL,
              message: `This AI server is version ${opts.version} and the site is version ${m.app}. Update it with npx @paradox2102/diagram-mcp@latest.`,
            });
            ws.close(CLOSE_PROTOCOL, 'protocol');
            return;
          }
          joined = true;
          clearTimeout(hello);
          clients.add(ws);
          send(ws, { t: 'welcome', rev: store.rev, doc: store.doc, file: store.file, server: opts.version });
          return;
        }
        if (m.t !== 'action' || m.action?.type !== 'restore') return;
        const { doc, error } = applyPatch(store.doc, m.action.patch);
        if (error) {
          send(ws, { t: 'reject', seq: m.seq, error });
          send(ws, { t: 'doc', rev: store.rev, doc: store.doc, by: 'ai' });
          return;
        }
        sender = ws;
        try {
          store.commit(doc, 'tab', m.seq);
        } finally {
          sender = null;
        }
      });
      ws.on('close', () => {
        clearTimeout(hello);
        clients.delete(ws);
        sockets.delete(ws);
      });
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    http.once('error', (e: NodeJS.ErrnoException) =>
      reject(e.code === 'EADDRINUSE' ? new Error(`port ${opts.port} is in use; start with --port 0 to pick a free port`) : e));
    http.listen(opts.port, '127.0.0.1', () => {
      const a = http.address();
      resolve(typeof a === 'object' && a ? a.port : opts.port);
    });
  });

  const fragment = `#live=${port}.${token}`;
  return {
    port,
    token,
    link: () => `${opts.site}/${fragment}`,
    localLink: () => `http://127.0.0.1:${port}/${fragment}`,
    clients: () => clients.size,
    close: () =>
      new Promise<void>((resolve) => {
        unsubscribe();
        for (const ws of sockets) ws.terminate();
        wss.close();
        http.close(() => resolve());
        http.closeAllConnections();
      }),
  };
}
