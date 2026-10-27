import { BROKEN_KEY, DOC_KEY, loadSaved, saveDoc } from './autosave';
import { apply } from '../model/actions';
import { emptyDoc } from '../model/types';
import { catalog } from '../test/fixtures';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

test('a saved document loads back', () => {
  const s = memoryStorage();
  const doc = apply(emptyDoc(), { type: 'addDevice', slug: 'rev-pdh', name: 'PDH', x: 0, y: 0 });
  expect(saveDoc(s, doc)).toBe(true);
  expect(loadSaved(s, catalog)).toEqual({ doc, status: 'ok' });
});

test('nothing saved gives empty, and no storage gives unavailable', () => {
  expect(loadSaved(memoryStorage(), catalog)).toEqual({ doc: null, status: 'empty' });
  expect(loadSaved(null, catalog)).toEqual({ doc: null, status: 'unavailable' });
  expect(saveDoc(null, emptyDoc())).toBe(false);
});

test('a storage that throws on write makes saveDoc return false', () => {
  const s = memoryStorage();
  s.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
  expect(saveDoc(s, emptyDoc())).toBe(false);
});

test('a broken save is moved aside', () => {
  const s = memoryStorage();
  s.setItem(DOC_KEY, '{not json');
  expect(loadSaved(s, catalog)).toEqual({ doc: null, status: 'broken' });
  expect(s.getItem(BROKEN_KEY)).toBe('{not json');
  expect(s.getItem(DOC_KEY)).toBeNull();
});
