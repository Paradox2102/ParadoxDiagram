// The FRC icon collection index (public/icons/index.json): icons, their ports and search.

export type Layer = 'power' | 'can' | 'network' | 'air';
export type AnchorKind = 'power' | 'can' | 'ethernet' | 'usb' | 'signal' | 'air';

export const LAYERS: Layer[] = ['power', 'can', 'network', 'air'];

export interface Anchor {
  port: string;
  x: number;
  y: number;
  kind: AnchorKind;
  label: string;
}

export interface Icon {
  slug: string;
  name: string;
  type: string;
  vendor: string;
  vendor_name: string;
  part_number: string | null;
  status: 'current' | 'legacy';
  path: string;
  size_mm: [number, number];
  view_box: [number, number, number, number];
  /** The drawing without its caption: the frame the diagram places, rotates and draws. */
  body_view?: [number, number, number, number];
  anchors: Anchor[];
}

export function iconFrame(icon: Icon): [number, number, number, number] {
  return icon.body_view ?? icon.view_box;
}

export interface IconType {
  id: string;
  name: string;
  count: number;
}

export interface Catalog {
  types: IconType[];
  icons: Icon[];
  bySlug: Map<string, Icon>;
}

export function parseCatalog(json: unknown): Catalog {
  const j = json as { types?: IconType[]; icons?: Icon[] };
  if (!j || !Array.isArray(j.icons)) throw new Error('icons/index.json: no icons list');
  const icons = j.icons;
  return { types: j.types ?? [], icons, bySlug: new Map(icons.map((i) => [i.slug, i])) };
}

export async function loadCatalog(fetchFn: typeof fetch = fetch): Promise<Catalog> {
  const res = await fetchFn('icons/index.json');
  if (!res.ok) throw new Error(`icons/index.json: HTTP ${res.status}`);
  return parseCatalog(await res.json());
}

export function layerOfKind(kind: AnchorKind): Layer {
  if (kind === 'power' || kind === 'can' || kind === 'air') return kind;
  return 'network';
}

export function iconLayers(icon: Icon): Set<Layer> {
  return new Set(icon.anchors.map((a) => layerOfKind(a.kind)));
}

export function findAnchor(icon: Icon, port: string): Anchor | undefined {
  return icon.anchors.find((a) => a.port === port);
}

export function searchIcons(icons: Icon[], query: string, showLegacy: boolean): Icon[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return icons.filter((i) => {
    if (!showLegacy && i.status === 'legacy') return false;
    const hay = `${i.name} ${i.vendor_name} ${i.part_number ?? ''} ${i.slug}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
