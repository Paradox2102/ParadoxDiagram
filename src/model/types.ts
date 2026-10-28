import type { Layer } from '../catalog/catalog';

export type Rot = 0 | 90 | 180 | 270;

/** A direction on the page: the side a wire leaves its port by. */
export type Side = 'up' | 'down' | 'left' | 'right';
export const SIDES: Side[] = ['left', 'right', 'up', 'down'];

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
  /** Hide this device's label (name, CAN ID, power channel). */
  hideTag?: boolean;
  /** Where the label sits beside the device (default: bottom). */
  tagSide?: TagSide;
  /** A static IPv4 address, or DHCP. */
  ip?: string;
  /** The CAN bus, when the user names it (else found from the CAN chain). */
  canBus?: string;
  /** Extra label/value pairs; the ones marked onLabel show in the label. */
  fields?: CustomField[];
}

export interface CustomField {
  label: string;
  value: string;
  onLabel?: boolean;
}

/** An id that a person or an AI chooses for a device or a wire. */
export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

export type TagSide = 'bottom' | 'top' | 'left' | 'right';
export const TAG_SIDES: TagSide[] = ['bottom', 'top', 'left', 'right'];

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
  /** The side each end leaves its port by, when the user chose it (else automatic). */
  fromSide?: Side;
  toSide?: Side;
  /** Power wires: the fuse or breaker size at the channel, in amps. */
  fuseA?: number;
  /** Power wires: the wire gauge (AWG). */
  awg?: number;
}

export interface Doc {
  format: 'paradox-diagram';
  version: 1;
  title: string;
  devices: Device[];
  wires: Wire[];
  /** Hide every device label. */
  hideTags?: boolean;
}

export const GRID_MM = 5;

export function emptyDoc(): Doc {
  return { format: 'paradox-diagram', version: 1, title: 'Untitled diagram', devices: [], wires: [] };
}
