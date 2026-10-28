// The icon collection as the package carries it (assets/icons, copied in at build time).
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCatalog, type Catalog } from '../../src/catalog/catalog';

/** The package's assets folder: beside src/ in the repo, beside dist/ when installed. */
export const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const ICONS = join(ASSETS, 'icons');

export function loadNodeCatalog(): Catalog {
  return parseCatalog(JSON.parse(readFileSync(join(ICONS, 'index.json'), 'utf8')));
}

/** An icon's SVG text by its path in the index, or null (missing, or outside the icons folder). */
export async function iconTextNode(path: string): Promise<string | null> {
  const full = resolve(ICONS, path);
  if (!full.startsWith(ICONS + sep)) return null;
  try {
    return await readFile(full, 'utf8');
  } catch {
    return null;
  }
}
