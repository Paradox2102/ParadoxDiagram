// The live link in the address: #live=<port>.<token>. The part after # never reaches a web server. The tab keeps the
// target in session storage, so a reload of the tab connects again without asking.
export interface LiveTarget {
  port: number;
  token: string;
}

export const LIVE_KEY = 'paradox-diagram:live';
const PART = /^live=(\d{1,5})\.([A-Za-z0-9_-]{16,64})$/;

export function readLiveHash(hash: string): LiveTarget | null {
  for (const part of hash.replace(/^#/, '').split('&')) {
    const m = PART.exec(part);
    if (!m) continue;
    const port = Number(m[1]);
    if (port >= 1 && port <= 65535) return { port, token: m[2] };
  }
  return null;
}

/** The hash with the live part taken out (the layer stays). */
export function withoutLive(hash: string): string {
  const rest = hash.replace(/^#/, '').split('&').filter((p) => p && !p.startsWith('live='));
  return rest.length ? `#${rest.join('&')}` : '';
}

export function saveTarget(storage: Storage | null, t: LiveTarget | null): void {
  try {
    if (t) storage?.setItem(LIVE_KEY, `${t.port}.${t.token}`);
    else storage?.removeItem(LIVE_KEY);
  } catch {
    // no session storage (blocked site data): a reload asks again, which is safe
  }
}

export function loadTarget(storage: Storage | null): LiveTarget | null {
  try {
    const v = storage?.getItem(LIVE_KEY);
    return v ? readLiveHash(`#live=${v}`) : null;
  } catch {
    return null;
  }
}
