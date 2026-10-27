import { useEffect, useRef, useState } from 'react';
import type { Layer } from '../catalog/catalog';
import { Logo } from './Logo';

export type ExportKind = 'svg' | 'png2' | 'png4' | 'json';
export type LayerView = Layer | 'all';

export const LAYER_VIEWS: { id: LayerView; label: string; swatch: string[] }[] = [
  { id: 'all', label: 'All', swatch: [] },
  { id: 'power', label: 'Power', swatch: ['#cf222e', '#0d1117'] },
  { id: 'can', label: 'CAN', swatch: ['#e3b341', '#2da44e'] },
  { id: 'network', label: 'Network', swatch: ['#0969da', '#8250df'] },
  { id: 'air', label: 'Air', swatch: ['#1b7c83'] },
];

const EXPORTS: { id: ExportKind; label: string }[] = [
  { id: 'svg', label: 'SVG' },
  { id: 'png2', label: 'PNG 2x' },
  { id: 'png4', label: 'PNG 4x' },
  { id: 'json', label: 'JSON' },
];

export interface HeaderProps {
  title: string;
  onTitle: (t: string) => void;
  layer: LayerView;
  onLayer: (l: LayerView) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNew: () => void;
  onOpen: (file: File) => void;
  onExport: (kind: ExportKind) => void;
  saved: boolean;
  labels: boolean;
  onLabels: (show: boolean) => void;
}

export function Header(p: HeaderProps) {
  const [menu, setMenu] = useState(false);
  const [title, setTitle] = useState(p.title);
  const [about, setAbout] = useState(false);
  // a new or opened document brings its own title
  useEffect(() => setTitle(p.title), [p.title]);
  const commitTitle = () => {
    if (title !== p.title) p.onTitle(title);
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  return (
    <header className="bar">
      <div className="brand">
        <Logo />
        <span className="brand-name">Paradox Diagram</span>
      </div>
      <input
        className="title" aria-label="Diagram title" value={title}
        onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setTitle(p.title);
        }}
      />
      <nav className="layers" aria-label="Layer">
        {LAYER_VIEWS.map((v) => (
          <button
            key={v.id} type="button" aria-pressed={p.layer === v.id}
            onClick={() => p.onLayer(v.id)} className={`layer layer-${v.id}`}
          >
            {v.swatch.length > 0 && (
              <span className="swatch" aria-hidden="true">
                {v.swatch.map((c) => <i key={c} style={{ background: c }} />)}
              </span>
            )}
            {v.label}
          </button>
        ))}
      </nav>
      <button
        type="button" className="labels-switch" aria-pressed={p.labels} onClick={() => p.onLabels(!p.labels)}
        title="Show or hide every device label"
      >
        Labels
      </button>
      <div className="actions">
        {!p.saved && <span className="unsaved">Not saved in this browser</span>}
        <button type="button" onClick={p.onUndo} disabled={!p.canUndo} title="Undo (Ctrl/Cmd+Z)">Undo</button>
        <button type="button" onClick={p.onRedo} disabled={!p.canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">Redo</button>
        <button type="button" onClick={p.onNew}>New</button>
        <button type="button" onClick={() => fileRef.current?.click()}>Open</button>
        <input
          ref={fileRef} type="file" accept=".json,application/json" hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onOpen(f);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={() => setAbout(true)}>About</button>
        <div className="menu" ref={menuRef}>
          <button type="button" className="primary" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            Export
          </button>
          {menu && (
            <div role="menu" className="menu-list">
              {EXPORTS.map((x) => (
                <button
                  key={x.id} type="button" role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    p.onExport(x.id);
                  }}
                >
                  {x.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {about && (
        <div className="about-backdrop" onPointerDown={() => setAbout(false)}>
          <div role="dialog" aria-modal="true" aria-label="About Paradox Diagram" className="about-box" onPointerDown={(e) => e.stopPropagation()}>
            <h2>
              <Logo size={22} /> Paradox Diagram
            </h2>
            <p>Lay out an FRC robot wiring diagram: power, CAN, network and air, with the real ports of each device.</p>
            <p>
              Device icons: the FRC device icon collection by FRC Team 2102 Paradox, released under CC0 1.0 (public domain).
              No credit is needed; please do not present the icons as your own.
            </p>
            <p>Your diagram is kept in this browser only. Export JSON to keep a copy.</p>
            <button type="button" onClick={() => setAbout(false)} autoFocus>Close</button>
          </div>
        </div>
      )}
    </header>
  );
}
