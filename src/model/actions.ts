// Every edit to a document goes through apply(). Documents are never changed in place.
import type { Layer } from '../catalog/catalog';
import { nextId } from './ids';
import { GRID_MM, type Device, type Doc, type Point, type PortRef, type Rot, type Wire } from './types';

export type Action =
  | { type: 'addDevice'; slug: string; name: string; x: number; y: number }
  | { type: 'moveDevices'; ids: string[]; dx: number; dy: number; snap?: boolean }
  | { type: 'rotateDevices'; ids: string[] }
  | { type: 'updateDevice'; id: string; patch: Partial<Pick<Device, 'name' | 'canId' | 'notes'>> }
  | { type: 'addWire'; layer: Layer; from: PortRef; to: PortRef }
  | { type: 'setBends'; id: string; bends: Point[] }
  | { type: 'updateWire'; id: string; patch: { note: string } }
  | { type: 'delete'; ids: string[] }
  | { type: 'setTitle'; title: string }
  | { type: 'setTagHidden'; ids: string[]; hidden: boolean }
  | { type: 'setHideTags'; hidden: boolean }
  | { type: 'moveEach'; moves: { id: string; dx: number; dy: number }[] };

export const snap = (v: number) => Math.round(v / GRID_MM) * GRID_MM;

const samePort = (a: PortRef, b: PortRef) => a.device === b.device && a.port === b.port;

export function apply(doc: Doc, action: Action): Doc {
  switch (action.type) {
    case 'addDevice': {
      const device: Device = {
        id: nextId('d', doc.devices), slug: action.slug, x: snap(action.x), y: snap(action.y),
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
      return { ...doc, devices: doc.devices.map((d) => (d.id === action.id ? { ...d, ...action.patch } : d)) };
    case 'addWire': {
      const { from, to } = action;
      if (samePort(from, to)) return doc;
      const dup = doc.wires.some(
        (w) => (samePort(w.from, from) && samePort(w.to, to)) || (samePort(w.from, to) && samePort(w.to, from)),
      );
      if (dup) return doc;
      const wire: Wire = { id: nextId('w', doc.wires), layer: action.layer, from, to, bends: [], note: '' };
      return { ...doc, wires: [...doc.wires, wire] };
    }
    case 'setBends':
      return { ...doc, wires: doc.wires.map((w) => (w.id === action.id ? { ...w, bends: action.bends } : w)) };
    case 'updateWire':
      return { ...doc, wires: doc.wires.map((w) => (w.id === action.id ? { ...w, ...action.patch } : w)) };
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
    case 'setTagHidden': {
      const ids = new Set(action.ids);
      return { ...doc, devices: doc.devices.map((d) => (ids.has(d.id) ? { ...d, hideTag: action.hidden } : d)) };
    }
    case 'setHideTags':
      return { ...doc, hideTags: action.hidden };
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
