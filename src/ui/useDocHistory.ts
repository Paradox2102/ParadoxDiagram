// The document and its undo history. A gesture (a drag) previews documents without history
// and adds one undo step when it ends.
import { useCallback, useMemo, useRef, useState } from 'react';
import { apply, type Action } from '../model/actions';
import { commit, HISTORY_LIMIT, initHistory, redo, undo, type History } from '../model/history';
import type { Doc } from '../model/types';

export interface DocHistory {
  doc: Doc;
  canUndo: boolean;
  canRedo: boolean;
  change: (a: Action) => void;
  replace: (doc: Doc) => void;
  begin: () => Doc;
  preview: (doc: Doc) => void;
  end: (base: Doc) => void;
  undo: () => void;
  redo: () => void;
}

export function useDocHistory(initial: Doc): DocHistory {
  const [h, setH] = useState<History>(() => initHistory(initial));
  const ref = useRef(h);
  ref.current = h;

  const set = useCallback((f: (h: History) => History) => {
    setH((prev) => {
      const next = f(prev);
      ref.current = next;
      return next;
    });
  }, []);

  const api = useMemo(
    () => ({
      change: (a: Action) => set((x) => commit(x, apply(x.present, a))),
      replace: (doc: Doc) => set((x) => commit(x, doc)),
      begin: () => ref.current.present,
      preview: (doc: Doc) => set((x) => ({ ...x, present: doc })),
      end: (base: Doc) =>
        set((x) =>
          x.present === base ? x : { past: [...x.past, base].slice(-HISTORY_LIMIT), present: x.present, future: [] },
        ),
      undo: () => set(undo),
      redo: () => set(redo),
    }),
    [set],
  );

  return { doc: h.present, canUndo: h.past.length > 0, canRedo: h.future.length > 0, ...api };
}
