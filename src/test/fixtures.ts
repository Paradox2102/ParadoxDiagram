import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCatalog } from '../catalog/catalog';

export const catalog = parseCatalog(
  JSON.parse(readFileSync(join(import.meta.dirname, '../../public/icons/index.json'), 'utf8')),
);
