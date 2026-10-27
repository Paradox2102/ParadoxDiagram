import { useEffect, useRef, useState } from 'react';
import { iconFrame, loadCatalog, type Catalog } from '../catalog/catalog';
import { downloadBlob } from '../export/download';
import { docToJson, fileBase } from '../export/json';
import { svgToPng } from '../export/png';
import { contentBox, EXPORT_MARGIN_MM, exportSvg } from '../export/svg';
import { nextId } from '../model/ids';
import { emptyDoc, type Doc } from '../model/types';
import { validateDoc } from '../model/validate';
import { AUTOSAVE_MS, loadSaved, safeStorage, saveDoc } from '../storage/autosave';
import { Canvas, type CanvasApi } from './Canvas';
import { Header, type ExportKind } from './Header';
import { iconText } from './iconText';
import { Inspector } from './Inspector';
import { Palette } from './Palette';
import { useDocHistory } from './useDocHistory';
import { useKeys } from './useKeys';
import { useLayerHash } from './useLayerHash';

const storage = safeStorage();

function initialDoc(): Doc {
  return loadSaved(storage, null).doc ?? emptyDoc();
}

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [layer, setLayer] = useLayerHash();
  const hist = useDocHistory(initialDoc);
  const { doc } = hist;
  const [selection, setSelection] = useState<string[]>([]);
  const [saved, setSaved] = useState(storage !== null);
  const canvasApi = useRef<CanvasApi | null>(null);

  useEffect(() => {
    loadCatalog().then(setCatalog, (e: Error) => setCatalogError(e.message));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSaved(saveDoc(storage, doc)), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [doc]);

  const deleteSelection = () => {
    if (selection.length) hist.change({ type: 'delete', ids: selection });
    setSelection([]);
  };
  const rotateSelection = () => {
    const ids = selection.filter((id) => doc.devices.some((d) => d.id === id));
    if (ids.length) hist.change({ type: 'rotateDevices', ids });
  };
  useKeys({ undo: hist.undo, redo: hist.redo, remove: deleteSelection, rotate: rotateSelection });

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

  const onNew = () => {
    if (doc.devices.length && !window.confirm('Start a new diagram? The current one stays in Undo until you reload.')) return;
    hist.replace(emptyDoc());
    setSelection([]);
  };

  const onOpen = async (file: File) => {
    try {
      const { doc: opened, droppedWires } = validateDoc(JSON.parse(await file.text()), catalog);
      hist.replace(opened);
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
        onNew={onNew} onOpen={onOpen} onExport={onExport} saved={saved}
        labels={!doc.hideTags} onLabels={(show) => hist.change({ type: 'setHideTags', hidden: !show })}
      />
      <Palette catalog={catalog} error={catalogError} onAdd={addDevice} />
      <Canvas
        doc={doc} catalog={catalog} layer={layer} selection={selection} setSelection={setSelection}
        hist={hist} apiRef={canvasApi}
      />
      <Inspector doc={doc} catalog={catalog} selection={selection} dispatch={hist.change} />
    </div>
  );
}
