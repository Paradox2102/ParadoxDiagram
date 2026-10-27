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

export function portWorld(d: Device, icon: Icon, a: Anchor): { p: Point; dir: Dir } {
  let dir = localDir(icon, a);
  for (let r = 0; r < d.rot; r += 90) dir = TURN[dir];
  return { p: toWorld(d, icon, a), dir };
}

export function deviceBounds(d: Device, icon: Icon): { x: number; y: number; w: number; h: number } {
  const [, , w, h] = iconFrame(icon);
  const turned = d.rot === 90 || d.rot === 270;
  const bw = turned ? h : w;
  const bh = turned ? w : h;
  return { x: r3(d.x + w / 2 - bw / 2), y: r3(d.y + h / 2 - bh / 2), w: bw, h: bh };
}
