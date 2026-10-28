import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OP_EXAMPLES } from './ops';
import { TOOLS, toolsJson } from './tools';

test('the 11 tools of the spec', () => {
  expect(TOOLS.map((t) => t.name).sort()).toEqual([
    'auto_layout', 'check', 'edit', 'get_device_type', 'get_diagram', 'new_diagram', 'open_diagram', 'open_in_browser',
    'render', 'search_devices', 'undo_last_edit',
  ]);
});

test('every tool and op has a description and an example', () => {
  for (const t of TOOLS) {
    expect(t.description.length, t.name).toBeGreaterThan(20);
    expect(t.input.safeParse(t.example).success, t.name).toBe(true);
  }
  const json = toolsJson() as { ops: { op: string; description: string; example: unknown }[] };
  expect(json.ops.map((o) => o.op).sort()).toEqual(Object.keys(OP_EXAMPLES).sort());
  for (const o of json.ops) expect(o.description.length, o.op).toBeGreaterThan(10);
});

const file = join(import.meta.dirname, '../../public/api/tools.json');
test.skipIf(!existsSync(file))('toolsJson matches public/api/tools.json (run npm run build to update it)', () => {
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(toolsJson());
});
