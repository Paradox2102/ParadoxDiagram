import type { Layer } from '../catalog/catalog';

export type Rot = 0 | 90 | 180 | 270;

export interface Point {
  x: number;
  y: number;
}

export interface Device {
  id: string;
  slug: string;
  x: number;
  y: number;
  rot: Rot;
  name: string;
  canId: number | null;
  notes: string;
}

export interface PortRef {
  device: string;
  port: string;
}

export interface Wire {
  id: string;
  layer: Layer;
  from: PortRef;
  to: PortRef;
  bends: Point[];
  note: string;
}

export interface Doc {
  format: 'paradox-diagram';
  version: 1;
  title: string;
  devices: Device[];
  wires: Wire[];
}

export const GRID_MM = 5;

export function emptyDoc(): Doc {
  return { format: 'paradox-diagram', version: 1, title: 'Untitled diagram', devices: [], wires: [] };
}
