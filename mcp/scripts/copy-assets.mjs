// Copy what the package carries: the icon collection (assets/icons), and with --app the built app (assets/app),
// which the server serves on 127.0.0.1 for browsers that block the public site's live link.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const copy = (from, to) => {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
};
if (process.argv.includes('--app')) {
  const dist = join(here, '../../dist');
  if (!existsSync(join(dist, 'index.html'))) throw new Error('build the app first (vite build)');
  copy(dist, join(here, '../assets/app'));
} else {
  copy(join(here, '../../public/icons'), join(here, '../assets/icons'));
}
