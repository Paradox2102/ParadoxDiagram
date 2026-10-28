// The icon gallery: groups by type or vendor, and the ZIP files of a set of icons.
import { zipFiles } from '../export/zip';
import type { Catalog, Icon } from './catalog';

export type GroupBy = 'type' | 'vendor';

export interface IconGroup {
  /** The section id, also its #link. Vendor ids start with "vendor-" so they never clash with a type. */
  id: string;
  name: string;
  icons: Icon[];
}

const byName = (a: Icon, b: Icon) => a.name.localeCompare(b.name);

/** The groups that have icons: by type in the catalog's type order, or by vendor in vendor name order. */
export function groupIcons(catalog: Catalog, icons: Icon[], by: GroupBy): IconGroup[] {
  if (by === 'type') {
    return catalog.types
      .map((t) => ({ id: t.id, name: t.name, icons: icons.filter((i) => i.type === t.id) }))
      .filter((g) => g.icons.length > 0);
  }
  const typeOrder = new Map(catalog.types.map((t, n) => [t.id, n]));
  const vendors = new Map<string, IconGroup>();
  for (const icon of icons) {
    const g = vendors.get(icon.vendor) ?? { id: `vendor-${icon.vendor}`, name: icon.vendor_name, icons: [] };
    g.icons.push(icon);
    vendors.set(icon.vendor, g);
  }
  for (const g of vendors.values()) {
    g.icons.sort((a, b) => (typeOrder.get(a.type) ?? 0) - (typeOrder.get(b.type) ?? 0) || byName(a, b));
  }
  // "generic" (several makers, such as the battery) is not a vendor name: it goes after the named vendors
  const last = (g: IconGroup) => (g.id === 'vendor-generic' ? 1 : 0);
  return [...vendors.values()].sort((a, b) => last(a) - last(b) || a.name.localeCompare(b.name));
}

/** A ZIP file name part from a group or search: lower case, a-z 0-9 and dashes. */
export function zipSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'icons';
}

/**
 * The ZIP of some icons: one folder named after the ZIP, the icons at their collection paths
 * (type/vendor/slug.svg), the license, and for the whole collection also index.json.
 */
export async function iconsZip(
  icons: Icon[], folder: string, fetchText: (path: string) => Promise<string>, whole = false,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const paths = ['LICENSE.md', ...(whole ? ['index.json'] : []), ...icons.map((i) => i.path)];
  const texts: string[] = new Array(paths.length);
  // a few requests at a time: the browser queues the rest anyway, and errors show sooner
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const n = next++;
      texts[n] = await fetchText(paths[n]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, paths.length) }, worker));
  return zipFiles(paths.map((p, n) => ({ path: `${folder}/${p}`, data: enc.encode(texts[n]) })));
}
