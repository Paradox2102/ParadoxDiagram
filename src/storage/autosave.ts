// The last layout, kept in this browser's localStorage.
import type { Catalog } from '../catalog/catalog';
import type { Doc } from '../model/types';
import { validateDoc } from '../model/validate';

export const DOC_KEY = 'paradox-diagram:doc';
export const BROKEN_KEY = 'paradox-diagram:doc:broken';
export const AUTOSAVE_MS = 400;

export type LoadStatus = 'ok' | 'empty' | 'broken' | 'unavailable';

/** localStorage, or null when the browser refuses access (private window, blocked site data). */
export function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = `${DOC_KEY}:probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadSaved(storage: Storage | null, catalog: Catalog | null): { doc: Doc | null; status: LoadStatus } {
  if (!storage) return { doc: null, status: 'unavailable' };
  let raw: string | null;
  try {
    raw = storage.getItem(DOC_KEY);
  } catch {
    return { doc: null, status: 'unavailable' };
  }
  if (raw === null) return { doc: null, status: 'empty' };
  try {
    return { doc: validateDoc(JSON.parse(raw), catalog).doc, status: 'ok' };
  } catch {
    try {
      storage.setItem(BROKEN_KEY, raw);
      storage.removeItem(DOC_KEY);
    } catch {
      // nothing more to do: the app starts empty either way
    }
    return { doc: null, status: 'broken' };
  }
}

export function saveDoc(storage: Storage | null, doc: Doc): boolean {
  if (!storage) return false;
  try {
    storage.setItem(DOC_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}
