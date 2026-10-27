import type { Doc } from './types';

export const HISTORY_LIMIT = 100;

export interface History {
  past: Doc[];
  present: Doc;
  future: Doc[];
}

export const initHistory = (doc: Doc): History => ({ past: [], present: doc, future: [] });

export function commit(h: History, doc: Doc): History {
  if (doc === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: doc, future: [] };
}

export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
