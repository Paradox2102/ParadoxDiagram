// Icon SVG files, fetched once each. The canvas inlines them without anchors and caption.
import { useEffect, useState } from 'react';
import type { Catalog } from '../catalog/catalog';
import { iconBody } from '../export/svg';

const cache = new Map<string, Promise<string | null>>();

/**
 * Mark the device's outer outline: the first shape with a stroke (the body rectangle in most icons), so the
 * dark theme can draw it light. Screen only; exports use the icon files as they are.
 */
export function markOutline(body: string): string {
  return body.replace(/<(rect|path|circle|ellipse|polygon)\b(?=[^>]*\sstroke="#)/, '<$1 class="device-outline"');
}

export function iconText(path: string): Promise<string | null> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(`icons/${path}`).then((r) => (r.ok ? r.text() : null), () => null);
    cache.set(path, p);
  }
  return p;
}

/** Inline markup for each icon slug in use, filled in as the files arrive. */
export function useIconBodies(catalog: Catalog | null, slugs: string[]): Map<string, string> {
  const [bodies, setBodies] = useState(() => new Map<string, string>());
  const key = [...new Set(slugs)].sort().join(' ');
  useEffect(() => {
    if (!catalog) return;
    let live = true;
    for (const slug of key.split(' ').filter(Boolean)) {
      const icon = catalog.bySlug.get(slug);
      if (!icon || bodies.has(slug)) continue;
      iconText(icon.path).then((t) => {
        if (live && t) setBodies((m) => new Map(m).set(slug, markOutline(iconBody(t))));
      });
    }
    return () => {
      live = false;
    };
  }, [catalog, key, bodies]);
  return bodies;
}
