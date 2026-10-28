import { COLORS, pathD, type WirePath } from '../geometry/scene';
import type { Point, Wire } from '../model/types';

// On screen, the gray signal line follows the theme. The black (−) conductor stays black, since black means
// negative; in the dark theme it gets a thin light casing so it shows on the dark canvas. Exports draw the
// same paths with their fixed colors and no casing.
const SCREEN_STROKE: Record<string, string> = { [COLORS.signal]: 'wire-signal' };
/** How far the casing shows on each side of a black conductor, in mm. */
const CASING_MM = 0.15;

interface Props {
  wire: Wire;
  paths: WirePath[];
  points: Point[] | null;
  selected: boolean;
}

export function WireView({ wire, paths, points, selected }: Props) {
  if (!points) return null;
  const d = pathD(points);
  return (
    <g data-wire={wire.id}>
      {selected && (
        <path d={d} fill="none" stroke="#0969da" strokeOpacity={0.22} strokeWidth={4} strokeLinejoin="round" pointerEvents="none" />
      )}
      {paths.map((p, i) =>
        p.stroke === COLORS.neg ? (
          <path
            key={`c${i}`} d={p.d} fill="none" className="wire-casing" stroke="none" strokeWidth={p.width + 2 * CASING_MM}
            strokeDasharray={p.dash} strokeLinejoin="round" pointerEvents="none"
          />
        ) : null,
      )}
      {paths.map((p, i) => (
        <path
          key={i} d={p.d} fill="none" stroke={p.stroke} strokeWidth={p.width} strokeDasharray={p.dash} className={SCREEN_STROKE[p.stroke]}
          strokeLinejoin="round" pointerEvents="none"
        />
      ))}
      <path d={d} className="wire-hit" strokeWidth={12} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/** Drag targets for a selected wire: interior segments and the stored bends. */
export function WireHandles({ wire, points }: { wire: Wire; points: Point[] }) {
  const segs = [];
  for (let i = 1; i < points.length - 2; i++) {
    const a = points[i];
    const b = points[i + 1];
    const horizontal = a.y === b.y;
    segs.push(
      <line
        key={`s${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="segment-hit" data-seg={`${wire.id}:${i}`}
        strokeWidth={12} vectorEffect="non-scaling-stroke" style={{ cursor: horizontal ? 'ns-resize' : 'ew-resize' }}
      />,
    );
  }
  return (
    <g>
      {segs}
      {wire.bends.map((p, i) => (
        <rect
          key={`b${i}`} x={p.x - 1.4} y={p.y - 1.4} width={2.8} height={2.8} className="handle-fill" fill="#ffffff" stroke="#0969da"
          strokeWidth={1.5} vectorEffect="non-scaling-stroke" data-bend={`${wire.id}:${i}`} style={{ cursor: 'move' }}
        >
          <title>Drag to move the bend; double-click to remove it</title>
        </rect>
      ))}
    </g>
  );
}
