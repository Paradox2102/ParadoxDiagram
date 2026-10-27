# Draws the Paradox Diagram logo: a Penrose triangle as an isometric view of three bars
# (red along x, blue along y, gold up z). Usage: python3 scripts/penrose.py 4 > public/logo.svg
import math, sys
n = int(sys.argv[1]) if len(sys.argv) > 1 else 4
C = math.cos(math.radians(30))
def P(x, y, z): return ((x - y) * C, (x + y) * 0.5 - z)
def mix(h, t, a):
    c = [int(h[i:i+2], 16) for i in (1, 3, 5)]; t = [int(t[i:i+2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(c[i] + (t[i] - c[i]) * a):02x}' for i in range(3))
def faces(x0, x1, y0, y1, z0, z1, col):
    top = [P(x0,y0,z1), P(x1,y0,z1), P(x1,y1,z1), P(x0,y1,z1)]
    fx = [P(x1,y0,z0), P(x1,y1,z0), P(x1,y1,z1), P(x1,y0,z1)]
    fy = [P(x0,y1,z0), P(x1,y1,z0), P(x1,y1,z1), P(x0,y1,z1)]
    return [(top, mix(col,'#ffffff',0.35)), (fx, col), (fy, mix(col,'#000000',0.25))]
R, B, G = '#cf222e', '#0969da', '#e3b341'
polys = []
polys += faces(0, n+1, 0, 1, 0, 1, R)          # bar along x
polys += faces(n, n+1, 1, n+1, 0, 1, B)        # bar along y
polys += faces(n, n+1, n, n+1, 1, n, G)        # bar up z, ends under the start of the x bar
f = faces(0, 2, 0, 1, 0, 1, R); polys += [f[0], f[2]]   # red top and side over the end of the z bar
polys = [([(y, -x) for x, y in poly], col) for poly, col in polys]   # turn so a corner points up
pts = [p for poly, _ in polys for p in poly]
xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
x0, y0 = min(xs), min(ys); w, h = max(xs) - x0, max(ys) - y0
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.3f} {y0:.3f} {w:.3f} {h:.3f}" width="{400*w/h:.0f}" height="400">']
for poly, col in polys:
    out.append(f'<polygon points="{" ".join(f"{x:.3f},{y:.3f}" for x, y in poly)}" fill="{col}" stroke="{col}" stroke-width="0.03" stroke-linejoin="round"/>')
out.append('</svg>')
print('\n'.join(out))
