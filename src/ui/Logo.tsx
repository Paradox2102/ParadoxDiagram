// The Penrose triangle logo; public/logo.svg is drawn by scripts/penrose.py.
export function Logo({ size = 28 }: { size?: number }) {
  return <img className="logo" src="./logo.svg" width={Math.round(size * 1.155)} height={size} alt="" />;
}
