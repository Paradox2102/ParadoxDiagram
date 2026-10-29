// Every edit to a document goes through apply(). Documents are never changed in place.
import type { Layer } from '../catalog/catalog';
import { nextId } from './ids';
import { applyPatch, type DocPatch } from './patch';
import { GRID_MM, type CustomField, type Device, type Doc, type Point, type PortRef, type Rot, type Side, type TagSide, type Wire } from './types';

/** A change to a device; null removes an optional field. */
export interface DevicePatch {
  name?: string;
  canId?: number | null;
  notes?: string;
  ip?: string | null;
  canBus?: string | null;
  fields?: CustomField[] | null;
}

/** A change to a wire; null removes an optional field. */
export interface WirePatch {
  note?: string;
  fuseA?: number | null;
  awg?: number | null;
}

export type Action =
  | { type: 'addDevice'; slug: string; name: string; x: number; y: number; id?: string }
  | { type: 'moveDevices'; ids: string[]; dx: number; dy: number; snap?: boolean }
  | { type: 'rotateDevices'; ids: string[] }
  | { type: 'updateDevice'; id: string; patch: DevicePatch }
  | { type: 'addWire'; layer: Layer; from: PortRef; to: PortRef; id?: string }
  | { type: 'setBends'; id: string; bends: Point[]; sides?: { from?: Side; to?: Side } }
  | { type: 'setWireSide'; id: string; end: 'from' | 'to'; side: Side | null }
  | { type: 'resetRoute'; id: string }
  | { type: 'updateWire'; id: string; patch: WirePatch }
  | { type: 'delete'; ids: string[] }
  | { type: 'setTitle'; title: string }
  /** Team and revision for the title block; an empty value removes the field, a missing one keeps it. */
  | { type: 'setDetails'; team?: string; revision?: string }
  | { type: 'setTagHidden'; ids: string[]; hidden: boolean }
  | { type: 'setTagSide'; ids: string[]; side: TagSide }
  | { type: 'setHideTags'; hidden: boolean }
  | { type: 'moveEach'; moves: { id: string; dx: number; dy: number }[] }
  /** Adds pasted devices and wires (ids and positions already chosen by pasteItems). */
  | { type: 'paste'; devices: Device[]; wires: Wire[] }
  /** Puts back the devices and wires of a patch (live edits, and undo in live mode). */
  | { type: 'restore'; patch: DocPatch };

export const snap = (v: number) => Math.round(v / GRID_MM) * GRID_MM;

const samePort = (a: PortRef, b: PortRef) => a.device === b.device && a.port === b.port;

/** The item with the patch applied: a null value removes that key (canId keeps null, its "none"). */
function patched<T extends object>(item: T, patch: object, keepNull: string[] = []): T {
  const next = { ...item } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null && !keepNull.includes(k)) delete next[k];
    else next[k] = v;
  }
  return next as T;
}

export function apply(doc: Doc, action: Action): Doc {
  switch (action.type) {
    case 'addDevice': {
      const device: Device = {
        id: action.id ?? nextId('d', doc.devices), slug: action.slug, x: snap(action.x), y: snap(action.y),
        rot: 0, name: action.name, canId: null, notes: '',
      };
      return { ...doc, devices: [...doc.devices, device] };
    }
    case 'moveDevices': {
      const ids = new Set(action.ids);
      const s = action.snap === false ? (v: number) => v : snap;
      return {
        ...doc,
        devices: doc.devices.map((d) => (ids.has(d.id) ? { ...d, x: s(d.x + action.dx), y: s(d.y + action.dy) } : d)),
      };
    }
    case 'rotateDevices': {
      const ids = new Set(action.ids);
      return {
        ...doc,
        devices: doc.devices.map((d) => (ids.has(d.id) ? { ...d, rot: ((d.rot + 90) % 360) as Rot } : d)),
      };
    }
    case 'updateDevice':
      return { ...doc, devices: doc.devices.map((d) => (d.id === action.id ? patched(d, action.patch, ['canId']) : d)) };
    case 'addWire': {
      const { from, to } = action;
      if (samePort(from, to)) return doc;
      const dup = doc.wires.some(
        (w) => (samePort(w.from, from) && samePort(w.to, to)) || (samePort(w.from, to) && samePort(w.to, from)),
      );
      if (dup) return doc;
      const wire: Wire = { id: action.id ?? nextId('w', doc.wires), layer: action.layer, from, to, bends: [], note: '' };
      return { ...doc, wires: [...doc.wires, wire] };
    }
    case 'setBends': {
      const { sides } = action;
      return {
        ...doc,
        wires: doc.wires.map((w) => {
          if (w.id !== action.id) return w;
          const next: Wire = { ...w, bends: action.bends };
          if (sides?.from) next.fromSide = sides.from;
          if (sides?.to) next.toSide = sides.to;
          return next;
        }),
      };
    }
    case 'setWireSide':
      return {
        ...doc,
        wires: doc.wires.map((w) => {
          if (w.id !== action.id) return w;
          const next: Wire = { ...w };
          const key = action.end === 'from' ? 'fromSide' : 'toSide';
          if (action.side) next[key] = action.side;
          else delete next[key];
          return next;
        }),
      };
    case 'resetRoute':
      return {
        ...doc,
        wires: doc.wires.map((w) => {
          if (w.id !== action.id) return w;
          const { fromSide: _f, toSide: _t, ...rest } = w;
          return { ...rest, bends: [] };
        }),
      };
    case 'updateWire':
      return { ...doc, wires: doc.wires.map((w) => (w.id === action.id ? patched(w, action.patch) : w)) };
    case 'delete': {
      const ids = new Set(action.ids);
      return {
        ...doc,
        devices: doc.devices.filter((d) => !ids.has(d.id)),
        wires: doc.wires.filter((w) => !ids.has(w.id) && !ids.has(w.from.device) && !ids.has(w.to.device)),
      };
    }
    case 'setTitle':
      return { ...doc, title: action.title };
    case 'setDetails': {
      const next: Doc = { ...doc };
      for (const key of ['team', 'revision'] as const) {
        const v = action[key]?.trim();
        if (v === undefined) continue;
        if (v) next[key] = v;
        else delete next[key];
      }
      return next;
    }
    case 'setTagHidden': {
      const ids = new Set(action.ids);
      return { ...doc, devices: doc.devices.map((d) => (ids.has(d.id) ? { ...d, hideTag: action.hidden } : d)) };
    }
    case 'setTagSide': {
      const ids = new Set(action.ids);
      return {
        ...doc,
        devices: doc.devices.map((d) => {
          if (!ids.has(d.id)) return d;
          const { tagSide: _, ...rest } = d;
          return action.side === 'bottom' ? rest : { ...rest, tagSide: action.side };
        }),
      };
    }
    case 'setHideTags':
      return { ...doc, hideTags: action.hidden };
    case 'restore':
      return applyPatch(doc, action.patch).doc;
    case 'paste':
      return { ...doc, devices: [...doc.devices, ...action.devices], wires: [...doc.wires, ...action.wires] };
    case 'moveEach': {
      // exact amounts, no grid: alignment and spacing must not be undone by rounding
      const by = new Map(action.moves.map((m) => [m.id, m]));
      return {
        ...doc,
        devices: doc.devices.map((d) => {
          const m = by.get(d.id);
          return m && (m.dx || m.dy) ? { ...d, x: d.x + m.dx, y: d.y + m.dy } : d;
        }),
      };
    }
  }
}
