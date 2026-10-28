// The server reads its icons from mcp/assets/icons, which the build copies in.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export default function setup() {
  execFileSync(process.execPath, [join(import.meta.dirname, '../scripts/copy-assets.mjs')]);
}
