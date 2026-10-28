// The app, served by the MCP server at http://127.0.0.1:<port>/ for a browser that will not let the public site
// connect to 127.0.0.1. Static files only, the same headers as the hosted site; any page path gets index.html.
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const CSP =
  "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
  "connect-src 'self' ws://127.0.0.1:* blob: data:; font-src 'self' data:; object-src 'none'; base-uri 'self'; " +
  "form-action 'none'; frame-ancestors 'none'";

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
};

export function serveApp(dir: string) {
  const root = resolve(dir);
  return async (req: IncomingMessage, res: ServerResponse) => {
    const headers = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, headers).end();
      return;
    }
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.writeHead(400, headers).end();
      return;
    }
    const file = resolve(join(root, path));
    const inside = file === root || file.startsWith(root + sep);
    const send = async (f: string) => {
      const body = await readFile(f);
      res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    try {
      if (inside && extname(file)) return await send(file);
    } catch {
      // not a file: a missing asset is 404 below, a page path gets the app
    }
    if (inside && /^\/(assets|icons|api)\//.test(path) && extname(file)) {
      res.writeHead(404, headers).end();
      return;
    }
    await send(join(root, 'index.html'));
  };
}
