// A picture of the diagram for the AI: the same SVG as Export, drawn to PNG with resvg. Labels use Liberation Sans
// (the same widths as Arial), which the package carries, so the picture is the same on every computer.
import { Resvg } from '@resvg/resvg-js';
import { join } from 'node:path';
import type { Catalog, Layer } from '../../src/catalog/catalog';
import { contentBox, EXPORT_MARGIN_MM, exportSvg } from '../../src/export/svg';
import type { Doc } from '../../src/model/types';
import { ASSETS, iconTextNode } from './catalog';

export const MAX_WIDTH_PX = 1600;
/** A tall picture is capped too, so a region cannot ask for a bitmap of hundreds of MB. */
export const MAX_HEIGHT_PX = 4800;
const PX_PER_MM = 96 / 25.4;
const FONTS = ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf'].map((f) => join(ASSETS, 'fonts', f));

export interface RenderOptions {
  layer?: Layer | 'all';
  /** An area of the diagram in mm. */
  region?: { x: number; y: number; width: number; height: number };
  /** 1 to 4 (default 2); lowered when the picture would be more than 1600 px wide or 4800 px tall. */
  scale?: number;
}

const f = (v: number) => String(Math.round(v * 100) / 100);

export async function renderPng(doc: Doc, catalog: Catalog, opts: RenderOptions) {
  let svg = await exportSvg(doc, catalog, opts.layer ?? 'all', iconTextNode);
  const box = contentBox(doc, catalog);
  let view = { x: box.x - EXPORT_MARGIN_MM, y: box.y - EXPORT_MARGIN_MM, w: box.w + 2 * EXPORT_MARGIN_MM, h: box.h + 2 * EXPORT_MARGIN_MM };
  if (opts.region) {
    const r = opts.region;
    const inside = r.width > 0 && r.height > 0 && r.x < view.x + view.w && r.x + r.width > view.x && r.y < view.y + view.h && r.y + r.height > view.y;
    if (!inside) {
      throw new Error(
        `region is outside the diagram, which spans x ${Math.floor(view.x)} to ${Math.ceil(view.x + view.w)} and y ${Math.floor(view.y)} to ${Math.ceil(view.y + view.h)} mm`,
      );
    }
    view = { x: r.x, y: r.y, w: r.width, h: r.height };
    // the export's white background covers its own box: give the cropped picture one of its own
    svg = svg.replace(/<svg [^>]*>/, (tag) =>
      tag.replace(/viewBox="[^"]*"/, `viewBox="${f(view.x)} ${f(view.y)} ${f(view.w)} ${f(view.h)}"`)
        .replace(/width="[^"]*"/, `width="${f(view.w)}mm"`).replace(/height="[^"]*"/, `height="${f(view.h)}mm"`));
  }
  let scale = Math.min(4, Math.max(1, opts.scale ?? 2));
  if (view.w * PX_PER_MM * scale > MAX_WIDTH_PX) scale = MAX_WIDTH_PX / (view.w * PX_PER_MM);
  if (view.h * PX_PER_MM * scale > MAX_HEIGHT_PX) scale = MAX_HEIGHT_PX / (view.h * PX_PER_MM);
  const w = view.w * PX_PER_MM * scale;
  const h = view.h * PX_PER_MM * scale;
  if (w < 8 || h < 8) {
    throw new Error(`a ${f(view.w)} × ${f(view.h)} mm region is too long and thin for one picture; render a part of it`);
  }
  // fit by the side that is nearer its cap, so a thin, tall region cannot pass the height cap
  const fitTo = h / MAX_HEIGHT_PX > w / MAX_WIDTH_PX
    ? { mode: 'height' as const, value: Math.max(1, Math.floor(h)) }
    : { mode: 'width' as const, value: Math.max(1, Math.floor(w)) };
  const resvg = new Resvg(svg, {
    fitTo,
    background: '#ffffff',
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Liberation Sans', sansSerifFamily: 'Liberation Sans' },
  });
  const img = resvg.render();
  return { png: img.asPng(), width: img.width, height: img.height, scale };
}
