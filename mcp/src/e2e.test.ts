// The built server over stdio, driven by the SDK's own client, builds the example robot with the tools only.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Doc } from '../../src/model/types';
import { validateDoc } from '../../src/model/validate';
import { loadNodeCatalog } from './catalog';
import type { Op } from './ops';

const root = join(import.meta.dirname, '../..');
const file = join(mkdtempSync(join(tmpdir(), 'pd-e2e-')), 'robot.paradox.json');
let client: Client;

beforeAll(async () => {
  execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--logLevel', 'error'], { cwd: join(root, 'mcp') });
  client = new Client({ name: 'e2e', version: '1' });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [join(root, 'mcp/dist/server.js'), '--file', file, '--port', '0'],
    env: { ...process.env, PARADOX_NO_BROWSER: '1' } as Record<string, string>, stderr: 'ignore',
  }));
}, 60_000);
afterAll(() => client?.close());

type Content = { type: string; text?: string; data?: string; mimeType?: string }[];
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { error: !!r.isError, content: r.content as Content, text: (r.content as Content).filter((c) => c.type === 'text').map((c) => c.text).join('\n') };
};

test('the server lists its tools and has instructions', async () => {
  const { tools } = await client.listTools();
  expect(tools).toHaveLength(11);
  expect(client.getInstructions()).toMatch(/search_devices/);
  const { prompts } = await client.listPrompts();
  expect(prompts.map((p) => p.name)).toEqual(['build_robot_diagram']);
});

test('builds the example robot with the tools only', async () => {
  const found = await call('search_devices', { query: 'pdh' });
  expect(found.text).toMatch(/rev-pdh/);

  const ex = JSON.parse(readFileSync(join(root, 'examples/example-robot.paradox.json'), 'utf8')) as Doc;
  const ops: Op[] = [
    ...ex.devices.map((d): Op => ({ op: 'add_device', slug: d.slug, id: d.id, name: d.name, ...(d.canId !== null ? { can_id: d.canId } : {}) })),
    ...ex.wires.map((w): Op => ({ op: 'connect', id: w.id, from: `${w.from.device}.${w.from.port}`, to: `${w.to.device}.${w.to.port}` })),
  ];
  const edit = await call('edit', { ops });
  expect(edit.error, edit.text).toBe(false);
  expect(edit.text).toMatch(/revision \d+/);

  expect((await call('auto_layout')).error).toBe(false);
  const check = await call('check');
  expect(check.text).not.toMatch(/overlap|unknown device/);

  const render = await call('render');
  const img = render.content.find((c) => c.type === 'image')!;
  expect(img.mimeType).toBe('image/png');
  const png = Buffer.from(img.data!, 'base64');
  expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect(png.readUInt32BE(16)).toBeLessThanOrEqual(1600);

  const saved = validateDoc(JSON.parse(readFileSync(file, 'utf8')), loadNodeCatalog());
  expect(saved.droppedWires).toBe(0);
  expect(saved.doc.devices).toHaveLength(ex.devices.length);

  const before = JSON.parse(readFileSync(file, 'utf8')) as Doc;
  expect((await call('undo_last_edit')).error).toBe(false);
  const after = JSON.parse(readFileSync(file, 'utf8')) as Doc;
  expect(after.devices.every((d) => d.x === 0 && d.y === 0)).toBe(true);
  expect(before.devices.some((d) => d.x !== 0 || d.y !== 0)).toBe(true);
}, 60_000);

test('open_in_browser gives the live links', async () => {
  const r = await call('open_in_browser');
  expect(r.error, r.text).toBe(false);
  expect(r.text).toMatch(/https:\/\/diagram\.team2102\.org\/#live=\d+\.[A-Za-z0-9_-]{22}/);
  expect(r.text).toMatch(/http:\/\/127\.0\.0\.1:\d+\/#live=/);
});

test('an error comes back as an error result, not a protocol error', async () => {
  const r = await call('edit', { ops: [{ op: 'connect', from: 'nope.x', to: 'd1.ch4' }] });
  expect(r.error).toBe(true);
  expect(r.text).toMatch(/^op 1 \(connect\): no device "nope"/);
});

test('the server stops when the AI client closes its stdin', async () => {
  const child = spawn(process.execPath, [join(root, 'mcp/dist/server.js'), '--port', '0'], { stdio: ['pipe', 'ignore', 'ignore'] });
  await new Promise((r) => setTimeout(r, 500));
  const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  child.stdin.end();
  const code = await Promise.race([exited, new Promise<string>((r) => setTimeout(() => r('still running'), 3000))]);
  if (code === 'still running') child.kill();
  expect(code).toBe(0);
});
