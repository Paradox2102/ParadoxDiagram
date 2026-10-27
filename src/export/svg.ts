// Standalone SVG export: icons inlined, white background, millimetre size.
import { iconFrame, iconLayers, type Catalog, type Layer } from '../catalog/catalog';
import { deviceTag, tagShown } from '../model/tags';
import type { Doc } from '../model/types';
import {
  boundsOf, COLORS, iconOf, MISSING_H, MISSING_W, OFF_LAYER_OPACITY, renderWirePaths, TAG_FACTS_DY, TAG_H, TAG_NAME_DY,
  wirePoints,
} from '../geometry/scene';
import { deviceTransform } from '../geometry/transform';

export { renderWirePaths };

export const EXPORT_MARGIN_MM = 10;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (v: number) => String(Math.round(v * 100) / 100 + 0);

/** Remove the icon's invisible port markers (the only ids in an icon). */
export function stripAnchors(svgText: string): string {
  return svgText.replace(/<g id="anchors">[\s\S]*?<\/g>\s*/g, '');
}

/** Remove the name and size caption under the drawing: the device tag replaces it. */
export function stripCaption(svgText: string): string {
  return svgText.replace(/<g class="caption">[\s\S]*?<\/g>\s*/g, '');
}

/** The icon's drawing as markup for a nested <svg>: no outer tag, anchors or caption. */
export function iconBody(svgText: string): string {
  return innerSvg(stripCaption(stripAnchors(svgText)));
}

function innerSvg(svgText: string): string {
  const open = svgText.indexOf('>', svgText.indexOf('<svg'));
  const close = svgText.lastIndexOf('</svg>');
  return svgText.slice(open + 1, close);
}

export function contentBox(doc: Doc, catalog: Catalog | null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  };
  for (const d of doc.devices) {
    const b = boundsOf(catalog, d);
    add(b.x, b.y);
    add(b.x + b.w, b.y + b.h + (tagShown(doc, d.id) ? TAG_H : 0));
  }
  for (const w of doc.wires) for (const p of wirePoints(doc, catalog, w) ?? []) add(p.x, p.y);
  if (x0 === Infinity) return { x: 0, y: 0, w: 100, h: 100 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export async function exportSvg(
  doc: Doc,
  catalog: Catalog,
  layer: Layer | 'all',
  iconText: (path: string) => Promise<string | null>,
): Promise<string> {
  const box = contentBox(doc, catalog);
  const x = box.x - EXPORT_MARGIN_MM;
  const y = box.y - EXPORT_MARGIN_MM;
  const w = box.w + 2 * EXPORT_MARGIN_MM;
  const h = box.h + 2 * EXPORT_MARGIN_MM;

  const texts = new Map<string, string | null>();
  for (const d of doc.devices) {
    const icon = iconOf(catalog, d);
    if (icon && !texts.has(icon.path)) texts.set(icon.path, await iconText(icon.path).catch(() => null));
  }

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}" width="${f(w)}mm" height="${f(h)}mm" font-family="Helvetica, Arial, sans-serif">`,
    `<title>${esc(doc.title)}</title>`,
    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#ffffff"/>`,
  ];

  for (const d of doc.devices) {
    const icon = iconOf(catalog, d);
    const dim = layer !== 'all' && !(icon && iconLayers(icon).has(layer));
    const op = dim ? ` opacity="${OFF_LAYER_OPACITY}"` : '';
    const text = icon ? texts.get(icon.path) : null;
    const tag = deviceTag(doc, d.id, catalog);
    const b = boundsOf(catalog, d);
    out.push(`<g${op}>`);
    if (icon && text) {
      const [vx, vy, vw, vh] = iconFrame(icon);
      out.push(
        `<g transform="${deviceTransform(d, icon)}"><svg x="${vx}" y="${vy}" width="${vw}" height="${vh}" viewBox="${vx} ${vy} ${vw} ${vh}" overflow="visible">`,
        iconBody(text),
        '</svg></g>',
      );
    } else {
      const bw = icon ? b.w : MISSING_W;
      const bh = icon ? b.h : MISSING_H;
      out.push(
        `<rect x="${f(b.x)}" y="${f(b.y)}" width="${f(bw)}" height="${f(bh)}" rx="2" fill="${COLORS.missing}" stroke="${COLORS.muted}" stroke-width="0.4"/>`,
        `<text x="${f(b.x + bw / 2)}" y="${f(b.y + bh / 2)}" font-size="3" text-anchor="middle" fill="${COLORS.muted}">${esc(d.slug)}</text>`,
      );
    }
    const cx = f(b.x + b.w / 2);
    if (tagShown(doc, d.id)) out.push(`<text x="${cx}" y="${f(b.y + b.h + TAG_NAME_DY)}" font-size="3.6" font-weight="bold" text-anchor="middle" fill="${COLORS.ink}">${esc(tag.name)}</text>`);
    if (tag.facts && tagShown(doc, d.id)) {
      out.push(`<text x="${cx}" y="${f(b.y + b.h + TAG_FACTS_DY)}" font-size="3" text-anchor="middle" fill="${COLORS.muted}">${esc(tag.facts)}</text>`);
    }
    out.push('</g>');
  }

  out.push('<g data-layer="wires">');
  for (const wire of doc.wires) {
    if (layer !== 'all' && wire.layer !== layer) continue;
    for (const p of renderWirePaths(doc, catalog, wire)) {
      const dash = p.dash ? ` stroke-dasharray="${p.dash}"` : '';
      out.push(`<path d="${p.d}" fill="none" stroke="${p.stroke}" stroke-width="${p.width}" stroke-linejoin="round"${dash}/>`);
    }
  }

  out.push('</g>', '</svg>');
  return out.join('\n') + '\n';
}
