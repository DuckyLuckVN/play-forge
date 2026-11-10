// Baked ambient occlusion for the merged chibi meshes (load time only): the toy look's soft creases under
// hair, brims and collars, at the neck, where a sleeve meets the arm. The surfaces are splatted into a
// coarse voxel grid; each vertex then marches a fixed fan of directions over its normal's hemisphere and
// counts how many hit something within `reach`. Pure (plain arrays in, a factor per vertex out).

/** Occluding geometry: positions (xyz triples) and a triangle index. */
export interface Occluder {
  pos: ArrayLike<number>
  index: ArrayLike<number>
}

export interface AoOpts {
  /** How far a crease reaches (m). */
  reach: number
  /** Darkening of a fully enclosed vertex (0..1). */
  strength: number
  /** Voxel edge (m). */
  voxel: number
}

export const AO_DEFAULTS: AoOpts = { reach: 0.07, strength: 0.5, voxel: 0.011 }

/** Unit directions spread over the +z hemisphere (cosine-ish: more near the pole). */
const FAN: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = []
  const N = 14
  for (let i = 0; i < N; i++) {
    const z = Math.sqrt(1 - (i + 0.5) / N)
    const r = Math.sqrt(1 - z * z)
    const a = i * 2.39996
    out.push([r * Math.cos(a), r * Math.sin(a), z])
  }
  return out
})()

/**
 * Visibility factor per vertex of `mesh` (1 = open, 1 − strength = fully enclosed), occluded by the mesh
 * itself and `extra` geometry (other bones at rest: the head over the neck, the shirt over the shorts).
 */
export function bakeAO(
  mesh: Occluder & { nor: ArrayLike<number> },
  extra: readonly Occluder[] = [],
  opts: AoOpts = AO_DEFAULTS,
): Float32Array {
  const all = [mesh, ...extra]
  const v = opts.voxel
  let x0 = Infinity
  let y0 = Infinity
  let z0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  let z1 = -Infinity
  for (const o of all)
    for (let i = 0; i < o.pos.length; i += 3) {
      x0 = Math.min(x0, o.pos[i])
      y0 = Math.min(y0, o.pos[i + 1])
      z0 = Math.min(z0, o.pos[i + 2])
      x1 = Math.max(x1, o.pos[i])
      y1 = Math.max(y1, o.pos[i + 1])
      z1 = Math.max(z1, o.pos[i + 2])
    }
  const count = mesh.pos.length / 3
  const out = new Float32Array(count).fill(1)
  if (count === 0) return out
  const pad = 2
  const nx = Math.ceil((x1 - x0) / v) + 1 + pad * 2
  const ny = Math.ceil((y1 - y0) / v) + 1 + pad * 2
  const nz = Math.ceil((z1 - z0) / v) + 1 + pad * 2
  const grid = new Uint8Array(nx * ny * nz)
  const cell = (x: number, y: number, z: number) => {
    const i = Math.floor((x - x0) / v) + pad
    const j = Math.floor((y - y0) / v) + pad
    const k = Math.floor((z - z0) / v) + pad
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1
    return (k * ny + j) * nx + i
  }
  // Splat every triangle densely enough to leave no holes.
  for (const o of all) {
    const P = o.pos
    const I = o.index
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3
      const b = I[t + 1] * 3
      const c = I[t + 2] * 3
      const e = Math.max(
        Math.hypot(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]),
        Math.hypot(P[a] - P[c], P[a + 1] - P[c + 1], P[a + 2] - P[c + 2]),
        Math.hypot(P[b] - P[c], P[b + 1] - P[c + 1], P[b + 2] - P[c + 2]),
      )
      const n = Math.max(1, Math.ceil((e / v) * 2))
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= n - i; j++) {
          const u = i / n
          const w = j / n
          const s = 1 - u - w
          const id = cell(
            P[a] * s + P[b] * u + P[c] * w,
            P[a + 1] * s + P[b + 1] * u + P[c + 1] * w,
            P[a + 2] * s + P[b + 2] * u + P[c + 2] * w,
          )
          if (id >= 0) grid[id] = 1
        }
    }
  }
  const P = mesh.pos
  const N = mesh.nor
  const start = v * 1.75
  for (let i = 0; i < count; i++) {
    const px = P[i * 3]
    const py = P[i * 3 + 1]
    const pz = P[i * 3 + 2]
    const zx = N[i * 3]
    const zy = N[i * 3 + 1]
    const zz = N[i * 3 + 2]
    // Tangent frame about the normal.
    let tx = Math.abs(zy) < 0.9 ? -zz : 0
    let ty = Math.abs(zy) < 0.9 ? 0 : zz
    let tz = Math.abs(zy) < 0.9 ? zx : -zy
    const tl = Math.hypot(tx, ty, tz) || 1
    tx /= tl
    ty /= tl
    tz /= tl
    const bx = zy * tz - zz * ty
    const by = zz * tx - zx * tz
    const bz = zx * ty - zy * tx
    const ox = px + zx * start
    const oy = py + zy * start
    const oz = pz + zz * start
    let hit = 0
    let total = 0
    for (const [a, b, c] of FAN) {
      const dx = tx * a + bx * b + zx * c
      const dy = ty * a + by * b + zy * c
      const dz = tz * a + bz * b + zz * c
      total += c
      for (let d = 0; d <= opts.reach; d += v) {
        const id = cell(ox + dx * d, oy + dy * d, oz + dz * d)
        if (id >= 0 && grid[id]) {
          // Near hits darken more than far ones.
          hit += c * (1 - (0.5 * d) / opts.reach)
          break
        }
      }
    }
    out[i] = 1 - opts.strength * (hit / total)
  }
  return out
}
