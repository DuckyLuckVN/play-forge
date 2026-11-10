// Head builders (head bone space: origin at the head centre, face on +z): the head shape, ears, muzzle and
// the hair + headwear style, each picked by the look's key. All merged into one mesh by model.ts; the
// face features (eyes, brows, mouth, blush) are a separate morphing mesh (face.ts).

import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  LatheGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three'
import { BOX_HEAD, HEAD_R, type Rig } from './dims'
import {
  bellyOf,
  limbOf,
  type EarKind,
  type HeadKind,
  type Look,
  type MuzzleKind,
  type StyleKind,
} from './look'
import { emblem } from './body'
import { dir, made, part, place, shade, tint, turn, type Paint, type Part, type Triple } from './merge'
import { PALETTE } from './palette'
import { roundBox } from './shapes'

const R = HEAD_R
const HALF_PI = Math.PI / 2
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)

const B = BOX_HEAD
/**
 * Chibi head deformation (the reference's toy head): wider than tall (`wide` × x, `sy` × y), with soft
 * full cheeks and jaw (x / z bump low on the face). Applied to every head part of a 'chibi' look (so hair
 * and hats follow) and to its face decal surface (face.ts), as a function of the undeformed height y.
 */
export const CHEEK = { wide: 1.05, sy: 0.97, x: 0.1, z: 0.07, y: -0.17, w: 0.15 }
const cheekBump = (y: number) => Math.exp(-(((y - CHEEK.y) / CHEEK.w) ** 2))
/** x scale at (undeformed) height y. */
export const cheekX = (y: number): number => CHEEK.wide + CHEEK.x * cheekBump(y)
/** z scale at (undeformed) height y. */
export const cheekZ = (y: number): number => 1 + CHEEK.z * cheekBump(y)

/** Deforms placed head parts in place by cheekX / cheekZ (normals follow, approximately). */
function puffCheeks(parts: Part[]): Part[] {
  for (const pt of parts) {
    const P = pt.geo.getAttribute('position')
    const N = pt.geo.getAttribute('normal')
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i)
      const fx = cheekX(y)
      const fz = cheekZ(y)
      P.setXYZ(i, P.getX(i) * fx, y * CHEEK.sy, P.getZ(i) * fz)
      const nx = N.getX(i) / fx
      const ny = N.getY(i) / CHEEK.sy
      const nz = N.getZ(i) / fz
      const len = Math.hypot(nx, ny, nz) || 1
      N.setXYZ(i, nx / len, ny / len, nz / len)
    }
  }
  return parts
}

/** Rig scale of the head bone per head kind (the chibi head is a touch smaller than the animals' heads). */
export const HEAD_SCALE: Record<HeadKind, number> = { round: 1, chibi: 0.95, box: 1 }

/** Owner-tuned head size for every look (1 = the size before the smaller-heads change). One place to tune. */
export const HEAD_SIZE = 0.75

/**
 * Head rest placement for a rig (head-bone y in rig space, uniform scale). The head shrinks toward its
 * old bottom, so it stays seated on the shoulders (no neck gap). Hats, ears and antenna ride along.
 */
export function headRest(rig: Rig, kind: HeadKind): { y: number; scale: number } {
  const half = kind === 'box' ? BOX_HEAD.b : HEAD_R
  return { y: rig.headY - half * HEAD_SCALE[kind] * (1 - HEAD_SIZE), scale: HEAD_SCALE[kind] * HEAD_SIZE }
}

export const HEADS: Record<HeadKind, (l: Look) => Part[]> = {
  round: (l) => [part(new SphereGeometry(R, 32, 24), l.skin)],
  /** Human: the round head + a tiny nose bump (cheeks: puffCheeks over all head parts). */
  chibi: (l) => [
    part(new SphereGeometry(R, 34, 24), l.skin),
    part(new SphereGeometry(0.024, 12, 8), l.skin, { p: [0, -0.148, R - 0.02], s: [1.15, 0.8, 0.75] }),
  ],
  /** Robot: a rounded box, a little darker underneath. */
  box: (l) => [
    part(roundBox(B.a, B.b, B.c, B.n, 32, 24), (_x, y) => (y < -B.b * 0.7 ? shade(l.skin, 0.12) : l.skin)),
  ],
}

export const EARS: Record<EarKind, (l: Look) => Part[]> = {
  human: (l) =>
    [-1, 1].map((s) =>
      part(new SphereGeometry(0.064, 14, 10), l.skin, { p: [s * 0.35, -0.06, -0.01], s: [0.6, 1, 0.8] }),
    ),
  none: () => [],
  /** Robot: round bolts on the sides with an accent ring. */
  bolt: (l) =>
    [-1, 1].flatMap((s) => [
      part(new CylinderGeometry(0.075, 0.075, 0.05, 20), shade(l.skin, 0.25), {
        p: [s * B.a, -0.02, 0],
        r: [0, 0, HALF_PI],
      }),
      part(new CylinderGeometry(0.04, 0.04, 0.03, 16), l.accent, {
        p: [s * (B.a + 0.03), -0.02, 0],
        r: [0, 0, HALF_PI],
      }),
    ]),
  /** Panda: round dark ears on top. */
  panda: (l) =>
    [-1, 1].map((s) => {
      const d = dir(0.24 * Math.PI, s * 0.95)
      const p = d.clone().multiplyScalar(R * 0.98)
      return part(new SphereGeometry(0.1, 14, 10), limbOf(l), {
        p: [p.x, p.y, p.z],
        r: turn(Y, d),
        s: [1, 0.75, 0.55],
      })
    }),
}

/**
 * Snout bump: an ellipsoid on the face, centre (0, y, z), radii (a, b, c). Shared with the face decals'
 * surface (face.ts), so the nose and mouth sit on it.
 */
export interface MuzzleDims {
  y: number
  z: number
  a: number
  b: number
  c: number
}
export const MUZZLE_DIMS: Record<Exclude<MuzzleKind, 'none'>, MuzzleDims> = {
  cat: { y: -0.135, z: 0.275, a: 0.12, b: 0.07, c: 0.085 },
  fox: { y: -0.14, z: 0.26, a: 0.125, b: 0.075, c: 0.115 },
  panda: { y: -0.135, z: 0.27, a: 0.135, b: 0.075, c: 0.085 },
  dragon: { y: -0.14, z: 0.27, a: 0.155, b: 0.08, c: 0.1 },
}

function muzzle(d: MuzzleDims, color: number): Part[] {
  return [part(new SphereGeometry(1, 24, 16), color, { p: [0, d.y, d.z], s: [d.a, d.b, d.c] })]
}

export const MUZZLES: Record<MuzzleKind, (l: Look) => Part[]> = {
  none: () => [],
  cat: (l) => muzzle(MUZZLE_DIMS.cat, bellyOf(l)),
  fox: (l) => muzzle(MUZZLE_DIMS.fox, bellyOf(l)),
  panda: (l) => muzzle(MUZZLE_DIMS.panda, bellyOf(l)),
  dragon: (l) => muzzle(MUZZLE_DIMS.dragon, bellyOf(l)),
}

/**
 * Glossy sculpted hair paint: a bright "angel ring" band of highlight round the crown and soft grooves
 * between locks (darker every `grooves`-th of a turn), on top of the base colour.
 */
function hairPaint(color: number, grooves = 10, ring = 0.27): (x: number, y: number, z: number) => number {
  const lit = tint(color, 0.3)
  const dark = shade(color, 0.22)
  return (x, y, z) => {
    const r = Math.hypot(x, y, z) || 1
    const polar = Math.acos(Math.max(-1, Math.min(1, y / r)))
    const az = Math.atan2(x, z)
    const band = Math.exp(-(((polar - ring * Math.PI) / 0.075) ** 2))
    const groove = (0.5 + 0.5 * Math.cos(az * grooves)) ** 6 * Math.min(1, polar / 0.5)
    return mix3(color, lit, dark, band * 0.85, groove * 0.5)
  }
}

/** `base` mixed toward `a` by `ka`, then toward `b` by `kb`. */
function mix3(base: number, a: number, b: number, ka: number, kb: number): number {
  const lerp = (c0: number, c1: number, k: number) => {
    let out = 0
    for (const sh of [16, 8, 0]) {
      const x = (c0 >> sh) & 255
      const y = (c1 >> sh) & 255
      out |= Math.round(x + (y - x) * k) << sh
    }
    return out
  }
  return lerp(lerp(base, a, ka), b, kb)
}

/**
 * A lower edge round the head: keyed (|azimuth| deg → polar deg) points, smoothstepped between; returns the
 * edge's polar angle (rad) at azimuth `az` (rad).
 */
function edgeOf(keys: [number, number][]): (az: number) => number {
  return (az) => {
    const a = (Math.abs(az) * 180) / Math.PI
    let k = 1
    while (k < keys.length - 1 && keys[k][0] < a) k++
    const [a0, p0] = keys[k - 1]
    const [a1, p1] = keys[k]
    const t = Math.min(1, Math.max(0, (a - a0) / (a1 - a0)))
    return ((p0 + (p1 - p0) * t * t * (3 - 2 * t)) * Math.PI) / 180
  }
}

/**
 * A shell fitted to the head: a sphere of radius R·`rs` from the crown down to `edge(az)` (polar, rad) all
 * round, so it wraps the skull (hair shells, cap crowns). Normals point out.
 */
function headShell(edge: (az: number) => number, rs: number, W = 36, H = 18, lift = 1): BufferGeometry {
  // Theta just short of π: three.js drops half the last row's triangles on a closed sphere.
  const g = new SphereGeometry(1, W, H, 0, Math.PI * 2, 0, Math.PI * 0.999)
  const P = g.getAttribute('position')
  const N = g.getAttribute('normal')
  for (let i = 0; i < P.count; i++) {
    const ix = i % (W + 1)
    const iy = Math.floor(i / (W + 1))
    const phi = (ix / W) * Math.PI * 2
    const az = Math.atan2(-Math.cos(phi), Math.sin(phi))
    const d = dir((iy / H) * edge(az), az)
    const up = d.y > 0 ? lift : 1
    P.setXYZ(i, d.x * R * rs, d.y * R * rs * up, d.z * R * rs)
    N.setXYZ(i, d.x, d.y / up, d.z)
  }
  if (lift !== 1) g.computeVertexNormals()
  return g
}

/**
 * Sculpted hair shell: a sphere (radius share `rs`) whose lower edge runs at polar angle `front` (deg)
 * over the forehead, `side` over the ears and `back` at the nape, smoothly in between.
 */
function hairShell(color: number, front: number, side: number, back: number, rs = 1.04, grooves = 10): Part {
  // The back stays low all across the nape.
  const edge = edgeOf([
    [0, front],
    [45, front + (side - front) * 0.3],
    [90, side],
    [125, back - 4],
    [180, back],
  ])
  const pt = part(headShell(edge, rs), hairPaint(color, grooves))
  pt.surf = 'hair'
  return pt
}

/** A flattened lock of hair lying on the head at (polar, az): fringe pieces. */
function lock(color: number, polar: number, az: number, size: number): Part {
  const d = dir(polar, az)
  const p = d.clone().multiplyScalar(R * 1.01)
  return part(new SphereGeometry(size, 12, 8), color, {
    p: [p.x, p.y, p.z],
    r: turn(Z, d),
    s: [1.15, 0.8, 0.42],
  })
}

/** Position + rotation on the head surface at (polar, az): local y up the meridian, z out of the surface, rolled `curl` rad. */
function onHead(polar: number, az: number, rs: number, curl: number): { p: Vector3; r: Quaternion } {
  const d = dir(polar, az)
  const up = new Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize()
  const q = turn(Z, d)
  const fix = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0).applyQuaternion(q), up)
  return {
    p: d.multiplyScalar(R * rs),
    r: fix.multiply(q).multiply(new Quaternion().setFromAxisAngle(Z, curl)),
  }
}

/** A teardrop lock (rounded top, tapering to a tip), unit size, tip on −y: the sculpted clump shape. */
const CLUMP = new LatheGeometry(
  Array.from({ length: 9 }, (_, i) => {
    const t = i / 8
    return new Vector2(1.25 * (1 - t) ** 0.8 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.5, 1 - 2 * t)
  }).reverse(),
  8,
)

/**
 * A sculpted hair clump hugging the head at (polar, az): a teardrop (`len` half length down the meridian,
 * `wid` half width across, rounded top, tip down) wrapped onto the head sphere, `thick` out of it, turned
 * `curl` rad off the meridian, lit on its upper half.
 */
function clump(
  color: number,
  polar: number,
  az: number,
  len: number,
  wid: number,
  curl = 0,
  rs = 1.03,
  shape: BufferGeometry = CLUMP,
  flat = 0.42,
): Part {
  const g = shape.clone()
  const P = g.getAttribute('position')
  const thick = wid * flat
  const c = Math.cos(curl)
  const sn = Math.sin(curl)
  const ring = R * Math.max(0.2, Math.sin(polar))
  let topY = -Infinity
  for (let i = 0; i < P.count; i++) {
    const lx = P.getX(i) * wid
    const ly = P.getY(i) * len
    const x = lx * c - ly * sn
    const y = lx * sn + ly * c
    const d = dir(polar - y / R, az + x / ring)
    const r = R * rs + P.getZ(i) * thick
    P.setXYZ(i, d.x * r, d.y * r, d.z * r)
    topY = Math.max(topY, d.y * r)
  }
  g.computeVertexNormals()
  const lit = tint(color, 0.08)
  const cut = topY - len * 0.6
  const pt = part(g, (_x, y) => (y > cut ? lit : color))
  pt.surf = 'hair'
  return pt
}

/**
 * A blunt fringe: a sheet of hair over the forehead from the crown down to polar `bottom` (rad), across
 * ±`half` rad of azimuth, `rs` out, its cut softly scalloped into `locks` and finished with a rounded lip.
 */
function fringeSheet(color: number, bottom: number, half: number, rs: number, locks: number): Part[] {
  const W = 30
  const H = 8
  const top = 0.08 * Math.PI
  const edge = (az: number) =>
    bottom - 0.035 * Math.abs(Math.sin((az / half) * locks * HALF_PI)) - 0.08 * (az / half) ** 2
  // Theta short of π: three.js drops half the last row's triangles on a closed sphere.
  const g = new SphereGeometry(1, W, H, 0, Math.PI * 2, 0, Math.PI * 0.999)
  const P = g.getAttribute('position')
  const N = g.getAttribute('normal')
  for (let i = 0; i < P.count; i++) {
    const az = -half + ((i % (W + 1)) / W) * 2 * half
    const iy = Math.floor(i / (W + 1))
    const d = dir(top + (iy / H) * (edge(az) - top), az)
    P.setXYZ(i, d.x * R * rs, d.y * R * rs, d.z * R * rs)
    N.setXYZ(i, d.x, d.y, d.z)
  }
  // Azimuth grows with the column like SphereGeometry's own: the winding stays outward.
  const pts: Vector3[] = []
  for (let j = 0; j <= 40; j++) {
    const az = -half + (j / 40) * 2 * half
    pts.push(dir(edge(az), az).multiplyScalar(R * (rs - 0.025)))
  }
  const lip = new TubeGeometry(new CatmullRomCurve3(pts), 36, 0.012, 5, false)
  return made('hair', [part(g, hairPaint(color, locks * 2, 0.18)), part(lip, shade(color, 0.05))])
}

/**
 * A cap bill fixed to a crown rim of horizontal radius `rr` at height `y0`: a D-shaped slab from the rim arc
 * (±`half` rad of azimuth) out to `reach` past the rim's front, `h` thick, its sides drooping `droop` and
 * its front pitched up by `pitch` (rise per metre out). Returns the top sheet, the underside and the
 * rounded outer edge (the inner arc is where it meets the crown).
 */
function capBill(
  rr: number,
  y0: number,
  half: number,
  reach: number,
  h: number,
  droop: number,
  pitch: number,
): { top: BufferGeometry; under: BufferGeometry; edge: BufferGeometry; seam: BufferGeometry } {
  const NU = 24
  const NV = 6
  const wide = rr * Math.sin(half)
  const long = reach + rr * (1 - Math.cos(half))
  const at = (u: number, v: number, dy: number): Vector3 => {
    const t = (u * 2 - 1) * HALF_PI
    const az = (half * t) / HALF_PI
    const ix = rr * Math.sin(az)
    const iz = rr * Math.cos(az)
    const x = ix + (wide * Math.sin(t) - ix) * v
    const z = iz + (rr * Math.cos(half) + long * Math.cos(t) - iz) * v
    return new Vector3(x, y0 + dy - droop * (x / wide) ** 2 * v + pitch * (z - iz), z)
  }
  const sheet = (dy: number, up: boolean) => {
    const pos: number[] = []
    const idx: number[] = []
    for (let j = 0; j <= NV; j++)
      for (let i = 0; i <= NU; i++) {
        const p = at(i / NU, j / NV, dy)
        pos.push(p.x, p.y, p.z)
      }
    for (let j = 0; j < NV; j++)
      for (let i = 0; i < NU; i++) {
        const a = j * (NU + 1) + i
        const b = a + 1
        const c = a + NU + 1
        const d = c + 1
        // (+x, +z) edges: (a, c, b) faces up, (a, b, c) faces down.
        if (up) idx.push(a, c, b, b, c, d)
        else idx.push(a, b, c, b, d, c)
      }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }
  const curve = (v: number, dy: number) =>
    new CatmullRomCurve3(Array.from({ length: 25 }, (_, i) => at(i / 24, v, dy)))
  return {
    top: sheet(0, true),
    under: sheet(-h, false),
    edge: new TubeGeometry(curve(1, -h / 2), 40, h * 0.6, 6, false),
    seam: new TubeGeometry(curve(0.04, -h / 2), 30, h * 0.75, 6, false),
  }
}

/** A rounded lock (both ends round, unit size): fat bangs and lock ends with no points. */
const BLOB = new SphereGeometry(1, 10, 7)

/**
 * A fan of `n` clumps between polar angles a..b (rad) and azimuths az0..az1 (rad), each spanning the band
 * and just overlapping its neighbours, alternately a touch higher: hair locks with grooves between.
 */
function lockFan(
  color: number,
  a: number,
  b: number,
  n: number,
  az0: number,
  az1: number,
  rs: number,
): Part[] {
  const out: Part[] = []
  const mid = (a + b) / 2
  const len = (R * (b - a)) / 2
  const width = (R * Math.sin(mid) * (az1 - az0)) / n
  for (let i = 0; i < n; i++) {
    const az = az0 + ((i + 0.5) / n) * (az1 - az0)
    const shift = i % 2 ? 0.03 : -0.02
    out.push(
      clump(
        i % 2 ? shade(color, 0.04) : color,
        mid + shift,
        az,
        len * 1.05,
        width * 0.62,
        0,
        rs + (i % 2) * 0.008,
        BLOB,
      ),
    )
  }
  return out
}

/** A clumped bun (a ball of short locks) at `c`, radius `r`. */
function bun(color: number, c: Triple, r: number): Part[] {
  const out: Part[] = [part(new SphereGeometry(r * 0.92, 12, 9), shade(color, 0.1), { p: c })]
  for (let i = 0; i < 5; i++) {
    const d = dir(Math.PI * (0.3 + 0.4 * (i % 2)), (i / 5) * Math.PI * 2)
    const q = turn(Y, d)
    out.push(
      part(CLUMP, color, {
        p: [c[0] + d.x * r * 0.35, c[1] + d.y * r * 0.35, c[2] + d.z * r * 0.35],
        r: q,
        s: [r * 0.55, r * 0.75, r * 0.45],
      }),
    )
  }
  return made('hair', out)
}

/** Knit ribs: pushes vertices out along their normal by `depth` · (bump every 1/`ribs` of a turn). */
function ribbed(g: BufferGeometry, ribs: number, depth: number): BufferGeometry {
  const P = g.getAttribute('position')
  const N = g.getAttribute('normal')
  for (let i = 0; i < P.count; i++) {
    const k = depth * (0.5 + 0.5 * Math.cos(Math.atan2(P.getX(i), P.getZ(i)) * ribs))
    P.setXYZ(i, P.getX(i) + N.getX(i) * k, P.getY(i) + N.getY(i) * k, P.getZ(i) + N.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}

/** A fluffy pompom: a sphere with a little hashed bumpiness. */
function fluffy(r: number): BufferGeometry {
  const g = new SphereGeometry(r, 15, 11)
  const P = g.getAttribute('position')
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i)
    const y = P.getY(i)
    const z = P.getZ(i)
    const n = Math.sin(x * 211 + y * 97) * Math.sin(y * 173 + z * 59) * Math.sin(z * 131 + x * 71)
    const k = 1 + 0.07 * n
    P.setXYZ(i, x * k, y * k, z * k)
  }
  g.computeVertexNormals()
  return g
}

/** A band hugging the head between polar angles a..b (open sphere zone), radius share `rs`, tipped `tilt`. */
function zone(paint: Paint, a: number, b: number, rs: number, tilt: number, seg = 40, tube = 0.012): Part[] {
  const r = R * rs
  const rim = (polar: number) =>
    part(new TorusGeometry(r * Math.sin(polar), tube, 8, seg), paint, {
      p: [0, r * Math.cos(polar), 0],
      r: [HALF_PI, 0, 0],
    })
  return place([part(new SphereGeometry(r, seg, 6, 0, Math.PI * 2, a, b - a), paint), rim(a), rim(b)], {
    r: [-tilt, 0, 0],
  })
}

/** The shuttlecock logo lying on the head surface at (polar, az), `rs` out, scaled `k`. */
function headLogo(polar: number, az: number, rs: number, k: number, tilt = 0): Part[] {
  const d = dir(polar, az)
  const p = d.clone().multiplyScalar(R * rs)
  return place(made('plastic', emblem(PALETTE.emblem, [0, 0, 0], [0, 0, 0], k)), {
    p: [p.x, p.y, p.z],
    r: turn(Z, d).premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -tilt)),
  })
}

/**
 * A chunky hair spike rooted at (polar, az): a flattened blade-like cone leaning back by `back`, its tip
 * curving further back/up by `bend` (share of its length), splayed `splay` rad further out than the
 * surface normal, dark at the root, glossy toward the tip.
 */
function spike(
  color: number,
  polar: number,
  az: number,
  len: number,
  back = 0.45,
  r0 = 0.058,
  bend = 0.22,
  splay = 0,
): Part {
  const d = dir(polar, az)
  const aim = dir(polar + splay, az)
    .add(new Vector3(0, 0, -back))
    .normalize()
  const p = d
    .clone()
    .multiplyScalar(R * 0.96)
    .addScaledVector(aim, len * 0.42)
  // Flattened across the meridian: a thick blade-like clump rather than a round thorn.
  const across = new Vector3(Math.cos(az), 0, -Math.sin(az))
  const q = turn(Y, aim)
  const lx = new Vector3(1, 0, 0).applyQuaternion(q)
  const roll = Math.atan2(lx.clone().cross(across).dot(aim), lx.dot(across))
  // Bend in the cone's own frame: local −z is back along the meridian once rolled.
  const g = new ConeGeometry(r0, len, 8, 4)
  const P = g.getAttribute('position')
  for (let i = 0; i < P.count; i++) {
    const t = P.getY(i) / len + 0.5
    P.setZ(i, P.getZ(i) - bend * len * t * t)
  }
  g.computeVertexNormals()
  const root = shade(color, 0.3)
  const tip = tint(color, 0.12)
  const pt = part(
    g,
    (x, y, z) => mix3(root, tip, tip, Math.min(1, Math.max(0, (Math.hypot(x, y, z) - R) / (len * 0.8))), 0),
    {
      p: [p.x, p.y, p.z],
      r: q.multiply(new Quaternion().setFromAxisAngle(Y, roll)),
      s: [1, 1, 0.62],
    },
  )
  pt.surf = 'hair'
  return pt
}

/**
 * Cloud's cap: the crown rim (|azimuth| deg → polar deg: over the brows at the front, just above the ears,
 * low at the back), the dark band's depth above the rim (rad), the bill's half arc (rad) and reach (m).
 */
const CAP = {
  rim: [
    [0, 70],
    [50, 76],
    [95, 86],
    [140, 98],
    [180, 102],
  ] as [number, number][],
  band: 0.3,
  billHalf: 1.0,
  reach: 0.24,
  /** Crown height share above the head centre (the reference's tall structured front panels). */
  lift: 1.1,
}

export const STYLES: Record<StyleKind, (l: Look) => Part[]> = {
  /** Berry: rounded fringe clumps, side locks, locks radiating from the crown, buns with ties, clips, a bow. */
  bowPigtails: (l) => {
    const acc = l.accent
    const hair = l.hair
    const out = [hairShell(shade(hair, 0.12), 56, 104, 160, 1.03, 0)]
    // Fringe: one thick blunt-cut sheet over the forehead, soft lock grooves, a rounded lip at the cut.
    out.push(...fringeSheet(hair, 0.43 * Math.PI, 1.3, 1.06, 6))
    for (const s of [-1, 1]) out.push(clump(hair, 0.47 * Math.PI, s * 1.22, 0.14, 0.055, s * 0.1, 1.02, BLOB))
    // Back: long locks radiating from the crown down to the nape (grooves between them).
    out.push(...lockFan(hair, 0.05 * Math.PI, 0.86 * Math.PI, 13, 1.35, 2 * Math.PI - 1.35, 1.045))
    for (const s of [-1, 1]) {
      // Pigtail buns low behind the ears (clumped), a ring tie where they meet the head.
      out.push(...bun(hair, [s * 0.35, -0.1, -0.11], 0.1))
      out.push(
        ...made('plastic', [
          part(new TorusGeometry(0.052, 0.019, 8, 16), tint(acc, 0.35), {
            p: [s * 0.285, -0.08, -0.09],
            r: [0, s * 1.05, 0],
          }),
        ]),
      )
    }
    // Two hair clips on the right bangs.
    for (const [polar, az] of [
      [0.3, -0.82],
      [0.37, -0.9],
    ]) {
      const { p, r } = onHead(polar * Math.PI, az, 1.08, 1.2)
      out.push(
        ...made('plastic', [part(new CapsuleGeometry(0.016, 0.065, 3, 8), acc, { p: [p.x, p.y, p.z], r })]),
      )
    }
    const bow: Part[] = [part(new SphereGeometry(0.048, 12, 10), shade(acc, 0.08))]
    for (const s of [-1, 1])
      bow.push(
        part(new SphereGeometry(0.11, 16, 12), acc, {
          p: [s * 0.11, 0.008, 0],
          r: [0, 0, s * 0.3],
          s: [1.1, 0.72, 0.45],
        }),
        part(new SphereGeometry(0.042, 10, 8), acc, {
          p: [s * 0.05, -0.065, 0.004],
          r: [0, 0, s * 0.5],
          s: [0.7, 1.4, 0.35],
        }),
      )
    out.push(...made('plastic', place(bow, { p: [0.1, 0.35, 0.03], r: [0.2, 0.15, -0.25], s: 1.3 })))
    return out
  },
  /** Cloud: a high six-panel cap (button, seams, long brim with a dark underside, logo, back strap + adjuster) over short clumped hair. */
  capFringe: (l) => {
    const acc = l.accent
    const hair = l.hair
    const navy = shade(acc, 0.84)
    // Smooth short hair under the cap (glossy, a few soft grooves), a fringe under the bill, sideburns.
    const out = [hairShell(hair, 66, 98, 150, 1.03, 6)]
    // Fringe locks swept to one side, rooted under the crown so only their tips show below the bill.
    for (let i = 0; i < 4; i++) {
      const t = i / 3 - 0.5
      out.push(clump(hair, 0.47 * Math.PI, t * 1.2 + 0.05, 0.085, 0.085, 0.45, 1.025, CLUMP, 0.3))
    }
    for (const s of [-1, 1]) out.push(clump(hair, 0.5 * Math.PI, s * 1.25, 0.07, 0.04, 0, 1.02, BLOB))
    // Crown: a six-panel shell fitted over the skull down to just above the ears (rim low at the back),
    // seams from the top button, a dark band round the rim's sides + back, a dark lip where the bill meets it.
    const CS = 1.085
    const rimOf = edgeOf(CAP.rim)
    const back = (x: number, z: number) => Math.abs(Math.atan2(x, z)) > CAP.billHalf
    const crown = (x: number, y: number, z: number) => {
      const az = Math.atan2(x, z)
      const yy = y > 0 ? y / CAP.lift : y
      const polar = Math.acos(Math.max(-1, Math.min(1, yy / (Math.hypot(x, yy, z) || 1))))
      // The band runs deepest at the back and tapers toward the bill.
      const deep = CAP.band * (0.45 + 0.55 * Math.min(1, (Math.abs(az) - CAP.billHalf) / 1.2))
      if (back(x, z) && polar > rimOf(az) - deep) return navy
      const seam = Math.abs(Math.cos(az * 3)) < 0.045 && polar > 0.07
      return seam ? shade(acc, 0.3) : mix3(acc, tint(acc, 0.12), acc, Math.cos(az * 3) ** 2 * 0.6, 0)
    }
    const rr = R * CS * Math.sin(rimOf(0))
    const y0 = R * CS * Math.cos(rimOf(0))
    const b = capBill(rr, y0, CAP.billHalf, CAP.reach, 0.018, 0.04, -0.32)
    const lip = new TubeGeometry(
      new CatmullRomCurve3(
        Array.from({ length: 48 }, (_, i) => {
          const az = (i / 48 - 0.5) * Math.PI * 2
          return dir(rimOf(az), az).multiplyScalar(R * CS)
        }),
        true,
      ),
      56,
      0.011,
      6,
      true,
    )
    const cap: Part[] = [
      part(headShell(rimOf, CS, 40, 24, CAP.lift), crown),
      part(lip, (x, _y, z) => (back(x, z) ? navy : shade(acc, 0.08))),
      part(new SphereGeometry(0.03, 10, 6), acc, { p: [0, R * CS * CAP.lift - 0.004, 0], s: [1, 0.55, 1] }),
      part(b.top, (x) => (Math.abs(x) > rr * 0.97 ? shade(acc, 0.1) : acc)),
      part(b.under, navy),
      part(b.edge, shade(acc, 0.06)),
      part(b.seam, navy),
      // Back: strap with a rectangular adjuster buckle on the dark band.
      part(roundBox(0.05, 0.032, 0.012, 4, 12, 8), tint(acc, 0.65), {
        p: [0, R * CS * Math.cos(rimOf(Math.PI)) + 0.04, -R * CS * 0.985],
      }),
    ]
    made('cloth', cap)
    const logo = headLogo(0.22 * Math.PI, 0, CS + 0.012, 3.2)
    for (const pt of logo) pt.geo.translate(0, R * CS * (CAP.lift - 1) * Math.cos(0.22 * Math.PI), 0)
    out.push(...cap, ...logo)
    return out
  },
  /** Sunny: a crown of big chunky spikes, a wide headband with a logo, clumped hair below it. */
  bandSpiky: (l) => {
    const hair = l.hair
    const out = [hairShell(shade(hair, 0.1), 62, 88, 142, 1.03, 0)]
    // Big thick clumps in rings (polar share, azimuth offset, count, length, base radius), swept back,
    // all rooted above the headband so it shows all round.
    const rings: [number, number, number, number, number][] = [
      [0.03, 0.2, 2, 0.25, 0.15],
      [0.12, 0.0, 6, 0.24, 0.15],
      [0.22, 0.35, 9, 0.21, 0.13],
    ]
    for (const [p, off, n, len, r0] of rings)
      for (let i = 0; i < n; i++)
        out.push(spike(hair, p * Math.PI, off + (i / n) * Math.PI * 2, len, 0.22, r0 * 1.45, 0.22, p * 1.6))

    // Back hair below the band (starts under its lower edge so no lock pokes through it).
    out.push(...lockFan(hair, 0.47 * Math.PI, 0.72 * Math.PI, 11, 1.5, 2 * Math.PI - 1.5, 1.035))
    for (const s of [-1, 1]) out.push(clump(hair, 0.5 * Math.PI, s * 1.2, 0.06, 0.035, 0, 1.015, BLOB))
    // Headband: snug round the forehead and skull (follows the head's curve), thick rolled edges, tipped
    // back (front low over the brows, back higher), the logo centred on its front.
    const band = l.accent
    const SB = { top: 0.33 * Math.PI, bottom: 0.45 * Math.PI, rs: 1.045, tilt: 0.07 }
    out.push(
      ...place(
        [
          ...made(
            'cloth',
            zone(
              (_x, y) => (y > 0.13 ? tint(band, 0.06) : shade(band, 0.06)),
              SB.top,
              SB.bottom,
              SB.rs,
              0,
              48,
              0.024,
            ),
          ),
          ...headLogo((SB.top + SB.bottom) / 2, 0, SB.rs + 0.035, 3.1),
        ],
        { r: [SB.tilt, 0, 0] },
      ),
    )
    return out
  },
  /** Mint: matte ribbed knit beanie (dome, thick fold with a logo, fluffy pompom) over short swept hair. */
  beanie: (l) => {
    const acc = l.accent
    const hair = l.hair
    const tilt = 0.15
    const RIBS = 26
    const rib = (k: number) => (x: number, _y: number, z: number) =>
      Math.cos(Math.atan2(x, z) * RIBS) > 0 ? shade(acc, k) : shade(acc, k + 0.17)
    const out = [hairShell(shade(hair, 0.1), 66, 86, 142, 1.025, 0)]
    for (let i = 0; i < 5; i++) {
      const t = i / 4 - 0.5
      out.push(clump(hair, 0.41 * Math.PI, t * 1.3 - 0.08, 0.1, 0.085, -0.6, 1.035, CLUMP, 0.25))
    }
    for (const s of [-1, 1]) out.push(clump(hair, 0.45 * Math.PI, s * 1.2, 0.06, 0.035, 0, 1.015, BLOB))
    out.push(...lockFan(hair, 0.44 * Math.PI, 0.72 * Math.PI, 10, 1.5, 2 * Math.PI - 1.5, 1.03))
    // Fold: a thick rounded ring with real ribs (radial bumps); dome with ribs; pompom with fluff.
    // Cuff profile (radius, height) following the skull's taper: snug at its lower edge, leaning in at
    // the top like the head under it, a thick rounded roll.
    const FOLD: [number, number][] = [
      [0.37, 0.03],
      [0.392, 0.036],
      [0.404, 0.06],
      [0.402, 0.105],
      [0.392, 0.15],
      [0.376, 0.172],
      [0.355, 0.176],
      [0.37, 0.03],
    ]
    const fold = ribbed(
      new LatheGeometry(
        FOLD.map(([r, y]) => new Vector2(r, y)),
        RIBS * 3,
      ),
      RIBS,
      0.011,
    )
    const dome = ribbed(new SphereGeometry(0.382, RIBS * 3, 12, 0, Math.PI * 2, 0, HALF_PI), RIBS, 0.009)
    const hat: Part[] = [
      ...made('knit', [
        part(fold, rib(0.04)),
        part(dome, rib(0), { p: [0, 0.07, 0], s: [0.97, 0.96, 0.97] }),
        part(fluffy(0.088), 0xffffff, { p: [0, 0.07 + 0.367 + 0.058, 0] }),
      ]),
      ...made('plastic', emblem(PALETTE.emblem, [0, 0.105, 0.41], [-0.12, 0, 0], 3.6)),
    ]
    out.push(...place(hat, { r: [-tilt, 0, 0] }))
    return out
  },
  /** Cat: three tabby stripes on the forehead, one on each cheek. */
  tabby: (l) => [
    stripe(l.hair, 0.2 * Math.PI, -0.22, 0.09, 0.15),
    stripe(l.hair, 0.17 * Math.PI, 0, 0.1),
    stripe(l.hair, 0.2 * Math.PI, 0.22, 0.09, -0.15),
    stripe(l.hair, 0.6 * Math.PI, -1.15, 0.07, HALF_PI),
    stripe(l.hair, 0.6 * Math.PI, 1.15, 0.07, HALF_PI),
  ],
  /** Bunny: a fluffy tuft on the crown. */
  tuft: (l) =>
    [
      [0, 0.09, 0.055],
      [-0.045, 0.05, 0.045],
      [0.045, 0.05, 0.045],
    ].map(([x, z, r]) => part(new SphereGeometry(r, 12, 8), l.hair, { p: [x, R * 0.97, z] })),
  /** Panda: a bamboo leaf sprig clipped on the side. */
  leaf: (l) => {
    const leaf = new SphereGeometry(0.06, 12, 8)
    const sprig: Part[] = [
      part(new CylinderGeometry(0.012, 0.012, 0.09, 6), shade(l.accent, 0.1), { r: [0, 0, 0.5] }),
      part(leaf, 0x6cc46a, { p: [0.05, 0.03, 0], r: [0, 0, -0.7], s: [0.45, 1.3, 0.2] }),
      part(leaf, 0x4fae55, { p: [-0.02, 0.06, 0.01], r: [0, 0, 0.35], s: [0.4, 1.15, 0.2] }),
    ]
    return place(sprig, { p: [-0.2, 0.27, 0.08], r: [0.2, 0.3, 0.55] })
  },
  /** Fox: a forehead tuft and white cheek fluff. */
  foxFringe: (l) => {
    const out = [lock(l.hair, 0.27 * Math.PI, -0.18, 0.07), lock(l.hair, 0.25 * Math.PI, 0.16, 0.075)]
    for (const s of [-1, 1])
      out.push(
        part(new SphereGeometry(0.1, 14, 10), bellyOf(l), {
          p: [s * 0.27, -0.13, 0.15],
          r: [0, s * 0.6, s * -0.4],
          s: [1, 0.7, 0.55],
        }),
      )
    return out
  },
  /** Dragon: two curved cream horns and a row of little fins down the back of the head. */
  horns: (l) => {
    const out: Part[] = []
    for (const s of [-1, 1]) {
      const d = dir(0.2 * Math.PI, s * 0.7)
      const aim = d
        .clone()
        .add(new Vector3(0, 0.8, -0.5))
        .normalize()
      const p = d
        .clone()
        .multiplyScalar(R * 0.95)
        .addScaledVector(aim, 0.06)
      out.push(part(new ConeGeometry(0.045, 0.15, 12), l.hair, { p: [p.x, p.y, p.z], r: turn(Y, aim) }))
    }
    for (let i = 0; i < 3; i++) {
      const d = dir((0.32 + i * 0.16) * Math.PI, Math.PI)
      const p = d.clone().multiplyScalar(R * 0.97)
      out.push(
        part(new ConeGeometry(0.06 - i * 0.01, 0.13, 12), l.accent, {
          p: [p.x, p.y, p.z],
          r: turn(Y, d),
          s: [0.45, 1, 1],
        }),
      )
    }
    return out
  },
  /** Slime: a jelly drop tip on top and glossy highlights. */
  drop: (l) => [
    part(new ConeGeometry(0.1, 0.16, 18), l.skin, { p: [0, R + 0.03, -0.02], r: [-0.25, 0, 0.15] }),
    part(new SphereGeometry(0.06, 12, 8), tint(l.skin, 0.75), {
      p: [-0.17, 0.22, 0.2],
      r: [0.5, -0.4, 0.6],
      s: [1, 0.55, 0.3],
    }),
    part(new SphereGeometry(0.025, 8, 6), tint(l.skin, 0.8), { p: [-0.1, 0.29, 0.17], s: [1, 1, 0.4] }),
  ],
  /** Robot: panel seams over the top and a chin vent. */
  visor: (l) => {
    const seam = shade(l.skin, 0.35)
    const box = new BoxGeometry(1, 1, 1)
    return [
      part(box, seam, { p: [0, B.b - 0.004, 0], s: [0.012, 0.012, B.c * 1.4] }),
      part(box, seam, { p: [0, 0.2, -B.c + 0.01], s: [B.a * 1.2, 0.012, 0.012] }),
      ...[-0.04, 0, 0.04].map((x) =>
        part(box, seam, { p: [x, -B.b + 0.05, B.c - 0.04], s: [0.02, 0.012, 0.05] }),
      ),
    ]
  },
  /** Ghost: a little curled wisp on top. */
  wisp: (l) => [
    part(new ConeGeometry(0.06, 0.13, 14), l.skin, { p: [0.02, R + 0.04, 0], r: [0, 0, -0.5] }),
    part(new SphereGeometry(0.03, 10, 8), l.skin, { p: [0.07, R + 0.085, 0] }),
  ],
}

/** A flat stripe lying on the head at (polar, az): tabby markings. */
function stripe(color: number, polar: number, az: number, len: number, roll = 0): Part {
  const d = dir(polar, az)
  const p = d.clone().multiplyScalar(R * 0.995)
  return part(new SphereGeometry(0.03, 10, 6), color, {
    p: [p.x, p.y, p.z],
    r: turn(Z, d).multiply(new Quaternion().setFromAxisAngle(Z, roll)),
    s: [0.7, len / 0.06, 0.3],
  })
}

/** Head shape + ears + muzzle + hair/headwear, in head space. */
export function headParts(l: Look): Part[] {
  const parts = [...HEADS[l.head](l), ...EARS[l.ears](l), ...MUZZLES[l.muzzle](l), ...STYLES[l.style](l)]
  return l.head === 'chibi' ? puffCheeks(parts) : parts
}
