// The document and its undo history. A gesture (a drag) previews documents without history
// and adds one undo step when it ends.
//
// Live mode (the AI's diagram, shared over the live link): documents from the other side arrive with remote(),
// which adds no undo step, and undo / redo reverse only this tab's own edits, as patches on the current document.
import { useMemo, useRef, useState } from 'react';
import { apply, type Action } from '../model/actions';
import { commit, HISTORY_LIMIT, initHistory, redo, undo, type History } from '../model/history';
import { applyPatch, diffDocs } from '../model/patch';
import type { Doc } from '../model/types';

export interface DocHistory {
  doc: Doc;
  canUndo: boolean;
  canRedo: boolean;
  live: boolean;
  change: (a: Action) => void;
  replace: (doc: Doc) => void;
  begin: () => Doc;
  preview: (doc: Doc) => void;
  end: (base: Doc) => void;
  undo: () => void;
  redo: () => void;
  /** A document from the other side of the live link: no undo step; during a gesture it waits for the end. */
  remote: (doc: Doc) => void;
  /** Turn live mode on or off; either way the undo and redo stacks start empty. */
  setLive: (on: boolean) => void;
}

export interface DocHistoryOptions {
  /** Called after each local edit that changed the document (not for remote documents). */
  onLocal?: (before: Doc, after: Doc) => void;
}

interface Step {
  before: Doc;
  after: Doc;
}

interface State {
  h: History;
  live: boolean;
  steps: Step[];
  undone: Step[];
  /** True between begin() and end(). */
  gesture: boolean;
  /** The newest remote document that arrived during a gesture. */
  pending: Doc | null;
}

const withPresent = (s: State, doc: Doc): State => ({ ...s, h: { ...s.h, present: doc } });

/** `initial` can be a function, so the first document is built once (it reads browser storage). */
export function useDocHistory(initial: Doc | (() => Doc), opts: DocHistoryOptions = {}): DocHistory {
  const [state, setState] = useState<State>(() => ({
    h: initHistory(typeof initial === 'function' ? initial() : initial),
    live: false, steps: [], undone: [], gesture: false, pending: null,
  }));
  // the ref is the truth between renders, so calls in one event see each other's results
  const ref = useRef(state);
  const onLocal = useRef(opts.onLocal);
  onLocal.current = opts.onLocal;

  const api = useMemo(() => {
    const set = (next: State) => {
      ref.current = next;
      setState(next);
    };
    /** Record a local edit from before to after (one undo step), show `present`, and tell the listener. */
    const local = (before: Doc, after: Doc, present = after) => {
      const s = ref.current;
      if (after === before) return;
      if (s.live) {
        set({ ...withPresent(s, present), steps: [...s.steps, { before, after }].slice(-HISTORY_LIMIT), undone: [] });
      } else {
        set(withPresent({ ...s, h: commit({ ...s.h, present: before }, after) }, present));
      }
      onLocal.current?.(before, after);
    };
    /** Live undo or redo: the patch from one side of a step to the other, on the current document. */
    const reverse = (from: 'steps' | 'undone') => {
      const s = ref.current;
      const stack = s[from];
      if (!stack.length) return;
      const step = stack[stack.length - 1];
      const before = s.h.present;
      const patch = from === 'steps' ? diffDocs(step.after, step.before) : diffDocs(step.before, step.after);
      const after = applyPatch(before, patch).doc;
      const rest = stack.slice(0, -1);
      set({
        ...withPresent(s, after),
        steps: from === 'steps' ? rest : [...s.steps, step],
        undone: from === 'steps' ? [...s.undone, step] : rest,
      });
      if (after !== before) onLocal.current?.(before, after);
    };
    /** Non-live undo or redo: the snapshot history, as before live mode existed. */
    const travel = (f: (h: History) => History) => {
      const s = ref.current;
      const next = f(s.h);
      set({ ...s, h: next });
      if (next.present !== s.h.present) onLocal.current?.(s.h.present, next.present);
    };
    return {
      change: (a: Action) => {
        const before = ref.current.h.present;
        local(before, apply(before, a));
      },
      replace: (doc: Doc) => local(ref.current.h.present, doc),
      begin: () => {
        set({ ...ref.current, gesture: true });
        return ref.current.h.present;
      },
      preview: (doc: Doc) => set(withPresent(ref.current, doc)),
      end: (base: Doc) => {
        const s = ref.current;
        const result = s.h.present;
        // a remote document that came during the gesture, with this gesture's edit on top of it
        const merged = s.pending ? applyPatch(s.pending, diffDocs(base, result)).doc : result;
        set({ ...withPresent(s, base), gesture: false, pending: null });
        if (result === base) {
          if (merged !== base) set(withPresent(ref.current, merged));
          return;
        }
        local(base, result, merged);
      },
      undo: () => (ref.current.live ? reverse('steps') : travel(undo)),
      redo: () => (ref.current.live ? reverse('undone') : travel(redo)),
      remote: (doc: Doc) => {
        const s = ref.current;
        set(s.gesture ? { ...s, pending: doc } : withPresent(s, doc));
      },
      setLive: (on: boolean) => {
        const s = ref.current;
        set({ ...s, live: on, h: initHistory(s.h.present), steps: [], undone: [] });
      },
    };
  }, []);

  return {
    doc: state.h.present,
    canUndo: state.live ? state.steps.length > 0 : state.h.past.length > 0,
    canRedo: state.live ? state.undone.length > 0 : state.h.future.length > 0,
    live: state.live,
    ...api,
  };
}
