// Placement of an icon in the document: a device's (x, y) is where its frame origin sits,
// and rotation turns the icon about its frame centre. The frame is the body view (no caption).
import { iconFrame, type Anchor, type Icon } from '../catalog/catalog';
import type { Device, Point } from '../model/types';

export type Dir = 'up' | 'down' | 'left' | 'right';

const TURN: Record<Dir, Dir> = { right: 'down', down: 'left', left: 'up', up: 'right' };
const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0; // + 0 turns -0 into 0

export function deviceTransform(d: Device, icon: Icon): string {
  const [vx, vy, w, h] = iconFrame(icon);
  const rot = d.rot ? ` rotate(${d.rot} ${vx + w / 2} ${vy + h / 2})` : '';
  return `translate(${r3(d.x - vx)} ${r3(d.y - vy)})${rot}`;
}

/** World point of a local icon point. */
export function toWorld(d: Device, icon: Icon, local: Point): Point {
  const [vx, vy, w, h] = iconFrame(icon);
  const dx = local.x - (vx + w / 2);
  const dy = local.y - (vy + h / 2);
  const t = (d.rot * Math.PI) / 180;
  const c = Math.round(Math.cos(t));
  const s = Math.round(Math.sin(t));
  return { x: r3(d.x + w / 2 + dx * c - dy * s), y: r3(d.y + h / 2 + dx * s + dy * c) };
}

/** The side of the frame nearest the anchor, before rotation. */
export function localDir(icon: Icon, a: Anchor): Dir {
  const [vx, vy, w, h] = iconFrame(icon);
  const gaps: [Dir, number][] = [
    ['left', a.x - vx], ['right', vx + w - a.x], ['up', a.y - vy], ['down', vy + h - a.y],
  ];
  return gaps.reduce((best, g) => (g[1] < best[1] ? g : best))[0];
}

/** Extra cost (mm) for leaving a port by a side other than the nearest one. */
export const SIDE_PENALTY_MM = 15;

/**
 * The sides a port may leave by, in the icon's own frame: the nearest side (free), and any side
 * at most twice as far, or 10 mm further, at SIDE_PENALTY_MM. Farther sides would cross the body.
 */
export function portSides(icon: Icon, a: Anchor): { dir: Dir; penalty: number }[] {
  const [vx, vy, w, h] = iconFrame(icon);
  const gaps: [Dir, number][] = [
    ['left', a.x - vx], ['right', vx + w - a.x], ['up', a.y - vy], ['down', vy + h - a.y],
  ];
  gaps.sort((p, q) => p[1] - q[1]);
  const near = gaps[0][1];
  return gaps
    .filter(([, g], i) => i === 0 || g <= Math.max(2 * near, near + 10))
    .map(([dir], i) => ({ dir, penalty: i === 0 ? 0 : SIDE_PENALTY_MM }));
}

/** A port's sides after the device's rotation. */
export function portSidesWorld(d: Device, icon: Icon, a: Anchor): { dir: Dir; penalty: number }[] {
  return portSides(icon, a).map((s) => ({ ...s, dir: turn(s.dir, d.rot) }));
}

const turn = (dir: Dir, rot: number): Dir => {
  let out = dir;
  for (let r = 0; r < rot; r += 90) out = TURN[out];
  return out;
};

export function portWorld(d: Device, icon: Icon, a: Anchor): { p: Point; dir: Dir } {
  return { p: toWorld(d, icon, a), dir: turn(localDir(icon, a), d.rot) };
}

export function deviceBounds(d: Device, icon: Icon): { x: number; y: number; w: number; h: number } {
  const [, , w, h] = iconFrame(icon);
  const turned = d.rot === 90 || d.rot === 270;
  const bw = turned ? h : w;
  const bh = turned ? w : h;
  return { x: r3(d.x + w / 2 - bw / 2), y: r3(d.y + h / 2 - bh / 2), w: bw, h: bh };
}
