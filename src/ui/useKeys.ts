import { useEffect, useRef } from 'react';

interface Keys {
  undo: () => void;
  redo: () => void;
  remove: () => void;
  rotate: () => void;
}

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
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        k.remove();
      } else if (!mod && !e.altKey && key === 'r') {
        k.rotate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
