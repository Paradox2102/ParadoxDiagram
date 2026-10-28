// A patch is the set of devices and wires that one edit changed. The live link sends each edit as a patch, so an
// edit from the tab and an edit from the AI made at the same time both stay; undo in live mode is the reverse patch.
import type { Device, Doc, Wire } from './types';

export interface DocPatch {
  /** Devices and wires as they are after the edit (new or changed). */
  devices: Device[];
  wires: Wire[];
  /** Ids the edit removed. */
  remove: string[];
  /** Ids the edit created: only these may be added when they are missing. */
  added: string[];
  title?: string;
  hideTags?: boolean;
}

/** JSON with sorted keys, so two equal items compare equal whatever their key order. */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );
}

function diffItems<T extends { id: string }>(before: T[], after: T[], p: { remove: string[]; added: string[] }): T[] {
  const was = new Map(before.map((x) => [x.id, x]));
  const changed: T[] = [];
  for (const x of after) {
    const old = was.get(x.id);
    if (!old) p.added.push(x.id);
    if (!old || canonical(old) !== canonical(x)) changed.push(x);
  }
  const now = new Set(after.map((x) => x.id));
  for (const x of before) if (!now.has(x.id)) p.remove.push(x.id);
  return changed;
}

export function diffDocs(before: Doc, after: Doc): DocPatch {
  const p: DocPatch = { devices: [], wires: [], remove: [], added: [] };
  p.devices = diffItems(before.devices, after.devices, p);
  p.wires = diffItems(before.wires, after.wires, p);
  if (before.title !== after.title) p.title = after.title;
  if (!!before.hideTags !== !!after.hideTags) p.hideTags = !!after.hideTags;
  return p;
}

export function isEmptyPatch(p: DocPatch): boolean {
  return !p.devices.length && !p.wires.length && !p.remove.length && p.title === undefined && p.hideTags === undefined;
}

function upsert<T extends { id: string }>(items: T[], changed: T[], added: Set<string>): { items: T[]; error: string | null } {
  const out = [...items];
  for (const x of changed) {
    const i = out.findIndex((y) => y.id === x.id);
    if (i >= 0) out[i] = x;
    else if (added.has(x.id)) out.push(x);
    else return { items, error: `${x.id} was removed by the other side` };
  }
  return { items: out, error: null };
}

/** The document with the patch applied, or the unchanged document and the reason it cannot apply. */
export function applyPatch(doc: Doc, p: DocPatch): { doc: Doc; error: string | null } {
  const gone = new Set(p.remove);
  const added = new Set(p.added);
  const devs = upsert(doc.devices.filter((d) => !gone.has(d.id)), p.devices, added);
  if (devs.error) return { doc, error: devs.error };
  const ids = new Set(devs.items.map((d) => d.id));
  const kept = doc.wires.filter((w) => !gone.has(w.id) && ids.has(w.from.device) && ids.has(w.to.device));
  const wires = upsert(kept, p.wires, added);
  if (wires.error) return { doc, error: wires.error };
  const broken = wires.items.find((w) => !ids.has(w.from.device) || !ids.has(w.to.device));
  if (broken) return { doc, error: `wire ${broken.id} ends at a device that is gone` };
  const next: Doc = { ...doc, devices: devs.items, wires: wires.items };
  if (p.title !== undefined) next.title = p.title;
  if (p.hideTags === true) next.hideTags = true;
  if (p.hideTags === false) delete next.hideTags;
  return { doc: next, error: null };
}
