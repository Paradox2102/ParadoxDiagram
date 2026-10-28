// Usage report: daily totals of visitors, page visits, shares, exports and icon downloads, from Railway's HTTP log.
// Usage: npm run usage [-- --days 7]   (needs the Railway CLI, logged in, in this folder: it is linked to the project)
// It prints numbers only. IP addresses stay in memory to count unique visitors; they are never printed or saved.
// Railway keeps the log for a limited time, so a long --days shows only what is left.
import { execFileSync } from 'node:child_process';
import { summarize } from '../src/usage/summary.ts';

const SERVICE = 'ParadoxDiagram';
const CAP = 5000; // the most lines `railway logs` returns in one call
const at = process.argv.indexOf('--days');
const days = at > 0 ? Number(process.argv[at + 1]) : 7;
if (!Number.isInteger(days) || days < 1) {
  console.error('usage: npm run usage [-- --days <whole number of days>]');
  process.exit(2);
}

const railway = (args) => execFileSync('railway', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
const since = Date.now() - days * 86_400_000;

// Each release is a new deployment with its own log: take those made in the window and the one serving at its start.
const deployments = JSON.parse(railway(['deployment', 'list', '--service', SERVICE, '--json', '--limit', '100']))
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const first = deployments.findIndex((d) => Date.parse(d.createdAt) < since);
const wanted = first < 0 ? deployments : deployments.slice(0, first + 1);

const rows = [];
for (const d of wanted) {
  for (const method of ['GET', 'POST']) {
    const out = railway(['logs', '--service', SERVICE, '--http', '--json', '--since', `${days}d`, '--lines', String(CAP),
      `--filter=@method:${method}`, d.id]);
    const lines = out.split('\n').filter((l) => l.startsWith('{'));
    if (lines.length >= CAP) console.warn(`warning: ${method} log of deployment ${d.id.slice(0, 8)} hit ${CAP} lines; use fewer --days`);
    for (const l of lines) rows.push(JSON.parse(l));
  }
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const s = summarize(rows.filter((r) => Date.parse(r.timestamp) >= since), timeZone);
const cols = ['day', 'visitors', 'visits', 'share', 'export', 'icon'];
console.log(`Paradox Diagram usage, last ${days} days (${timeZone})`);
console.log(cols.map((c) => c.padStart(10)).join(''));
for (const d of s.days) console.log(cols.map((c) => String(d[c]).padStart(10)).join(''));
const sum = (k) => s.days.reduce((n, d) => n + d[k], 0);
console.log(['total', s.visitors, sum('visits'), sum('share'), sum('export'), sum('icon')].map((v) => String(v).padStart(10)).join(''));
console.log('visitors: unique IP addresses that loaded a page or used a feature (robots left out); total counts each once.');
