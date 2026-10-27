import { useEffect, useState } from 'react';
import { loadCatalog, type Catalog } from '../catalog/catalog';
import { emptyDoc } from '../model/types';
import { Header } from './Header';
import { Palette } from './Palette';
import { useLayerHash } from './useLayerHash';

export function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [layer, setLayer] = useLayerHash();
  const [title, setTitle] = useState(emptyDoc().title);

  useEffect(() => {
    loadCatalog().then(setCatalog, (e: Error) => setCatalogError(e.message));
  }, []);

  return (
    <div className="app">
      <Header
        title={title} onTitle={setTitle} layer={layer} onLayer={setLayer}
        canUndo={false} canRedo={false} onUndo={() => {}} onRedo={() => {}}
        onNew={() => {}} onOpen={() => {}} onExport={() => {}} saved
      />
      <Palette catalog={catalog} error={catalogError} onAdd={() => {}} />
      <main className="canvas-wrap" />
    </div>
  );
}
