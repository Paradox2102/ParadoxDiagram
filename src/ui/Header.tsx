import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Layer } from '../catalog/catalog';
import { Logo } from './Logo';
import { ThemeButton } from './ThemeButton';

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
  /** Makes a snapshot share link of the current diagram. */
  onShare: () => Promise<string>;
  /** The live badge, while the diagram is shared live with an AI. */
  live?: ReactNode;
}

type ShareState = { url: string; copied: boolean } | { error: string } | null;

export function Header(p: HeaderProps) {
  const [menu, setMenu] = useState(false);
  const [title, setTitle] = useState(p.title);
  const [about, setAbout] = useState(false);
  const [share, setShare] = useState<ShareState>(null);
  const onShare = async () => {
    try {
      const url = await p.onShare();
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        // no clipboard access (permission or an insecure page): the link box still shows the link
      }
      setShare({ url, copied });
    } catch (e) {
      setShare({ error: (e as Error).message });
    }
  };
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
        {p.live}
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
        <button type="button" onClick={onShare} title="Copy a link that opens this version of the diagram">Share</button>
        <ThemeButton className="theme-button" />
        <a className="nav-button" href="gallery" title="Browse and download the device icons">Icons</a>
        <a className="nav-button" href="api" title="Build the diagram with an AI agent (MCP server)">API</a>
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
      {share && (
        <div className="about-backdrop" onPointerDown={() => setShare(null)}>
          <div role="dialog" aria-modal="true" aria-label="Share link" className="about-box share-box" onPointerDown={(e) => e.stopPropagation()}>
            <h2>Share this diagram</h2>
            {'error' in share ? (
              <p role="alert">Could not make a link: {share.error}</p>
            ) : (
              <>
                <p>
                  {share.copied ? 'The link is copied. ' : ''}Anyone who opens it sees this version of the diagram and
                  can keep a copy. Later changes need a new link.
                </p>
                <input
                  aria-label="Share link" readOnly value={share.url} onFocus={(e) => e.currentTarget.select()} autoFocus
                />
                <p className="share-meta">{share.url.length.toLocaleString('en-US')} characters</p>
              </>
            )}
            <div className="row">
              {!('error' in share) && (
                <button type="button" onClick={() => navigator.clipboard?.writeText(share.url).then(() => setShare({ ...share, copied: true }), () => {})}>
                  Copy
                </button>
              )}
              <button type="button" onClick={() => setShare(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
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
            <p className="about-version">
              Version {__APP_VERSION__} ·{' '}
              <a href="https://github.com/Paradox2102/ParadoxDiagram" target="_blank" rel="noreferrer">Source on GitHub</a>
            </p>
            <button type="button" onClick={() => setAbout(false)} autoFocus>Close</button>
          </div>
        </div>
      )}
    </header>
  );
}
