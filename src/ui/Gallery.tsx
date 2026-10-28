// The icon gallery page (/gallery): every icon of the collection, to look at and download one at a time,
// a group at a time, or all at once.
import { useEffect, useRef, useState } from 'react';
import { loadCatalog, searchIcons, type Catalog, type Icon } from '../catalog/catalog';
import { groupIcons, iconsZip, zipSlug, type GroupBy } from '../catalog/gallery';
import { downloadBlob } from '../export/download';
import { track } from '../usage/track';
import { Logo } from './Logo';
import { ThemeButton } from './ThemeButton';

const ICONS = 'icons/';
const ZIP_NAME = 'frc-device-icons';

async function fetchText(path: string): Promise<string> {
  const res = await fetch(ICONS + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

/** The page's settings live in the query string (?q=, ?by=vendor, ?legacy=1, ?icon=), so a link can share them. */
function useQueryParams(): [URLSearchParams, (change: Record<string, string | null>) => void] {
  const [params, setParams] = useState(() => new URLSearchParams(window.location.search));
  const update = (change: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(change)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const q = next.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
    setParams(next);
  };
  return [params, update];
}

function IconCard({ icon, onEnlarge }: { icon: Icon; onEnlarge: (icon: Icon) => void }) {
  const titleId = `icon-${icon.slug}`;
  return (
    <article className="icon-card" aria-labelledby={titleId}>
      <button type="button" className="icon-tile" onClick={() => onEnlarge(icon)} aria-label={`Enlarge the ${icon.name} drawing`}>
        <img src={ICONS + icon.path} alt={`Drawing of the ${icon.name}`} loading="lazy" />
      </button>
      <div className="icon-meta">
        <h3 id={titleId}>{icon.name}</h3>
        <p className="icon-vendor">{icon.vendor_name}</p>
        {icon.status === 'legacy' && <p className="icon-legacy">Legacy: not sold now</p>}
        <a className="icon-download" href={ICONS + icon.path} download={`${icon.slug}.svg`} aria-label={`Download SVG of ${icon.name}`} onClick={() => track('icon')}>
          Download SVG
        </a>
      </div>
    </article>
  );
}

/** One icon drawn large, with its full description. Esc, Close or a click outside the drawing closes it. */
function IconViewer({ icon, onClose }: { icon: Icon; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // no close() on cleanup: it queues a close event that, after a remount (React's development double run),
    // would shut the view again; taking the dialog out of the page ends its modal state anyway
    if (d.open) return;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
    closeRef.current?.focus();
  }, []);
  const close = () => {
    const d = ref.current;
    if (d && typeof d.close === 'function') d.close();
    else onClose();
  };
  return (
    <dialog
      ref={ref} className="icon-viewer" aria-labelledby="viewer-title" onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="icon-viewer-box">
        <header className="icon-viewer-bar">
          <div>
            <h2 id="viewer-title">{icon.name}</h2>
            <p className="icon-vendor">
              {icon.vendor_name}
              {icon.part_number && <> · {icon.part_number}</>}
            </p>
            {icon.description && <p className="icon-description">{icon.description}</p>}
          </div>
          <a className="icon-download" href={ICONS + icon.path} download={`${icon.slug}.svg`} aria-label={`Download SVG of ${icon.name}`} onClick={() => track('icon')}>
            Download SVG
          </a>
          <button ref={closeRef} type="button" className="icon-viewer-close" onClick={close}>Close</button>
        </header>
        <div className="icon-viewer-tile">
          <img src={ICONS + icon.path} alt={`Drawing of the ${icon.name}`} />
        </div>
      </div>
    </dialog>
  );
}

export function Gallery() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useQueryParams();
  // the box keeps its own value; the URL follows it
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  // which ZIP is being made (a group id, "all" or "shown"), and the last failure
  const [busy, setBusy] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog().then(setCatalog, (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    document.title = 'FRC device icons · Paradox Diagram';
  }, []);
  // jump to a #section once the list is there
  useEffect(() => {
    if (catalog && window.location.hash.length > 1) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [catalog]);

  const by: GroupBy = params.get('by') === 'vendor' ? 'vendor' : 'type';
  const showLegacy = params.get('legacy') === '1';

  const header = (
    <header className="bar">
      <a className="brand" href="./" title="Open the diagram editor">
        <Logo />
        <span className="brand-name">Paradox Diagram</span>
      </a>
      <nav className="page-nav" aria-label="Pages">
        <a href="./">Diagram</a>
        <a href="gallery" aria-current="page">Icons</a>
        <a href="api">API</a>
        <ThemeButton className="theme-button page-theme" />
      </nav>
    </header>
  );

  if (!catalog) {
    return (
      <div className="gallery-page">
        {header}
        <main className="gallery">
          <p className="gallery-status">{error ? `The icon list did not load: ${error}` : 'Loading the icons…'}</p>
        </main>
      </div>
    );
  }

  const all = catalog.icons;
  const matched = searchIcons(all, query, true);
  const shown = showLegacy ? matched : matched.filter((i) => i.status !== 'legacy');
  const hiddenMatches = matched.length - shown.length;
  const groups = groupIcons(catalog, shown, by);
  const legacyCount = all.filter((i) => i.status === 'legacy').length;
  const iconSlug = params.get('icon');
  const enlarged = iconSlug ? all.find((i) => i.slug === iconSlug) ?? null : null;
  const filtered = shown.length !== all.length;

  const download = async (key: string, icons: Icon[], name: string, whole = false) => {
    setBusy(key);
    setZipError(null);
    try {
      const zip = await iconsZip(icons, name, fetchText, whole);
      downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), `${name}.zip`);
      track('icon');
    } catch (e) {
      setZipError(`The ZIP was not made: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };
  const zipButton = (key: string, icons: Icon[], name: string, label: string, whole = false) => (
    <button type="button" className="zip-button" disabled={busy !== null} onClick={() => download(key, icons, name, whole)}>
      {busy === key ? 'Making the ZIP…' : label}
    </button>
  );

  return (
    <div className="gallery-page">
      {header}
      <main className="gallery">
        <section className="gallery-intro">
          <h1>FRC device icons</h1>
          <p>
            {all.length} SVG drawings of common FRC robot devices, made for wiring diagrams. One SVG unit is one
            millimetre, so all the icons have the same scale. Each wire end is a hidden anchor circle that a diagram can
            attach a wire to.
          </p>
          <p>
            Drawn by FRC Team 2102 Paradox. Public domain under <a href={`${ICONS}LICENSE.md`}>CC0 1.0</a>: use them for
            anything, no credit needed. Scripts can read <a href={`${ICONS}index.json`}>index.json</a> for each
            icon's size and wire ends.
          </p>
          <div className="gallery-actions">
            <div className="segmented" role="group" aria-label="Group icons by">
              <span>Group by</span>
              {(['type', 'vendor'] as GroupBy[]).map((b) => (
                <button key={b} type="button" aria-pressed={b === by} onClick={() => setParams({ by: b === 'vendor' ? 'vendor' : null })}>
                  {b === 'type' ? 'Type' : 'Vendor'}
                </button>
              ))}
            </div>
            {zipButton('all', all, ZIP_NAME, `Download all (${all.length} icons, ZIP)`, true)}
            {filtered && shown.length > 0 &&
              zipButton('shown', shown, `${ZIP_NAME}-${zipSlug(query || 'current')}`, `Download the ${shown.length} shown (ZIP)`)}
          </div>
          <div className="gallery-search">
            <input
              type="search" aria-label="Search icons" placeholder="Name, vendor or part number" autoComplete="off"
              spellCheck={false} value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setParams({ q: e.target.value || null });
              }}
            />
            <label className="check">
              <input type="checkbox" checked={showLegacy} onChange={(e) => setParams({ legacy: e.target.checked ? '1' : null })} />
              Show legacy devices <span className="count">{legacyCount}</span>
            </label>
            <p role="status" className="gallery-count">
              {filtered ? `${shown.length} of ${all.length} icons` : `${all.length} icons`}
            </p>
          </div>
          {zipError && <p role="alert" className="gallery-error">{zipError}</p>}
          <nav aria-label={by === 'vendor' ? 'Icon vendors' : 'Icon types'}>
            <ul className="gallery-contents">
              {groups.map((g) => (
                <li key={g.id}>
                  <a href={`#${g.id}`}>{g.name} <span className="count">{g.icons.length}</span></a>
                </li>
              ))}
            </ul>
          </nav>
        </section>
        {query && groups.length === 0 && hiddenMatches === 0 && <p className="gallery-status">No icon matches “{query}”.</p>}
        {groups.length === 0 && hiddenMatches > 0 && (
          <p className="gallery-status">
            Only {hiddenMatches === 1 ? 'a legacy device matches' : `${hiddenMatches} legacy devices match`} “{query}”.{' '}
            <button type="button" className="link-button" onClick={() => setParams({ legacy: '1' })}>Show legacy devices</button>
          </p>
        )}
        {groups.map((g) => (
          <section key={g.id} id={g.id} className="gallery-section" aria-labelledby={`group-${g.id}`}>
            <div className="gallery-section-head">
              <h2 id={`group-${g.id}`}>{g.name}</h2>
              {zipButton(g.id, g.icons, `${ZIP_NAME}-${zipSlug(g.name)}`, `Download ${g.name} (${g.icons.length}, ZIP)`)}
            </div>
            <div className="icon-grid">
              {g.icons.map((i) => <IconCard key={i.slug} icon={i} onEnlarge={(icon) => setParams({ icon: icon.slug })} />)}
            </div>
          </section>
        ))}
      </main>
      {enlarged && <IconViewer key={enlarged.slug} icon={enlarged} onClose={() => setParams({ icon: null })} />}
    </div>
  );
}
