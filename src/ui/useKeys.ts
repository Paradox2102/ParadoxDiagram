import { useEffect, useRef } from 'react';

interface Keys {
  undo: () => void;
  redo: () => void;
  remove: () => void;
  rotate: () => void;
  /** Move the selected devices by (dx, dy) mm. */
  nudge: (dx: number, dy: number) => void;
  /** Copy, paste and duplicate return false when there was nothing to do, so the browser keeps its own action. */
  copy?: () => boolean;
  paste?: () => boolean;
  duplicate?: () => boolean;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};
/** Arrow keys move 1 mm; with Shift, one 5 mm grid step. */
const NUDGE_MM = 1;
const NUDGE_SHIFT_MM = 5;

/** Editor shortcuts. Ignored while typing in a field. */
export function useKeys(keys: Keys): void {
  const ref = useRef(keys);
  ref.current = keys;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea, [contenteditable]')) return;
      const k = ref.current;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) k.redo();
        else k.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        k.redo();
      } else if (mod && !e.shiftKey && !e.altKey && (key === 'c' || key === 'v' || key === 'd')) {
        const run = key === 'c' ? k.copy : key === 'v' ? k.paste : k.duplicate;
        const done = run?.() ?? false;
        // Cmd/Ctrl+D is also the browser's bookmark key: the editor keeps it even when nothing is selected
        if (done || (key === 'd' && run)) e.preventDefault();
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        k.remove();
      } else if (!mod && !e.altKey && key === 'r') {
        k.rotate();
      } else if (!mod && ARROWS[e.key]) {
        e.preventDefault();
        const step = e.shiftKey ? NUDGE_SHIFT_MM : NUDGE_MM;
        k.nudge(ARROWS[e.key][0] * step, ARROWS[e.key][1] * step);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
