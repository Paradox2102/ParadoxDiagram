// A patch is the set of devices and wires that one edit changed, down to the fields it changed. The live link sends
// each edit as a patch, so an edit from the tab and an edit from the AI made at the same time both stay, even on one
// device (a drag and a rename); when both change the same field, the later one wins. Undo in live mode is the reverse
// patch.
import type { Device, Doc, Wire } from './types';

export interface DocPatch {
  /** Devices and wires as they are after the edit (new or changed). */
  devices: Device[];
  wires: Wire[];
  /** Ids the edit removed. */
  remove: string[];
  /** Ids the edit created: only these may be added when they are missing. */
  added: string[];
  /** For each changed (not added) item, the fields that changed; the item's other fields keep their current values. */
  keys?: Record<string, string[]>;
  title?: string;
  hideTags?: boolean;
  /** Title-block fields: a value sets it, null removes it. */
  team?: string | null;
  revision?: string | null;
}

/** JSON with sorted keys, so two equal items compare equal whatever their key order. */
function canonical(v: unknown): string {
  return JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );
}

function diffItems<T extends { id: string }>(before: T[], after: T[], p: DocPatch): T[] {
  const was = new Map(before.map((x) => [x.id, x]));
  const changed: T[] = [];
  for (const x of after) {
    const old = was.get(x.id);
    if (!old) {
      p.added.push(x.id);
      changed.push(x);
      continue;
    }
    const a = old as Record<string, unknown>;
    const b = x as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => canonical(a[k]) !== canonical(b[k]));
    if (keys.length) {
      changed.push(x);
      (p.keys ??= {})[x.id] = keys;
    }
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
  for (const key of ['team', 'revision'] as const) if (before[key] !== after[key]) p[key] = after[key] ?? null;
  return p;
}

export function isEmptyPatch(p: DocPatch): boolean {
  return !p.devices.length && !p.wires.length && !p.remove.length && p.title === undefined && p.hideTags === undefined &&
    p.team === undefined && p.revision === undefined;
}

/** The current item with only `keys` taken from the patch (a key missing from the patch item is removed). */
function merge<T>(current: T, from: T, keys: string[] | undefined): T {
  if (!keys) return from;
  const out = { ...current } as Record<string, unknown>;
  const src = from as Record<string, unknown>;
  for (const k of keys) {
    if (k in src) out[k] = src[k];
    else delete out[k];
  }
  return out as T;
}

function upsert<T extends { id: string }>(items: T[], changed: T[], added: Set<string>, keys: DocPatch['keys']): { items: T[]; error: string | null } {
  const out = [...items];
  for (const x of changed) {
    const i = out.findIndex((y) => y.id === x.id);
    if (i >= 0) out[i] = merge(out[i], x, keys?.[x.id]);
    else if (added.has(x.id)) out.push(x);
    else return { items, error: `${x.id} was removed by the other side` };
  }
  return { items: out, error: null };
}

/** The document with the patch applied, or the unchanged document and the reason it cannot apply. */
export function applyPatch(doc: Doc, p: DocPatch): { doc: Doc; error: string | null } {
  const gone = new Set(p.remove);
  const added = new Set(p.added);
  const devs = upsert(doc.devices.filter((d) => !gone.has(d.id)), p.devices, added, p.keys);
  if (devs.error) return { doc, error: devs.error };
  const ids = new Set(devs.items.map((d) => d.id));
  const kept = doc.wires.filter((w) => !gone.has(w.id) && ids.has(w.from.device) && ids.has(w.to.device));
  const wires = upsert(kept, p.wires, added, p.keys);
  if (wires.error) return { doc, error: wires.error };
  const broken = wires.items.find((w) => !ids.has(w.from.device) || !ids.has(w.to.device));
  if (broken) return { doc, error: `wire ${broken.id} ends at a device that is gone` };
  const next: Doc = { ...doc, devices: devs.items, wires: wires.items };
  if (p.title !== undefined) next.title = p.title;
  if (p.hideTags === true) next.hideTags = true;
  if (p.hideTags === false) delete next.hideTags;
  for (const key of ['team', 'revision'] as const) {
    if (typeof p[key] === 'string') next[key] = p[key];
    else if (p[key] === null) delete next[key];
  }
  return { doc: next, error: null };
}
