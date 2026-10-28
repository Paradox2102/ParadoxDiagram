// Placement for the AI: one device beside another, a row, a column, or an edge lined up. Gaps are measured between
// the boxes that include each label, so labels do not overlap; positions land on the 5 mm grid.
import type { Catalog } from '../../src/catalog/catalog';
import { alignMoves, type AlignMode, type Box } from '../../src/geometry/align';
import { boundsOf, keepOutBox } from '../../src/geometry/scene';
import type { Action } from '../../src/model/actions';
import { deviceTag } from '../../src/model/tags';
import { GRID_MM, type Device, type Doc } from '../../src/model/types';

export const DEFAULT_GAP_MM = 20;

export interface Relative {
  right_of?: string;
  left_of?: string;
  above?: string;
  below?: string;
  gap?: number;
  align?: 'start' | 'center' | 'end';
}

/** A device and its label: the space it needs. */
export function spaceBox(doc: Doc, catalog: Catalog, d: Device): Box {
  return keepOutBox(catalog, d, doc.hideTags, deviceTag(doc, d.id, catalog));
}

const round = (v: number) => Math.round(v / GRID_MM) * GRID_MM;
const up = (v: number) => Math.ceil(v / GRID_MM - 1e-9) * GRID_MM;
const down = (v: number) => Math.floor(v / GRID_MM + 1e-9) * GRID_MM;

function device(doc: Doc, id: string): Device {
  const d = doc.devices.find((x) => x.id === id);
  if (!d) throw new Error(`no device "${id}"`);
  return d;
}

/** Move one device so its box starts at (bx, by); x and y snap with the given functions. */
function moveTo(doc: Doc, catalog: Catalog, d: Device, bx: number, by: number, sx = round, sy = round) {
  const b = spaceBox(doc, catalog, d);
  return { id: d.id, dx: sx(d.x + bx - b.x) - d.x, dy: sy(d.y + by - b.y) - d.y };
}

/** Put a device beside another one: right_of, left_of, above or below, with a gap and an alignment. */
export function relativePlace(doc: Doc, catalog: Catalog, id: string, rel: Relative): Action {
  const d = device(doc, id);
  const keys = (['right_of', 'left_of', 'above', 'below'] as const).filter((k) => rel[k] !== undefined);
  if (keys.length !== 1) throw new Error('give exactly one of right_of, left_of, above, below');
  const key = keys[0];
  const other = device(doc, rel[key]!);
  if (other.id === id) throw new Error('a device cannot be placed beside itself');
  const gap = rel.gap ?? DEFAULT_GAP_MM;
  const o = spaceBox(doc, catalog, other);
  const b = spaceBox(doc, catalog, d);
  const along = (start: number, size: number, own: number) =>
    rel.align === 'start' ? start : rel.align === 'end' ? start + size - own : start + (size - own) / 2;
  let move;
  if (key === 'right_of') move = moveTo(doc, catalog, d, o.x + o.w + gap, along(o.y, o.h, b.h), up);
  else if (key === 'left_of') move = moveTo(doc, catalog, d, o.x - gap - b.w, along(o.y, o.h, b.h), down);
  else if (key === 'below') move = moveTo(doc, catalog, d, along(o.x, o.w, b.w), o.y + o.h + gap, round, up);
  else move = moveTo(doc, catalog, d, along(o.x, o.w, b.w), o.y - gap - b.h, round, down);
  return { type: 'moveEach', moves: [move] };
}

function line(doc: Doc, catalog: Catalog, ids: string[], gap: number, axis: 'x' | 'y', start?: { x?: number; y?: number }): Action {
  const devs = ids.map((id) => device(doc, id));
  const boxes = devs.map((d) => spaceBox(doc, catalog, d));
  const first = boxes[0];
  // the line's centre: rows line up their middles, columns their centres
  const mid = axis === 'x' ? (start?.y ?? first.y) + first.h / 2 : (start?.x ?? first.x) + first.w / 2;
  let at = axis === 'x' ? (start?.x ?? first.x) : (start?.y ?? first.y);
  const moves = devs.map((d, i) => {
    const b = boxes[i];
    const m = axis === 'x' ? moveTo(doc, catalog, d, at, mid - b.h / 2) : moveTo(doc, catalog, d, mid - b.w / 2, at);
    at += (axis === 'x' ? b.w : b.h) + gap;
    return m;
  });
  return { type: 'moveEach', moves };
}

/** Devices left to right in the given order, middles level, `gap` mm apart. */
export const rowMoves = (doc: Doc, catalog: Catalog, ids: string[], gap = DEFAULT_GAP_MM, start?: { x?: number; y?: number }) =>
  line(doc, catalog, ids, gap, 'x', start);

/** Devices top to bottom in the given order, centres in line, `gap` mm apart. */
export const columnMoves = (doc: Doc, catalog: Catalog, ids: string[], gap = DEFAULT_GAP_MM, start?: { x?: number; y?: number }) =>
  line(doc, catalog, ids, gap, 'y', start);

/** Line the device outlines (labels excluded) up on one edge or centre line, as Arrange does in the app. */
export function alignOp(doc: Doc, catalog: Catalog, ids: string[], edge: AlignMode): Action {
  const boxes = new Map(ids.map((id) => [id, boundsOf(catalog, device(doc, id))]));
  return { type: 'moveEach', moves: [...alignMoves(boxes, edge)].map(([id, m]) => ({ id, ...m })) };
}
