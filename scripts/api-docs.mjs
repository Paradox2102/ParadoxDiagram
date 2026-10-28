// Write public/api/tools.json (the /api page's tool reference) from the built MCP server's own tool definitions.
// Run after the server is built (npm run build does both).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = execFileSync(process.execPath, [join(root, 'mcp/dist/server.js'), '--dump-tools'], { encoding: 'utf8' });
writeFileSync(join(root, 'public/api/tools.json'), json);
