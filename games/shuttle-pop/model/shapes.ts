// Extra primitive shapes for the builders (load time only): a rounded box (superellipsoid) with exact
// normals, and its front surface height for the face decals.

import { BufferAttribute, SphereGeometry, type BufferGeometry } from 'three'

/** Superellipsoid |x/a|ⁿ + |y/b|ⁿ + |z/c|ⁿ = 1 (n = 2: an ellipsoid, larger: boxier), indexed. */
export function roundBox(a: number, b: number, c: number, n: number, wSeg = 28, hSeg = 20): BufferGeometry {
  const g = new SphereGeometry(1, wSeg, hSeg)
  const P = g.getAttribute('position')
  const N = g.getAttribute('normal') as BufferAttribute
  const f = (v: number, s: number) => Math.abs(v / s) ** n
  for (let i = 0; i < P.count; i++) {
    const dx = P.getX(i)
    const dy = P.getY(i)
    const dz = P.getZ(i)
    // Scale the unit direction onto the surface.
    const k = (f(dx, a) + f(dy, b) + f(dz, c)) ** (-1 / n)
    const x = dx * k
    const y = dy * k
    const z = dz * k
    P.setXYZ(i, x, y, z)
    // Gradient of the implicit function.
    const gx = (Math.sign(x) * Math.abs(x) ** (n - 1)) / a ** n
    const gy = (Math.sign(y) * Math.abs(y) ** (n - 1)) / b ** n
    const gz = (Math.sign(z) * Math.abs(z) ** (n - 1)) / c ** n
    const len = Math.hypot(gx, gy, gz) || 1
    N.setXYZ(i, gx / len, gy / len, gz / len)
  }
  return g
}

/** Front (+z) height of that rounded box at (u, v), grown by `lift`; 0 outside its outline. */
export function roundBoxZ(
  a: number,
  b: number,
  c: number,
  n: number,
  u: number,
  v: number,
  lift: number,
): number {
  const q = 1 - Math.abs(u / (a + lift)) ** n - Math.abs(v / (b + lift)) ** n
  return q > 0 ? (c + lift) * q ** (1 / n) : 0
}
