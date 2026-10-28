// Daily usage totals from Railway's HTTP request log (scripts/usage.mjs runs `railway logs --http --json`).
// IP addresses are used only in memory, to count unique visitors; the result holds numbers only.
// Node runs this file directly, so it uses only type syntax that Node can strip.
export interface HttpRow {
  timestamp: string;
  method: string;
  path: string;
  httpStatus: number;
  srcIp: string;
  clientUa: string;
}

export interface DayTotals {
  day: string;
  visitors: number;
  visits: number;
  share: number;
  export: number;
  icon: number;
}

export interface Summary {
  days: DayTotals[];
  /** Unique visitors over all the days. */
  visitors: number;
}

const EVENTS = ['share', 'export', 'icon'] as const;
type Event = (typeof EVENTS)[number];
const ROBOT = /bot|crawl|spider|slurp|preview|curl|wget|python|go-http|node|headless|monitor|uptime/i;

/** A page of the app: a GET with no file extension outside /assets, /icons and /e that the server answered. */
function isVisit(r: HttpRow): boolean {
  return r.method === 'GET' && (r.httpStatus === 200 || r.httpStatus === 304)
    && !/^\/(assets|icons|e)\//.test(r.path) && !/\.[A-Za-z0-9]+$/.test(r.path);
}

function eventOf(r: HttpRow): Event | null {
  const m = r.method === 'POST' ? /^\/e\/([a-z]+)$/.exec(r.path) : null;
  return m && (EVENTS as readonly string[]).includes(m[1]) ? (m[1] as Event) : null;
}

export function summarize(rows: HttpRow[], timeZone: string): Summary {
  const dayOf = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const days = new Map<string, DayTotals & { ips: Set<string> }>();
  const all = new Set<string>();
  for (const r of rows) {
    if (ROBOT.test(r.clientUa)) continue;
    const event = eventOf(r);
    const visit = isVisit(r);
    if (!event && !visit) continue;
    const day = dayOf.format(new Date(r.timestamp));
    let d = days.get(day);
    if (!d) days.set(day, (d = { day, visitors: 0, visits: 0, share: 0, export: 0, icon: 0, ips: new Set() }));
    if (event) d[event]++;
    else d.visits++;
    d.ips.add(r.srcIp);
    all.add(r.srcIp);
  }
  return {
    days: [...days.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map(({ ips, ...d }) => ({ ...d, visitors: ips.size })),
    visitors: all.size,
  };
}
