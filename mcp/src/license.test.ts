// The npm package ships its own copy of the license: npm packs LICENSE from the package folder, not the repo root.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../package.json' with { type: 'json' };

const root = join(__dirname, '..', '..');

test('the package is MIT and its LICENSE is the same as the repo LICENSE', () => {
  expect(pkg.license).toBe('MIT');
  const repo = readFileSync(join(root, 'LICENSE'), 'utf8');
  expect(repo).toMatch(/^MIT License/);
  expect(readFileSync(join(root, 'mcp', 'LICENSE'), 'utf8')).toBe(repo);
});
