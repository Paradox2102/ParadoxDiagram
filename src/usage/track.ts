// Usage counts: a share, an export or an icon download sends one empty request to /e/<event>. Caddy answers 204, and
// the host's request log is where the counts come from (scripts/usage.mjs). Nothing about the diagram or the person is
// sent. The local copies (the MCP server's copy on 127.0.0.1, the dev server) send nothing.
export type UsageEvent = 'share' | 'export' | 'icon';

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|.+\.localhost)$/;

export function track(
  event: UsageEvent,
  loc: { hostname: string } = window.location,
  nav: { sendBeacon?: (url: string) => boolean } = navigator,
): void {
  if (LOCAL.test(loc.hostname) || !nav.sendBeacon) return;
  try {
    nav.sendBeacon(`/e/${event}`);
  } catch {
    // a blocked beacon only loses one count
  }
}
