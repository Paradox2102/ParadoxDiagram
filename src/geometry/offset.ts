import type { Point } from '../model/types';

/** Left normal of travel in SVG (y down) coordinates. */
function normal(a: Point, b: Point): Point {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
}

/** Offset an orthogonal polyline by d mm, to the left of travel for d > 0. */
export function offsetPolyline(path: Point[], d: number): Point[] {
  return path.map((p, i) => {
    const nIn = i > 0 ? normal(path[i - 1], p) : null;
    const nOut = i < path.length - 1 ? normal(p, path[i + 1]) : null;
    let n = nIn ?? nOut!;
    if (nIn && nOut) {
      const turn = Math.abs(nIn.x * nOut.y - nIn.y * nOut.x) > 1e-9;
      n = turn ? { x: nIn.x + nOut.x, y: nIn.y + nOut.y } : nIn;
    }
    return { x: p.x + n.x * d, y: p.y + n.y * d };
  });
}
