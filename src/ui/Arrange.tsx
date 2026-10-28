// Align and space controls for two or more selected devices. Each button is one undo step.
import { useState } from 'react';
import type { Catalog } from '../catalog/catalog';
import { alignMoves, distributeMoves, type AlignMode, type Box, type Move } from '../geometry/align';
import { boundsOf } from '../geometry/scene';
import type { Action } from '../model/actions';
import type { Doc } from '../model/types';

const ALIGN: { mode: AlignMode; label: string; icon: string }[] = [
  { mode: 'left', label: 'Align left', icon: 'M2 1v14 M4 4h9v3H4z M4 9h6v3H4z' },
  { mode: 'center', label: 'Align center', icon: 'M8 1v14 M3 4h10v3H3z M5 9h6v3H5z' },
  { mode: 'right', label: 'Align right', icon: 'M14 1v14 M3 4h9v3H3z M6 9h6v3H6z' },
  { mode: 'top', label: 'Align top', icon: 'M1 2h14 M4 4h3v9H4z M9 4h3v6H9z' },
  { mode: 'middle', label: 'Align middle', icon: 'M1 8h14 M4 3h3v10H4z M9 5h3v6H9z' },
  { mode: 'bottom', label: 'Align bottom', icon: 'M1 14h14 M4 3h3v9H4z M9 6h3v6H9z' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

interface Props {
  doc: Doc;
  catalog: Catalog | null;
  ids: string[]; // the selected devices
  dispatch: (a: Action) => void;
}

export function Arrange({ doc, catalog, ids, dispatch }: Props) {
  const [gap, setGap] = useState('10');
  const boxes = new Map<string, Box>(
    doc.devices.filter((d) => ids.includes(d.id)).map((d) => [d.id, boundsOf(catalog, d)]),
  );
  const run = (moves: Map<string, Move>) =>
    dispatch({ type: 'moveEach', moves: [...moves].map(([id, m]) => ({ id, dx: m.dx, dy: m.dy })) });
  const gapMm = Number(gap);
  const gapOk = gap.trim() !== '' && Number.isFinite(gapMm) && gapMm >= 0;

  return (
    <section className="arrange" aria-label="Arrange">
      <h3>Align</h3>
      <div className="icon-row">
        {ALIGN.map((a) => (
          <button key={a.mode} type="button" aria-label={a.label} title={a.label} onClick={() => run(alignMoves(boxes, a.mode))}>
            <Icon d={a.icon} />
          </button>
        ))}
      </div>
      <h3>Space</h3>
      <div className="row">
        <button type="button" disabled={boxes.size < 3} onClick={() => run(distributeMoves(boxes, 'x'))}
          title="Equal gaps from left to right; the end devices stay">Space evenly across</button>
        <button type="button" disabled={boxes.size < 3} onClick={() => run(distributeMoves(boxes, 'y'))}
          title="Equal gaps from top to bottom; the end devices stay">Space evenly down</button>
      </div>
      <label className="gap">
        Gap (mm)
        <input inputMode="decimal" value={gap} onChange={(e) => setGap(e.target.value)} />
      </label>
      <div className="row">
        <button type="button" disabled={!gapOk} onClick={() => run(distributeMoves(boxes, 'x', gapMm))}>Set gap across</button>
        <button type="button" disabled={!gapOk} onClick={() => run(distributeMoves(boxes, 'y', gapMm))}>Set gap down</button>
      </div>
    </section>
  );
}
