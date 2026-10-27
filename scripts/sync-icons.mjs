// Copies the FRC icon collection from a PrettyDocs checkout into public/icons.
// The copy is committed, so the app builds without the other repos.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';

const src = process.env.ICONS_SRC ?? join(homedir(), 'PrettyDocs', 'public', 'icons');
const dst = join(import.meta.dirname, '..', 'public', 'icons');
if (!existsSync(join(src, 'index.json'))) {
  console.error(`no index.json in ${src} (set ICONS_SRC)`);
  process.exit(1);
}
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });

let svgs = 0;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.svg')) {
      const out = join(dst, relative(src, path));
      mkdirSync(join(out, '..'), { recursive: true });
      cpSync(path, out);
      svgs++;
    }
  }
}
walk(src);
for (const name of ['index.json', 'LICENSE.md']) cpSync(join(src, name), join(dst, name));
console.log(`${svgs} icons`);
