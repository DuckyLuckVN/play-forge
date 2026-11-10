// Low-poly outline shell (the far twin's head outline): a star-shaped sphere around a detailed mesh, ~1.4k
// triangles whatever the head costs. Each shell vertex starts `w` past the mesh near its direction, then
// every mesh point that still pokes out (spike tips, bow edges) pushes the shell triangle over it out until
// it sits a little inside. Measured against the old inflated head (front / side / back silhouettes, the
// four humans): same median outline width, mean difference ≈ 5 mm (under a pixel on the far twin);
// concave gaps (under a cap bill) are bridged. Runs once per look at load time (allocation is fine here).

import { BufferAttribute, BufferGeometry, SphereGeometry } from 'three'

/** Shell resolution: round the face axis (the silhouette seen from the front) × face → back rows. */
const HULL_SEG = { around: 48, rows: 16 }
/** First guess: mesh points within this angle (rad) of a shell direction, projected onto it. */
const REACH = 0.08
/** Cover pass: every mesh point ends at least this share of `w` inside the shell along its direction. */
const COVER = 0.3
const TAU = Math.PI * 2

/**
 * A back-face outline shell for `geo` (model space, origin inside the mesh, star-shaped from it): a sphere
 * with poles on ±z (its fine ring runs round the front silhouette), `w` outside the mesh, every mesh vertex
 * at least COVER·w inside it along its own direction. Position only, indexed.
 */
export function radialHull(geo: BufferGeometry, w: number): BufferGeometry {
  const { around: W, rows: H } = HULL_SEG
  const P = geo.getAttribute('position')
  const n = P.count
  // Mesh points as unit directions + lengths.
  const dir = new Float32Array(n * 3)
  const len = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = P.getX(i)
    const y = P.getY(i)
    const z = P.getZ(i)
    const l = Math.hypot(x, y, z) || 1
    dir[i * 3] = x / l
    dir[i * 3 + 1] = y / l
    dir[i * 3 + 2] = z / l
    len[i] = l
  }
  const shell = new SphereGeometry(1, W, H)
  // Poles from ±y onto ±z: (x, y, z) → (x, −z, y), a proper rotation, so the winding stays outward.
  shell.rotateX(Math.PI / 2)
  const S = shell.getAttribute('position')
  const m = S.count
  const ux = new Float32Array(m)
  const uy = new Float32Array(m)
  const uz = new Float32Array(m)
  const rad = new Float32Array(m)
  // 1. First guess per shell vertex: the furthest mesh point close to its direction (else the nearest).
  const cosReach = Math.cos(REACH)
  for (let j = 0; j < m; j++) {
    const dx = (ux[j] = S.getX(j))
    const dy = (uy[j] = S.getY(j))
    const dz = (uz[j] = S.getZ(j))
    let far = 0
    let nearCos = -2
    let nearR = 0
    for (let i = 0; i < n; i++) {
      const c = dir[i * 3] * dx + dir[i * 3 + 1] * dy + dir[i * 3 + 2] * dz
      if (c >= cosReach) far = Math.max(far, len[i] * c)
      else if (c > nearCos) {
        nearCos = c
        nearR = len[i] * c
      }
    }
    rad[j] = Math.max(far > 0 ? far : nearR, w) + w
  }
  // 2. Cover every point: find the shell triangle over its direction and push its corners out until the
  // point sits COVER·w inside it. Radii only grow, so points already covered stay covered.
  const at = (ix: number, iy: number) => iy * (W + 1) + ix
  for (let i = 0; i < n; i++) {
    const vx = dir[i * 3]
    const vy = dir[i * 3 + 1]
    const vz = dir[i * 3 + 2]
    // Inverse of the rotated SphereGeometry layout: z = cos θ, (x, y) = −(cos φ, sin φ) sin θ.
    const fv = (Math.acos(Math.max(-1, Math.min(1, vz))) / Math.PI) * H
    let fu = (Math.atan2(-vy, -vx) / TAU) * W
    if (fu < 0) fu += W
    const iy = Math.min(H - 1, Math.floor(fv))
    const ix = Math.min(W - 1, Math.floor(fu))
    // Cell corners as SphereGeometry indexes them: a b d (upper) and b c d (lower), split on b–d.
    const a = at(ix + 1, iy)
    const b = at(ix, iy)
    const c = at(ix, iy + 1)
    const d = at(ix + 1, iy + 1)
    const upper = iy === H - 1 || (iy !== 0 && fu - ix >= fv - iy)
    const [p, q, r] = upper ? [a, b, d] : [b, c, d]
    const need = len[i] + w * COVER
    // Raise the corners by their share of the point (least change), until the point is covered.
    for (let k = 0; k < 6; k++) {
      const t = rayPlane(vx, vy, vz, p, q, r, ux, uy, uz, rad)
      if (!(t > 0) || t >= need - 1e-5) break
      // Corner weights (either winding), clamped to the triangle.
      let lp = bary(vx, vy, vz, q, r, ux, uy, uz)
      let lq = bary(vx, vy, vz, r, p, ux, uy, uz)
      let lr = bary(vx, vy, vz, p, q, ux, uy, uz)
      const flip = lp + lq + lr < 0 ? -1 : 1
      lp = Math.max(0, lp * flip)
      lq = Math.max(0, lq * flip)
      lr = Math.max(0, lr * flip)
      const sum = lp + lq + lr
      if (!(sum > 0)) break
      const wp = lp / sum
      const wq = lq / sum
      const wr = lr / sum
      const g = (need - t) / (wp * wp + wq * wq + wr * wr)
      rad[p] += g * wp
      rad[q] += g * wq
      rad[r] += g * wr
    }
  }
  // 3. Seam column and pole rows are duplicated vertices: one radius each (no cracks).
  for (let iy = 0; iy <= H; iy++) {
    const r = Math.max(rad[at(0, iy)], rad[at(W, iy)])
    rad[at(0, iy)] = rad[at(W, iy)] = r
  }
  for (const iy of [0, H]) {
    let r = 0
    for (let ix = 0; ix <= W; ix++) r = Math.max(r, rad[at(ix, iy)])
    for (let ix = 0; ix <= W; ix++) rad[at(ix, iy)] = r
  }
  const pos = new Float32Array(m * 3)
  for (let j = 0; j < m; j++) {
    pos[j * 3] = ux[j] * rad[j]
    pos[j * 3 + 1] = uy[j] * rad[j]
    pos[j * 3 + 2] = uz[j] * rad[j]
  }
  const out = new BufferGeometry()
  out.setAttribute('position', new BufferAttribute(pos, 3))
  out.setIndex(shell.getIndex()!.clone())
  out.computeBoundingSphere()
  shell.dispose()
  return out
}

/** Distance along unit direction v from the origin to the plane through shell vertices p, q, r (≤ 0: none). */
function rayPlane(
  vx: number,
  vy: number,
  vz: number,
  p: number,
  q: number,
  r: number,
  ux: Float32Array,
  uy: Float32Array,
  uz: Float32Array,
  rad: Float32Array,
): number {
  const ax = ux[p] * rad[p]
  const ay = uy[p] * rad[p]
  const az = uz[p] * rad[p]
  const e1x = ux[q] * rad[q] - ax
  const e1y = uy[q] * rad[q] - ay
  const e1z = uz[q] * rad[q] - az
  const e2x = ux[r] * rad[r] - ax
  const e2y = uy[r] * rad[r] - ay
  const e2z = uz[r] * rad[r] - az
  const nx = e1y * e2z - e1z * e2y
  const ny = e1z * e2x - e1x * e2z
  const nz = e1x * e2y - e1y * e2x
  const dn = nx * vx + ny * vy + nz * vz
  if (Math.abs(dn) < 1e-12) return 0
  return (nx * ax + ny * ay + nz * az) / dn
}

/**
 * Unnormalised weight, for direction v, of the corner opposite shell edge (p, q): the triple product
 * v · (p × q) of the unit directions (∝ the sub-triangle (v, p, q)).
 */
function bary(
  vx: number,
  vy: number,
  vz: number,
  p: number,
  q: number,
  ux: Float32Array,
  uy: Float32Array,
  uz: Float32Array,
): number {
  const cx = uy[p] * uz[q] - uz[p] * uy[q]
  const cy = uz[p] * ux[q] - ux[p] * uz[q]
  const cz = ux[p] * uy[q] - uy[p] * ux[q]
  return vx * cx + vy * cy + vz * cz
}
