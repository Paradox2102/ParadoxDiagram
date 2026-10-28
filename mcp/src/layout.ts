// A first arrangement of a diagram, from the way it connects: the controller and network devices in a row at the
// top, motor controllers in columns in CAN chain order (each with its motor beside it), pneumatics to the right,
// and the power devices in a row at the bottom, battery first. The AI then corrects the details.
import type { Catalog, Icon, Layer } from '../../src/catalog/catalog';
import type { Box } from '../../src/geometry/align';
import { apply } from '../../src/model/actions';
import { GRID_MM, type Doc } from '../../src/model/types';
import { spaceBox } from './place';

const GAP = 20;
const BAND = 40;
const ROWS_PER_COLUMN = 6;

const snap = (v: number) => Math.round(v / GRID_MM) * GRID_MM;
const hasCan = (icon: Icon) => icon.anchors.some((a) => a.kind === 'can');
const isRoot = (icon: Icon) => icon.type === 'controllers' || icon.slug === 'canivore';

/** Devices reached from `starts` along wires of one layer, in visit order (depth first, wire order). */
function walk(doc: Doc, layer: Layer, starts: { device: string; port?: string }[], blocked: (id: string) => boolean): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const visit = (id: string, port?: string) => {
    for (const w of doc.wires) {
      if (w.layer !== layer) continue;
      const here = w.from.device === id && (!port || w.from.port === port) ? w.to
        : w.to.device === id && (!port || w.to.port === port) ? w.from : null;
      if (!here || seen.has(here.device) || blocked(here.device)) continue;
      seen.add(here.device);
      order.push(here.device);
      visit(here.device);
    }
  };
  for (const s of starts) {
    if (!s.port && !seen.has(s.device)) {
      seen.add(s.device);
      order.push(s.device);
    }
    visit(s.device, s.port);
  }
  return order;
}

/** `ids` in the walk's order first, then the rest in document order. */
function ordered(ids: string[], walkOrder: string[]): string[] {
  const set = new Set(ids);
  const first = walkOrder.filter((id) => set.has(id));
  return [...first, ...ids.filter((id) => !first.includes(id))];
}

/** Arrange all devices, or only `ids` (placed to the right of the devices that stay). */
export function autoLayout(doc: Doc, catalog: Catalog, ids?: string[]): Doc {
  const scope = new Set(ids ?? doc.devices.map((d) => d.id));
  const devices = doc.devices.filter((d) => scope.has(d.id));
  const iconOf = (id: string) => catalog.bySlug.get(doc.devices.find((d) => d.id === id)!.slug);
  const box = new Map(devices.map((d) => [d.id, spaceBox(doc, catalog, d)]));
  const type = (id: string) => iconOf(id)?.type ?? '';

  const power: string[] = [];
  const control: string[] = [];
  const motorCtl: string[] = [];
  const plainMotors: string[] = [];
  const pneumatics: string[] = [];
  const other: string[] = [];
  for (const d of devices) {
    const icon = iconOf(d.id);
    const t = type(d.id);
    if (t === 'power') power.push(d.id);
    else if (['controllers', 'communication', 'vision', 'driver-station'].includes(t)) control.push(d.id);
    else if (t === 'motor-controllers' || (t === 'motors' && icon && hasCan(icon))) motorCtl.push(d.id);
    else if (t === 'motors') plainMotors.push(d.id);
    else if (t === 'pneumatics') pneumatics.push(d.id);
    else other.push(d.id);
  }

  // power devices from the battery along the power wires
  const batteries = doc.devices.filter((d) => /battery/.test(d.slug)).map((d) => ({ device: d.id }));
  const powerRow = ordered(power, walk(doc, 'power', batteries, () => false));
  // network devices from the controller along the network wires
  const controllers = doc.devices.filter((d) => type(d.id) === 'controllers').map((d) => ({ device: d.id }));
  const controlRow = ordered(control, walk(doc, 'network', controllers, () => false));
  // motor controllers chain by chain, from each bus root port in port order
  const roots = doc.devices.flatMap((d) => {
    const icon = iconOf(d.id);
    return icon && isRoot(icon) ? icon.anchors.filter((a) => a.kind === 'can').map((a) => ({ device: d.id, port: a.port })) : [];
  });
  const chain = ordered(motorCtl, walk(doc, 'can', roots, (id) => { const i = iconOf(id); return !!i && isRoot(i); }));
  // each plain motor beside the controller that powers it
  const motorsOf = new Map<string, string[]>();
  const loose: string[] = [];
  for (const m of plainMotors) {
    const w = doc.wires.find((x) => x.layer === 'power' && ((x.from.device === m && motorCtl.includes(x.to.device)) || (x.to.device === m && motorCtl.includes(x.from.device))));
    const ctl = w ? (w.from.device === m ? w.to.device : w.from.device) : null;
    if (ctl) motorsOf.set(ctl, [...(motorsOf.get(ctl) ?? []), m]);
    else loose.push(m);
  }
  other.push(...loose);

  const target = new Map<string, { x: number; y: number }>();
  const b = (id: string): Box => box.get(id)!;
  /** Lay a row out from (x, y), tops level; returns the right and bottom edges. */
  const row = (list: string[], x: number, y: number) => {
    let right = x;
    let bottom = y;
    for (const id of list) {
      target.set(id, { x: right, y });
      right += b(id).w + GAP;
      bottom = Math.max(bottom, y + b(id).h);
    }
    return { right: list.length ? right - GAP : x, bottom };
  };

  const top = row(controlRow, 0, 0);
  const middleTop = controlRow.length ? top.bottom + BAND : 0;
  let colX = 0;
  let middleBottom = middleTop;
  for (let c = 0; c < chain.length; c += ROWS_PER_COLUMN) {
    let y = middleTop;
    let width = 0;
    for (const ctl of chain.slice(c, c + ROWS_PER_COLUMN)) {
      const entry = [ctl, ...(motorsOf.get(ctl) ?? [])];
      const h = Math.max(...entry.map((id) => b(id).h));
      let x = colX;
      for (const id of entry) {
        target.set(id, { x, y: y + (h - b(id).h) / 2 });
        x += b(id).w + GAP;
      }
      width = Math.max(width, x - GAP - colX);
      y += h + GAP;
    }
    middleBottom = Math.max(middleBottom, y - GAP);
    colX += width + BAND;
  }
  let y = middleTop;
  for (const id of pneumatics) {
    target.set(id, { x: colX, y });
    y += b(id).h + GAP;
    middleBottom = Math.max(middleBottom, y - GAP);
  }
  const powerTop = chain.length || pneumatics.length ? middleBottom + BAND : middleTop;
  const bottom = row(powerRow, 0, powerTop);
  row(other, powerRow.length ? bottom.right + BAND : 0, powerTop);

  // only some devices: put them to the right of the devices that stay
  let ox = 0;
  let oy = 0;
  const fixed = doc.devices.filter((d) => !scope.has(d.id)).map((d) => spaceBox(doc, catalog, d));
  if (fixed.length) {
    ox = Math.max(...fixed.map((f) => f.x + f.w)) + BAND;
    oy = Math.min(...fixed.map((f) => f.y));
  }
  const moves = devices.map((d) => {
    const t = target.get(d.id)!;
    const bb = b(d.id);
    return { id: d.id, dx: snap(d.x + ox + t.x - bb.x) - d.x, dy: snap(d.y + oy + t.y - bb.y) - d.y };
  });
  return apply(doc, { type: 'moveEach', moves });
}
