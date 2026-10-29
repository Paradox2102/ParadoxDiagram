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

test('get_diagram shows each CANivore its bus, and the title block team and revision', async () => {
  const { apply } = await import('../../src/model/actions');
  const { emptyDoc } = await import('../../src/model/types');
  const { loadNodeCatalog } = await import('./catalog');
  const { diagramSummary } = await import('./tools');
  let doc = emptyDoc();
  doc = apply(doc, { type: 'addDevice', id: 'cv1', slug: 'canivore', name: '', x: 0, y: 0 });
  doc = apply(doc, { type: 'addDevice', id: 'cv2', slug: 'canivore', name: '', x: 200, y: 0 });
  doc = apply(doc, { type: 'setDetails', team: '2102 Paradox', revision: 'B' });
  const ctx = { store: { doc, rev: 3, file: '/r.json' }, catalog: loadNodeCatalog() } as unknown as Parameters<typeof diagramSummary>[0];
  const s = diagramSummary(ctx);
  expect(s.devices.map((d) => d.can_bus)).toEqual(['CANivore 1', 'CANivore 2']);
  expect(s.title_block).toEqual({ team: '2102 Paradox', revision: 'B' });
});
