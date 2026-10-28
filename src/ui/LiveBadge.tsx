// The live badge in the top bar: whether the AI's server is connected, and a way out of live mode.
import { useEffect, useRef, useState } from 'react';
import type { LiveState } from '../live/client';

const TEXT: Record<LiveState, string> = {
  connecting: 'Live · connecting…',
  connected: 'Live · AI connected',
  reconnecting: 'Live · reconnecting…',
  stopped: 'Live · AI server stopped',
};

export function LiveBadge({ state, onLeave }: { state: LiveState; onLeave: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="menu live-badge" ref={ref} data-state={state}>
      <button
        type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        title={state === 'stopped' ? 'The diagram is a normal diagram in this browser again' : 'This diagram is shared live with your AI'}
      >
        <span className="live-dot" aria-hidden="true" />
        {TEXT[state]}
      </button>
      {open && (
        <div role="menu" className="menu-list">
          <button
            type="button" role="menuitem"
            onClick={() => {
              setOpen(false);
              onLeave();
            }}
          >
            {state === 'stopped' ? 'Close' : 'Leave live mode'}
          </button>
        </div>
      )}
    </div>
  );
}
