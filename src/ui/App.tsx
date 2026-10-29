import { useEffect, useMemo, useRef, useState } from 'react';
import { iconFrame, loadCatalog, type Catalog } from '../catalog/catalog';
import { downloadBlob } from '../export/download';
import { docToJson, fileBase } from '../export/json';
import { svgToPng } from '../export/png';
import { deviceTableCsv } from '../export/table';
import { contentBox, EXPORT_MARGIN_MM, exportSvg } from '../export/svg';
import { nextId } from '../model/ids';
import { copyItems, pasteItems, type Clip } from '../model/paste';
import { findProblems } from '../model/problems';
import { deviceTag } from '../model/tags';
import { exampleDoc } from '../model/example';
import { emptyDoc, type Doc } from '../model/types';
import { validateDoc } from '../model/validate';
import { autosaveAllowed, useLive, type LiveSend } from '../live/useLive';
import { buildShareUrl, encodeShare, needsConfirm, readIncoming, withoutShare } from '../share/share';
import { AUTOSAVE_MS, loadSaved, safeStorage, saveDoc } from '../storage/autosave';
import { Canvas, type CanvasApi } from './Canvas';
import { Header, type ExportKind } from './Header';
import { iconText } from './iconText';
import { Inspector } from './Inspector';
import { LiveBadge } from './LiveBadge';
import { Palette } from './Palette';
import { useDocHistory } from './useDocHistory';
import { useKeys } from './useKeys';
import { useLayerHash } from './useLayerHash';

const storage = safeStorage();
/** Each paste of one copy lands this much further right and down, so pastes do not stack. */
const PASTE_STEP_MM = 10;

function initialDoc(): Doc {
  return loadSaved(storage, null).doc ?? emptyDoc();
}

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [layer, setLayer] = useLayerHash();
  // each local edit goes to the AI's server while the diagram is live
  const liveSend = useRef<LiveSend | null>(null);
  const hist = useDocHistory(initialDoc, { onLocal: (before, after) => liveSend.current?.(before, after) });
  const { doc } = hist;
  const [selection, setSelection] = useState<string[]>([]);
  const [saved, setSaved] = useState(storage !== null);
  const canvasApi = useRef<CanvasApi | null>(null);
  const live = useLive(hist, liveSend, { onWelcome: () => requestAnimationFrame(() => canvasApi.current?.fit()) });
  const liveOn = !autosaveAllowed(live.state);
  const [incoming, setIncoming] = useState<{ doc: Doc; droppedWires: number } | { error: string } | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    loadCatalog().then(setCatalog, (e: Error) => setCatalogError(e.message));
  }, []);

  // A share link (#share=...) opens once the icons are known: at once into an empty editor,
  // otherwise after the user says so. The share code then leaves the address bar.
  const iconsReady = catalog !== null || catalogError !== null;
  useEffect(() => {
    if (!iconsReady) return;
    const check = async () => {
      const got = await readIncoming(window.location.hash, catalog);
      if (!got) return;
      history.replaceState(null, '', window.location.pathname + window.location.search + withoutShare(window.location.hash));
      if ('doc' in got && !needsConfirm(docRef.current)) openShared(got);
      else setIncoming(got);
    };
    void check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
    // openShared only uses stable setters and refs, so it is not a dependency
  }, [iconsReady, catalog]);

  function openShared(got: { doc: Doc; droppedWires: number }) {
    live.replaceLocally(got.doc);
    setSelection([]);
    setIncoming(null);
    requestAnimationFrame(() => canvasApi.current?.fit());
    if (got.droppedWires) window.alert(`${got.droppedWires} wire(s) in the shared diagram did not match their ports and were left out.`);
  }

  // while live, the AI's file is the copy that is kept: the browser copy waits
  useEffect(() => {
    if (liveOn) return;
    const t = setTimeout(() => setSaved(saveDoc(storage, doc)), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [doc, liveOn]);

  const problems = useMemo(
    () => (catalog ? findProblems(doc, catalog, (id) => deviceTag(doc, id, catalog).name) : []),
    [doc, catalog],
  );

  const deleteSelection = () => {
    if (selection.length) hist.change({ type: 'delete', ids: selection });
    setSelection([]);
  };
  const rotateSelection = () => {
    const ids = selection.filter((id) => doc.devices.some((d) => d.id === id));
    if (ids.length) hist.change({ type: 'rotateDevices', ids });
  };
  const nudgeSelection = (dx: number, dy: number) => {
    const ids = selection.filter((id) => doc.devices.some((d) => d.id === id));
    if (ids.length) hist.change({ type: 'moveDevices', ids, dx, dy, snap: false });
  };
  // the copy lives in this tab only; it holds copies of the devices, so it still pastes after they are deleted
  const clip = useRef<{ items: Clip; pastes: number } | null>(null);
  const pasteClip = (items: Clip, pastes: number) => {
    const out = pasteItems(doc, items, PASTE_STEP_MM * pastes);
    hist.change({ type: 'paste', ...out });
    setSelection(out.devices.map((d) => d.id));
  };
  const copySelection = () => {
    const items = copyItems(doc, selection);
    if (items) clip.current = { items, pastes: 0 };
    return items !== null;
  };
  const paste = () => {
    if (!clip.current) return false;
    pasteClip(clip.current.items, ++clip.current.pastes);
    return true;
  };
  const duplicate = () => {
    const items = copyItems(doc, selection);
    if (items) pasteClip(items, 1);
    return items !== null;
  };
  useKeys({
    undo: hist.undo, redo: hist.redo, remove: deleteSelection, rotate: rotateSelection, nudge: nudgeSelection,
    copy: copySelection, paste, duplicate,
  });

  const addDevice = (slug: string) => {
    const icon = catalog?.bySlug.get(slug);
    if (!icon) return;
    const c = canvasApi.current?.center() ?? { x: 0, y: 0 };
    const [, , w, h] = iconFrame(icon);
    // Each click lands a little lower and to the right, so repeated adds do not stack exactly.
    const step = (doc.devices.length % 8) * 10;
    setSelection([nextId('d', doc.devices)]);
    hist.change({ type: 'addDevice', slug, name: '', x: c.x - w / 2 + step, y: c.y - h / 2 + step });
  };

  // in live mode these leave live mode first: the AI's file keeps its diagram
  const LEAVES_LIVE = 'This leaves live mode; the AI keeps its diagram in its file.';
  const onNew = (kind: 'empty' | 'example') => {
    const what = kind === 'example' ? 'Open the example robot' : 'Start a new diagram';
    const ask = liveOn ? `${what} in this browser? ${LEAVES_LIVE}` : `${what}? The current one stays in Undo until you reload.`;
    if ((liveOn || doc.devices.length) && !window.confirm(ask)) return;
    live.replaceLocally(kind === 'example' ? exampleDoc(catalog) : emptyDoc());
    setSelection([]);
    if (kind === 'example') requestAnimationFrame(() => canvasApi.current?.fit());
  };

  const onOpen = async (file: File) => {
    try {
      const { doc: opened, droppedWires } = validateDoc(JSON.parse(await file.text()), catalog);
      if (liveOn && !window.confirm(`Open ${file.name} in this browser? ${LEAVES_LIVE}`)) return;
      live.replaceLocally(opened);
      setSelection([]);
      requestAnimationFrame(() => canvasApi.current?.fit());
      if (droppedWires) window.alert(`${file.name}: ${droppedWires} wire(s) did not match their ports and were left out.`);
    } catch (e) {
      window.alert(`Could not open ${file.name}: ${(e as Error).message}`);
    }
  };

  const onExport = async (kind: ExportKind) => {
    const base = fileBase(doc.title);
    if (kind === 'json') {
      downloadBlob(new Blob([docToJson(doc)], { type: 'application/json' }), `${base}.paradox.json`);
      return;
    }
    if (kind === 'csv') {
      downloadBlob(new Blob([deviceTableCsv(doc, catalog)], { type: 'text/csv;charset=utf-8' }), `${base}-devices.csv`);
      return;
    }
    if (!catalog) {
      window.alert('The device icons are not loaded yet.');
      return;
    }
    const svg = await exportSvg(doc, catalog, layer, iconText);
    if (kind === 'svg') {
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${base}.svg`);
      return;
    }
    const box = contentBox(doc, catalog);
    try {
      const png = await svgToPng(svg, box.w + 2 * EXPORT_MARGIN_MM, box.h + 2 * EXPORT_MARGIN_MM, kind === 'png4' ? 4 : 2);
      downloadBlob(png, `${base}.png`);
    } catch (e) {
      window.alert(`PNG export failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="app">
      <Header
        title={doc.title} onTitle={(title) => hist.change({ type: 'setTitle', title })} layer={layer} onLayer={setLayer}
        canUndo={hist.canUndo} canRedo={hist.canRedo} onUndo={hist.undo} onRedo={hist.redo}
        onNew={onNew} onOpen={onOpen} onExport={onExport} saved={saved || liveOn}
        live={live.state && <LiveBadge state={live.state} onLeave={live.leave} />}
        labels={!doc.hideTags} onLabels={(show) => hist.change({ type: 'setHideTags', hidden: !show })}
        problems={problems} onPick={setSelection}
        onShare={async () => buildShareUrl(window.location.origin + window.location.pathname, await encodeShare(doc), layer)}
      />
      <Palette catalog={catalog} error={catalogError} onAdd={addDevice} />
      <Canvas
        doc={doc} catalog={catalog} layer={layer} selection={selection} setSelection={setSelection}
        hist={hist} apiRef={canvasApi}
      />
      <Inspector doc={doc} catalog={catalog} selection={selection} dispatch={hist.change} onExample={() => onNew('example')} />
      {live.pending && (
        <div className="share-banner" role="status">
          <span>Connect to your AI's diagram? It replaces the diagram kept in this browser.</span>
          <button type="button" className="primary" onClick={live.accept}>Connect</button>
          <button type="button" onClick={live.decline}>Keep mine</button>
        </div>
      )}
      {live.fatal && (
        <div className="share-banner" role="alert">
          <span>{live.fatal}</span>
          <button type="button" onClick={live.dismissFatal}>Close</button>
        </div>
      )}
      {live.message && <div className="live-message" role="status">{live.message}</div>}
      {incoming && (
        <div className="share-banner" role="status">
          {'error' in incoming ? (
            <>
              <span>Could not open the shared diagram: {incoming.error}</span>
              <button type="button" onClick={() => setIncoming(null)}>Close</button>
            </>
          ) : (
            <>
              <span>
                Shared diagram “{incoming.doc.title}” ({incoming.doc.devices.length} devices). Opening it replaces the
                diagram kept in this browser{liveOn ? ' and leaves live mode (the AI keeps its file)' : ''}.
              </span>
              <button type="button" className="primary" onClick={() => openShared(incoming)}>Open it</button>
              <button type="button" onClick={() => setIncoming(null)}>Keep mine</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
