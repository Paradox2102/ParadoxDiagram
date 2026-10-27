import { useCallback, useEffect, useState } from 'react';
import type { LayerView } from './Header';

const VIEWS: LayerView[] = ['all', 'power', 'can', 'network', 'air'];

export function readLayerHash(hash: string): LayerView {
  const m = /(?:^#|&)layer=([a-z]+)/.exec(hash);
  const v = m?.[1] as LayerView | undefined;
  return v && VIEWS.includes(v) ? v : 'all';
}

/** The layer view, kept in the URL hash as #layer=<id>. */
export function useLayerHash(): [LayerView, (l: LayerView) => void] {
  const [layer, setLayerState] = useState<LayerView>(() => readLayerHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setLayerState(readLayerHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setLayer = useCallback((l: LayerView) => {
    setLayerState(l);
    history.replaceState(null, '', l === 'all' ? window.location.pathname + window.location.search : `#layer=${l}`);
  }, []);
  return [layer, setLayer];
}
