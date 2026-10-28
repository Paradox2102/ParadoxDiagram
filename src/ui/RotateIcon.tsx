// The clockwise-arrow drawing of the rotate control, shared by the canvas handle and the panel.

/** Arc and arrow head of a clockwise turn (the way devices rotate), drawn in a -10..10 box. */
export const ROTATE_ARC = 'M 4.5 -3 A 5.5 5.5 0 1 0 5 2.5';
export const ROTATE_HEAD = 'M 7.5 -5.5 L 4.5 -3 L 1.5 -6';

export function RotateIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-9 -9 18 18" aria-hidden="true" focusable="false">
      <path d={ROTATE_ARC} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d={ROTATE_HEAD} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
