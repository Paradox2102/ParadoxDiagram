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
  /** The full description, when the short name leaves out details (specs, model numbers). */
  description?: string | null;
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
    const hay = `${i.name} ${i.description ?? ''} ${i.vendor_name} ${i.part_number ?? ''} ${i.slug}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

const POS_WORDS = new Set(['pos', 'positive', 'vin', 'bat', 'aux', '5v', 'v5', '12v']);
const NEG_WORDS = new Set(['neg', 'negative', 'gnd']);

/**
 * The polarity of a power terminal that carries one conductor (battery leads, breaker studs,
 * distribution inputs), read from the port name. Null for a + / - pair such as a PDH channel.
 */
export function portPolarity(a: Anchor): '+' | '-' | null {
  if (a.kind !== 'power') return null;
  const words = a.port.toLowerCase().split('_');
  if (words.some((w) => NEG_WORDS.has(w))) return '-';
  if (words.some((w) => POS_WORDS.has(w))) return '+';
  return null;
}

/**
 * The other terminal of a separate + / - pair on the same device: the port with the other
 * polarity and the same name apart from the polarity word (vbat_pos and vbat_neg), else the
 * nearest port with the other polarity.
 */
export function partnerPort(icon: Icon, a: Anchor): Anchor | undefined {
  const pol = portPolarity(a);
  if (!pol) return undefined;
  const others = icon.anchors.filter((b) => {
    const p = portPolarity(b);
    return p !== null && p !== pol;
  });
  const stem = (b: Anchor) =>
    b.port.toLowerCase().split('_').filter((w) => !POS_WORDS.has(w) && !NEG_WORDS.has(w)).join('_');
  const named = others.find((b) => stem(b) === stem(a));
  if (named) return named;
  let best: Anchor | undefined;
  for (const b of others) {
    if (!best || Math.hypot(b.x - a.x, b.y - a.y) < Math.hypot(best.x - a.x, best.y - a.y)) best = b;
  }
  return best;
}

/** Two ports can share a wire when they are on one layer and are not + to - (a short). */
export function canConnect(a: Anchor, b: Anchor): boolean {
  if (layerOfKind(a.kind) !== layerOfKind(b.kind)) return false;
  const pa = portPolarity(a);
  const pb = portPolarity(b);
  return !(pa && pb && pa !== pb);
}
