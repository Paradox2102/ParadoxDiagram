// Copies the FRC icon collection from a PrettyDocs checkout into public/icons.
// The copy is committed, so the app builds without the other repos.
// index.json gets each icon's body_view (the drawing frame without the caption) from the
// collection's anchors.json, because the diagram draws icons the way the poster does.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';

const src = process.env.ICONS_SRC ?? join(homedir(), 'PrettyDocs', 'public', 'icons');
const anchorsSrc = process.env.ANCHORS_SRC ?? join(homedir(), 'systemcore', 'wiring', 'assets', 'anchors.json');
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
cpSync(join(src, 'LICENSE.md'), join(dst, 'LICENSE.md'));

const index = JSON.parse(readFileSync(join(src, 'index.json'), 'utf8'));
const anchors = JSON.parse(readFileSync(anchorsSrc, 'utf8'));
for (const icon of index.icons) {
  const body = anchors[icon.slug]?.body_view;
  if (!body) {
    console.error(`${icon.slug}: no body_view in ${anchorsSrc} (set ANCHORS_SRC)`);
    process.exit(1);
  }
  icon.body_view = body;
}
writeFileSync(join(dst, 'index.json'), JSON.stringify(index, null, 1) + '\n');
console.log(`${svgs} icons`);
