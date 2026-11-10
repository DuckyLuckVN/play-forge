// Head builders (head bone space: origin at the head centre, face on +z): the head shape, ears, muzzle and
// the hair + headwear style, each picked by the look's key. All merged into one mesh by model.ts; the
// face features (eyes, brows, mouth, blush) are a separate morphing mesh (face.ts).

import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  LatheGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three'
import { BOX_HEAD, HEAD_R } from './dims'
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
import { dir, part, place, shade, tint, turn, type Paint, type Part } from './merge'
import { PALETTE } from './palette'
import { roundBox } from './shapes'

const R = HEAD_R
const HALF_PI = Math.PI / 2
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)

const B = BOX_HEAD
/**
 * Chibi head deformation: wider (x) and a touch fuller (z) low on the face, for round cheeks. Applied to
 * every head part of a 'chibi' look (so hair and hats follow) and to its face decal surface (face.ts).
 */
export const CHEEK = { x: 0.07, z: 0.03, y: -0.11, w: 0.13 }
const cheekBump = (y: number) => Math.exp(-(((y - CHEEK.y) / CHEEK.w) ** 2))
/** x scale at height y. */
export const cheekX = (y: number): number => 1 + CHEEK.x * cheekBump(y)
/** z scale at height y. */
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
      P.setXYZ(i, P.getX(i) * fx, y, P.getZ(i) * fz)
      const nx = N.getX(i) / fx
      const ny = N.getY(i)
      const nz = N.getZ(i) / fz
      const len = Math.hypot(nx, ny, nz) || 1
      N.setXYZ(i, nx / len, ny / len, nz / len)
    }
  }
  return parts
}

/** Rig scale of the head bone per head kind (the chibi head is a touch smaller than the animals' heads). */
export const HEAD_SCALE: Record<HeadKind, number> = { round: 1, chibi: 0.93, box: 1 }

export const HEADS: Record<HeadKind, (l: Look) => Part[]> = {
  round: (l) => [part(new SphereGeometry(R, 32, 24), l.skin)],
  /** Human: the round head + a tiny nose bump (cheeks: puffCheeks over all head parts). */
  chibi: (l) => [
    part(new SphereGeometry(R, 34, 24), l.skin),
    part(new SphereGeometry(0.024, 12, 8), l.skin, { p: [0, -0.068, R - 0.008], s: [1.15, 0.8, 0.75] }),
  ],
  /** Robot: a rounded box, a little darker underneath. */
  box: (l) => [
    part(roundBox(B.a, B.b, B.c, B.n, 32, 24), (_x, y) => (y < -B.b * 0.7 ? shade(l.skin, 0.12) : l.skin)),
  ],
}

export const EARS: Record<EarKind, (l: Look) => Part[]> = {
  human: (l) =>
    [-1, 1].map((s) =>
      part(new SphereGeometry(0.064, 14, 10), l.skin, { p: [s * 0.348, -0.04, -0.01], s: [0.55, 1, 0.78] }),
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
 * Sculpted hair shell: a sphere (radius share `rs`) whose lower edge runs at polar angle `front` (deg)
 * over the forehead, `side` over the ears and `back` at the nape, smoothly in between.
 */
function hairShell(color: number, front: number, side: number, back: number, rs = 1.04, grooves = 10): Part {
  // Edge keys (|azimuth| deg → polar deg), smoothstepped between: the back stays low all across the nape.
  const keys: [number, number][] = [
    [0, front],
    [45, front + (side - front) * 0.3],
    [90, side],
    [125, back - 4],
    [180, back],
  ]
  const edge = (az: number) => {
    const a = (Math.abs(az) * 180) / Math.PI
    let k = 1
    while (k < keys.length - 1 && keys[k][0] < a) k++
    const [a0, p0] = keys[k - 1]
    const [a1, p1] = keys[k]
    const t = Math.min(1, Math.max(0, (a - a0) / (a1 - a0)))
    return ((p0 + (p1 - p0) * t * t * (3 - 2 * t)) * Math.PI) / 180
  }
  const W = 36
  const H = 18
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
    P.setXYZ(i, d.x * R * rs, d.y * R * rs, d.z * R * rs)
    N.setXYZ(i, d.x, d.y, d.z)
  }
  return part(g, hairPaint(color, grooves))
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

/**
 * A sculpted lock: a long flattened ellipsoid lying on the head at (polar, az), hanging down the surface
 * (`len` half length, `wid` half width), curled `curl` rad off the meridian, its top lit like the crown.
 */
function strand(
  color: number,
  polar: number,
  az: number,
  len: number,
  wid: number,
  curl = 0,
  rs = 1.02,
): Part {
  const { p, r } = onHead(polar, az, rs, curl)
  const lit = tint(color, 0.22)
  return part(new SphereGeometry(1, 12, 7), (_x, y) => (y > p.y + len * 0.35 ? lit : color), {
    p: [p.x, p.y, p.z],
    r,
    s: [wid, len, wid * 0.45],
  })
}

/** A pointed tuft (flattened cone, tip down) on the head at (polar, az): fringes, sideburns. */
function tuft(color: number, polar: number, az: number, len: number, wid: number, curl = 0, rs = 1.0): Part {
  const { p, r } = onHead(polar, az, rs, curl)
  return part(new ConeGeometry(wid, len, 8), color, {
    p: [p.x, p.y, p.z],
    r: r.multiply(new Quaternion().setFromAxisAngle(Z, Math.PI)),
    s: [1, 1, 0.45],
  })
}

/** A band hugging the head between polar angles a..b (open sphere zone), radius share `rs`, tipped `tilt`. */
function zone(paint: Paint, a: number, b: number, rs: number, tilt: number, seg = 40): Part[] {
  const r = R * rs
  const rim = (polar: number) =>
    part(new TorusGeometry(r * Math.sin(polar), 0.012, 6, seg), paint, {
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
  return place(emblem(PALETTE.emblem, [0, 0, 0], [0, 0, 0], k), {
    p: [p.x, p.y, p.z],
    r: turn(Z, d).premultiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -tilt)),
  })
}

/** A hair spike rooted at (polar, az), leaning back by `back`. */
function spike(color: number, polar: number, az: number, len: number, back = 0.45, r0 = 0.058): Part {
  const d = dir(polar, az)
  const aim = d
    .clone()
    .add(new Vector3(0, 0, -back))
    .normalize()
  const p = d
    .clone()
    .multiplyScalar(R * 0.96)
    .addScaledVector(aim, len * 0.42)
  const lit = tint(color, 0.25)
  return part(new ConeGeometry(r0, len, 9), (x, y, z) => (Math.hypot(x, y, z) > R * 1.25 ? lit : color), {
    p: [p.x, p.y, p.z],
    r: turn(Y, aim),
  })
}

export const STYLES: Record<StyleKind, (l: Look) => Part[]> = {
  /** Berry: blunt sculpted bangs, side locks, low pigtail buns with ties, two clips, a big bow. */
  bowPigtails: (l) => {
    const acc = l.accent
    const hair = l.hair
    const out = [hairShell(hair, 56, 104, 160, 1.045)]
    for (let i = 0; i < 7; i++) {
      const t = i / 6 - 0.5
      out.push(strand(hair, 0.3 * Math.PI + Math.abs(t) * 0.14, t * 1.65, 0.1, 0.075, -t * 0.25, 1.015))
    }
    for (const s of [-1, 1]) {
      // Side locks framing the face, in front of the ears.
      out.push(strand(hair, 0.5 * Math.PI, s * 1.22, 0.11, 0.045, s * 0.1, 0.995))
      // Pigtail buns low behind the ears, a ring tie where they meet the head.
      out.push(
        part(new SphereGeometry(0.1, 14, 10), hairPaint(hair, 6, 0.3), { p: [s * 0.35, -0.1, -0.11] }),
        part(new TorusGeometry(0.05, 0.017, 6, 14), tint(acc, 0.35), {
          p: [s * 0.285, -0.08, -0.09],
          r: [0, s * 1.05, 0],
        }),
      )
    }
    // Two hair clips on the right bangs.
    for (const [polar, az] of [
      [0.33, -0.86],
      [0.4, -0.92],
    ]) {
      const d = dir(polar * Math.PI, az)
      const p = d.clone().multiplyScalar(R * 1.06)
      out.push(
        part(new CapsuleGeometry(0.011, 0.05, 3, 8), acc, {
          p: [p.x, p.y, p.z],
          r: turn(Z, d).multiply(new Quaternion().setFromAxisAngle(Z, 1.2)),
        }),
      )
    }
    const bow: Part[] = [part(new SphereGeometry(0.045, 12, 10), shade(acc, 0.08))]
    for (const s of [-1, 1])
      bow.push(
        part(new SphereGeometry(0.1, 14, 10), acc, {
          p: [s * 0.1, 0.008, 0],
          r: [0, 0, s * 0.3],
          s: [1.1, 0.72, 0.42],
        }),
        part(new SphereGeometry(0.04, 10, 8), acc, {
          p: [s * 0.05, -0.06, 0.004],
          r: [0, 0, s * 0.5],
          s: [0.7, 1.4, 0.35],
        }),
      )
    out.push(...place(bow, { p: [0.12, 0.33, 0.02], r: [0.2, 0.2, -0.3] }))
    return out
  },
  /** Cloud: six-panel cap (button, brim with a dark underside, front logo, back strap) over short hair. */
  capFringe: (l) => {
    const acc = l.accent
    const hair = l.hair
    const navy = shade(acc, 0.55)
    const tilt = 0.12
    const out = [hairShell(hair, 64, 86, 142, 1.035, 14)]
    for (let i = 0; i < 6; i++) {
      const t = i / 5 - 0.5
      out.push(tuft(hair, 0.39 * Math.PI, t * 1.3, 0.075, 0.04, -t * 0.5, 1.01))
    }
    for (const s of [-1, 1]) out.push(tuft(hair, 0.47 * Math.PI, s * 1.22, 0.09, 0.035, 0, 1.0))
    const crown = (x: number, y: number, z: number) => {
      // Back of the cap (behind the strap opening): the dark band.
      const r = Math.hypot(x, y, z) || 1
      const polar = Math.acos(y / r)
      const az = Math.abs(Math.atan2(x, z))
      if (polar > 0.37 * Math.PI && az > 2.1) return navy
      const seam = Math.abs(Math.sin(Math.atan2(x, z) * 3))
      return seam < 0.05 && polar > 0.06 ? shade(acc, 0.18) : acc
    }
    out.push(
      part(new SphereGeometry(R * 1.06, 36, 14, 0, Math.PI * 2, 0, Math.PI * 0.4), crown, {
        r: [-tilt, 0, 0],
      }),
      part(new SphereGeometry(0.032, 10, 6), acc, { p: [0, R * 1.055, -0.045], s: [1, 0.6, 1] }),
      // Brim: top in the cap colour, a dark underside just below.
      part(new CylinderGeometry(0.2, 0.2, 0.02, 32), acc, {
        p: [0, 0.185, 0.31],
        r: [0.25, 0, 0],
        s: [1, 1, 1.3],
      }),
      part(new CylinderGeometry(0.195, 0.195, 0.008, 32), navy, {
        p: [0, 0.173, 0.305],
        r: [0.25, 0, 0],
        s: [1, 1, 1.28],
      }),
      // Back strap with a light buckle.
      part(new BoxGeometry(0.11, 0.035, 0.03), navy, { p: [0, 0.075, -0.385], r: [-0.25, 0, 0] }),
      part(new BoxGeometry(0.05, 0.03, 0.02), tint(acc, 0.55), { p: [0, 0.076, -0.398], r: [-0.25, 0, 0] }),
      ...headLogo(0.26 * Math.PI, 0, 1.07, 2.3, -0.1),
    )
    return out
  },
  /** Sunny: big chunky spikes through a wide headband with a logo. */
  bandSpiky: (l) => {
    const hair = l.hair
    const out = [hairShell(hair, 62, 88, 142, 1.04, 12)]
    // Chunky clumps: (polar share, azimuth, length, base radius); front ones lean back over the band.
    const spikes: [number, number, number, number][] = [
      [0.04, 0.3, 0.27, 0.11],
      [0.06, -2.6, 0.25, 0.11],
      [0.13, 1.2, 0.25, 0.105],
      [0.13, -1.0, 0.25, 0.105],
      [0.15, 2.2, 0.23, 0.1],
      [0.16, 3.0, 0.22, 0.1],
      [0.17, -1.9, 0.23, 0.1],
      [0.22, 0.0, 0.22, 0.1],
      [0.24, 0.6, 0.2, 0.095],
      [0.24, -0.6, 0.2, 0.095],
      [0.27, 1.6, 0.19, 0.09],
      [0.27, -1.5, 0.19, 0.09],
      [0.28, 2.5, 0.18, 0.09],
      [0.28, -2.4, 0.18, 0.09],
    ]
    for (const [p, az, len, r0] of spikes) out.push(spike(hair, p * Math.PI, az, len * 1.1, 0.12, r0 * 1.2))
    // Sideburns.
    for (const s of [-1, 1]) out.push(tuft(hair, 0.47 * Math.PI, s * 1.22, 0.09, 0.035, 0, 1.0))
    const band = l.accent
    out.push(
      ...zone((_x, y) => (y > 0 ? band : shade(band, 0.05)), 0.27 * Math.PI, 0.41 * Math.PI, 1.06, 0.12),
      ...headLogo(0.335 * Math.PI, 0, 1.075, 2.1, -0.12),
    )
    return out
  },
  /** Mint: ribbed beanie (dome, thick fold with a logo, pompom) over short swept hair. */
  beanie: (l) => {
    const acc = l.accent
    const hair = l.hair
    const tilt = 0.15
    const rib = (k: number) => (x: number, _y: number, z: number) =>
      Math.cos(Math.atan2(x, z) * 30) > 0.2 ? shade(acc, k + 0.1) : shade(acc, k)
    const out = [hairShell(hair, 66, 86, 142, 1.035, 14)]
    for (let i = 0; i < 5; i++) {
      const t = i / 4 - 0.5
      out.push(tuft(hair, 0.4 * Math.PI, t * 1.25 - 0.08, 0.1, 0.06, -0.55, 1.01))
    }
    for (const s of [-1, 1]) out.push(tuft(hair, 0.47 * Math.PI, s * 1.22, 0.09, 0.035, 0, 1.0))
    // Fold: a thick rounded ring (closed lathe) round the head; dome on top; pompom.
    const FOLD: [number, number][] = [
      [0.372, 0.045],
      [0.392, 0.05],
      [0.405, 0.068],
      [0.408, 0.11],
      [0.403, 0.152],
      [0.39, 0.168],
      [0.37, 0.17],
      [0.372, 0.045],
    ]
    const hat: Part[] = [
      part(
        new LatheGeometry(
          FOLD.map(([r, y]) => new Vector2(r, y)),
          48,
        ),
        rib(0.05),
      ),
      part(new SphereGeometry(0.382, 40, 14, 0, Math.PI * 2, 0, HALF_PI), rib(0), {
        p: [0, 0.07, 0],
        s: [1, 0.98, 1],
      }),
      part(
        new SphereGeometry(0.085, 16, 12),
        (x, y, z) => (Math.sin(x * 160) * Math.sin(y * 170) * Math.sin(z * 150) > 0.2 ? 0xeeeeee : 0xffffff),
        {
          p: [0, 0.07 + 0.374 + 0.055, 0],
        },
      ),
      // Logo on the fold's front.
      ...emblem(PALETTE.emblem, [0, 0.11, 0.409], [0, 0, 0], 2.2),
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
