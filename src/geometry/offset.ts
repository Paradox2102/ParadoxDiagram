import type { Point } from '../model/types';

/** Left normal of travel in SVG (y down) coordinates. */
function normal(a: Point, b: Point): Point {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
}

/**
 * Offset an orthogonal polyline by d mm, to the left of travel for d > 0. Where the route turns
 * back on itself, the line keeps its side of the cable (as a real two-wire cable folds), so the
 * two lines of a pair never swap sides on a slant.
 */
export function offsetPolyline(path: Point[], d: number): Point[] {
  // one offset direction per segment; the sign flips at each turn-back
  const seg: Point[] = [];
  let sign = 1;
  for (let i = 0; i < path.length - 1; i++) {
    const n = normal(path[i], path[i + 1]);
    if (i > 0) {
      const prev = normal(path[i - 1], path[i]);
      if (Math.abs(prev.x + n.x) < 1e-9 && Math.abs(prev.y + n.y) < 1e-9) sign = -sign;
    }
    seg.push({ x: n.x * sign, y: n.y * sign });
  }
  return path.map((p, i) => {
    const nIn = i > 0 ? seg[i - 1] : null;
    const nOut = i < seg.length ? seg[i] : null;
    let n = nIn ?? nOut!;
    if (nIn && nOut) {
      const turn = Math.abs(nIn.x * nOut.y - nIn.y * nOut.x) > 1e-9;
      n = turn ? { x: nIn.x + nOut.x, y: nIn.y + nOut.y } : nIn;
    }
    return { x: p.x + n.x * d, y: p.y + n.y * d };
  });
}
