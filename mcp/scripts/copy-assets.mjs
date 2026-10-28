// Copy the icon collection into the package (assets/icons), so the server works without the repo.
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const to = join(here, '../assets/icons');
rmSync(to, { recursive: true, force: true });
cpSync(join(here, '../../public/icons'), to, { recursive: true });
