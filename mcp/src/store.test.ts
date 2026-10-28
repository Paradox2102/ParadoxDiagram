import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../../src/model/actions';
import { validateDoc } from '../../src/model/validate';
import { loadNodeCatalog } from './catalog';
import { DiagramStore, resolvePath } from './store';

const catalog = loadNodeCatalog();
const dir = () => mkdtempSync(join(tmpdir(), 'pd-store-'));

test('create then open round-trips', () => {
  const d = dir();
  const s = new DiagramStore(catalog);
  const file = s.create(join(d, 'robot.paradox.json'), 'Robot');
  expect(file).toBe(join(d, 'robot.paradox.json'));
  s.commit(apply(s.doc, { type: 'addDevice', id: 'pdh', slug: 'rev-pdh', name: '', x: 0, y: 0 }), 'ai');
  const t = new DiagramStore(catalog);
  expect(t.open(file)).toEqual({ file, droppedWires: 0 });
  expect(t.doc.title).toBe('Robot');
  expect(t.doc.devices.map((x) => x.id)).toEqual(['pdh']);
});

test('create refuses an existing file', () => {
  const f = join(dir(), 'x.paradox.json');
  writeFileSync(f, '{}');
  expect(() => new DiagramStore(catalog).create(f)).toThrow(/already exists/);
});

test('open reports dropped wires and a bad file', () => {
  const f = join(dir(), 'bad.paradox.json');
  writeFileSync(f, 'not json');
  expect(() => new DiagramStore(catalog).open(f)).toThrow(/bad\.paradox\.json/);
});

test('commit increments rev, saves the file and calls listeners', () => {
  const s = new DiagramStore(catalog);
  const file = s.create(join(dir(), 'r.paradox.json'));
  const seen: unknown[] = [];
  s.onChange((e) => seen.push([e.rev, e.by, e.seq]));
  const r0 = s.rev;
  const rev = s.commit(apply(s.doc, { type: 'setTitle', title: 'A' }), 'tab', 7);
  expect(rev).toBe(r0 + 1);
  expect(seen).toEqual([[r0 + 1, 'tab', 7]]);
  expect(validateDoc(JSON.parse(readFileSync(file, 'utf8')), catalog).doc.title).toBe('A');
  expect(s.commit(s.doc, 'ai')).toBe(r0 + 1);
});

test('the file write is atomic: no .tmp is left after the save', () => {
  const d = dir();
  const s = new DiagramStore(catalog);
  s.create(join(d, 'r.paradox.json'));
  s.commit(apply(s.doc, { type: 'setTitle', title: 'B' }), 'ai');
  expect(readdirSync(d)).toEqual(['r.paradox.json']);
});

test('commit without a file is an error that says what to do', () => {
  const s = new DiagramStore(catalog);
  expect(() => s.requireFile()).toThrow('No diagram is open. Call new_diagram or open_diagram first.');
});

test('resolvePath expands ~/ and relative paths', () => {
  expect(resolvePath('~/robot.paradox.json')).toBe(join(homedir(), 'robot.paradox.json'));
  expect(resolvePath('robot.paradox.json')).toBe(join(process.cwd(), 'robot.paradox.json'));
  expect(resolvePath('/abs/r.json')).toBe('/abs/r.json');
});

test('undoAi reverses only the AI step', () => {
  const s = new DiagramStore(catalog);
  s.create(join(dir(), 'u.paradox.json'));
  const before = s.doc;
  const after = apply(before, { type: 'addDevice', id: 'pdh', slug: 'rev-pdh', name: '', x: 0, y: 0 });
  s.commit(after, 'ai');
  s.pushAiStep(before, after);
  s.commit(apply(s.doc, { type: 'setTitle', title: 'Typed in the tab' }), 'tab');
  expect(s.undoAi()).toBe(true);
  expect(s.doc.devices).toHaveLength(0);
  expect(s.doc.title).toBe('Typed in the tab');
  expect(s.undoAi()).toBe(false);
  expect(existsSync(s.file!)).toBe(true);
});
