import { applyTheme, nextTheme, readTheme } from './theme';

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

test('the switch cycles System, Light, Dark', () => {
  expect(nextTheme('system')).toBe('light');
  expect(nextTheme('light')).toBe('dark');
  expect(nextTheme('dark')).toBe('system');
});

test('a picked theme is kept and set on the page; System clears both', () => {
  const s = memory();
  applyTheme('dark', s);
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(readTheme(s)).toBe('dark');
  applyTheme('system', s);
  expect(document.documentElement.dataset.theme).toBeUndefined();
  expect(s.m.size).toBe(0);
  expect(readTheme(s)).toBe('system');
});

test('a bad or unreadable saved value means System', () => {
  expect(readTheme({ getItem: () => 'purple' })).toBe('system');
  expect(readTheme({ getItem: () => { throw new Error('blocked'); } })).toBe('system');
  expect(readTheme(null)).toBe('system');
});
