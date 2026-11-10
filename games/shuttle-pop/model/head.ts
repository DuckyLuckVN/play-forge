// Head builders (head bone space: origin at the head centre, face on +z): the head shape, ears, muzzle and
// the hair + headwear style, each picked by the look's key. All merged into one mesh by model.ts; the
// face features (eyes, brows, mouth, blush) are a separate morphing mesh (face.ts).

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
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
import { dir, part, place, shade, tint, turn, type Part } from './merge'
import { roundBox } from './shapes'

const R = HEAD_R
const HALF_PI = Math.PI / 2
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)

const B = BOX_HEAD
export const HEADS: Record<HeadKind, (l: Look) => Part[]> = {
  round: (l) => [part(new SphereGeometry(R, 32, 24), l.skin)],
  /** Robot: a rounded box, a little darker underneath. */
  box: (l) => [
    part(roundBox(B.a, B.b, B.c, B.n, 32, 24), (_x, y) => (y < -B.b * 0.7 ? shade(l.skin, 0.12) : l.skin)),
  ],
}

export const EARS: Record<EarKind, (l: Look) => Part[]> = {
  human: (l) =>
    [-1, 1].map((s) =>
      part(new SphereGeometry(0.055, 10, 8), l.skin, { p: [s * 0.352, -0.03, -0.01], s: [0.6, 1, 0.8] }),
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

/** Hair shell: a sphere cap of `theta` rad from the crown, tipped back `tilt` rad (forehead shows). */
function hairCap(color: number, theta: number, tilt: number, rs = 1.035): Part {
  return part(new SphereGeometry(R * rs, 32, 16, 0, Math.PI * 2, 0, theta), color, { r: [-tilt, 0, 0] })
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

/** A hair spike rooted at (polar, az), leaning back by `back`. */
function spike(color: number, polar: number, az: number, len: number, back = 0.45): Part {
  const d = dir(polar, az)
  const aim = d
    .clone()
    .add(new Vector3(0, 0, -back))
    .normalize()
  const p = d
    .clone()
    .multiplyScalar(R * 0.96)
    .addScaledVector(aim, len * 0.42)
  return part(new ConeGeometry(0.058, len, 10), color, { p: [p.x, p.y, p.z], r: turn(Y, aim) })
}

export const STYLES: Record<StyleKind, (l: Look) => Part[]> = {
  /** Berry: rounded bangs, two pigtails with ties, a big bow on top. */
  bowPigtails: (l) => {
    const acc = l.accent
    const out = [hairCap(l.hair, Math.PI * 0.43, 0.45)]
    for (let i = 0; i < 5; i++) out.push(lock(l.hair, 0.31 * Math.PI, -0.56 + i * 0.28, 0.085))
    for (const s of [-1, 1]) {
      out.push(
        part(new SphereGeometry(0.072, 14, 10), l.hair, {
          p: [s * 0.36, -0.01, -0.2],
          r: [0.35, 0, s * 0.55],
          s: [1, 1.9, 1],
        }),
        part(new SphereGeometry(0.034, 10, 8), acc, { p: [s * 0.3, 0.08, -0.19] }),
      )
    }
    const bow: Part[] = [part(new SphereGeometry(0.038, 10, 8), acc)]
    for (const s of [-1, 1])
      bow.push(
        part(new SphereGeometry(0.085, 14, 10), acc, {
          p: [s * 0.085, 0, 0],
          r: [0, 0, s * 0.35],
          s: [1.15, 0.75, 0.42],
        }),
      )
    out.push(...place(bow, { p: [0.17, 0.305, 0.03], r: [0.15, 0.25, -0.45] }))
    return out
  },
  /** Cloud: sporty cap (brim, front badge, top button), fringe tufts under the brim, short back hair. */
  capFringe: (l) => {
    const acc = l.accent
    const out = [hairCap(l.hair, Math.PI * 0.5, 0.3)]
    for (const az of [-0.42, 0, 0.42]) out.push(lock(l.hair, 0.37 * Math.PI, az, 0.06))
    out.push(
      part(new SphereGeometry(R * 1.07, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), acc, {
        r: [-0.18, 0, 0],
      }),
      part(new CylinderGeometry(0.19, 0.19, 0.022, 28), shade(acc, 0.12), {
        p: [0, 0.205, 0.33],
        r: [0.32, 0, 0],
        s: [1, 1, 1.25],
      }),
      part(new SphereGeometry(0.03, 10, 6), acc, { p: [0, R * 1.07, -0.07] }),
    )
    const d = dir(0.3 * Math.PI, 0)
    const b = d.clone().multiplyScalar(R * 1.07)
    out.push(
      part(new SphereGeometry(0.055, 14, 8), 0xffffff, {
        p: [b.x, b.y, b.z],
        r: turn(Z, d),
        s: [1, 1, 0.25],
      }),
    )
    return out
  },
  /** Sunny: spiky hair through a sweatband. */
  bandSpiky: (l) => {
    const out = [hairCap(l.hair, Math.PI * 0.42, 0.5)]
    const spikes: [number, number, number][] = [
      [0.05, 0, 0.2],
      [0.18, 0.9, 0.18],
      [0.18, -0.9, 0.18],
      [0.2, 2.3, 0.17],
      [0.2, -2.3, 0.17],
      [0.24, Math.PI, 0.17],
      [0.3, 0.35, 0.15],
      [0.3, -0.35, 0.15],
      [0.31, 1.6, 0.15],
      [0.31, -1.6, 0.15],
    ]
    for (const [p, az, len] of spikes) out.push(spike(l.hair, p * Math.PI, az, len))
    const bandY = 0.14
    out.push(
      part(new TorusGeometry(Math.sqrt(R * R - bandY * bandY) + 0.012, 0.036, 8, 32), l.accent, {
        p: [0, bandY, 0],
        r: [HALF_PI + 0.1, 0, 0],
      }),
      part(new SphereGeometry(0.04, 12, 8), 0xffffff, { p: [0, bandY + 0.005, 0.36], s: [1, 0.7, 0.3] }),
    )
    return out
  },
  /** Mint: knit beanie (ribbed rim, pompom) over a chin-length bob. */
  beanieBob: (l) => {
    const acc = l.accent
    const BR = R * 1.09
    const theta = Math.PI * 0.42
    const tilt = 0.12
    const rim = part(new TorusGeometry(BR * Math.sin(theta), 0.05, 8, 32), shade(acc, 0.15), {
      p: [0, BR * Math.cos(theta), 0],
      r: [HALF_PI, 0, 0],
    })
    place([rim], { r: [-tilt, 0, 0] })
    const out = [hairCap(l.hair, Math.PI * 0.52, 0.75, 1.045)]
    // Side locks down to the jaw, curling in at the ends.
    for (const s of [-1, 1])
      out.push(
        part(new SphereGeometry(0.1, 14, 10), l.hair, {
          p: [s * 0.325, -0.06, -0.02],
          r: [0.15, 0, s * -0.12],
          s: [0.55, 1.45, 1.05],
        }),
      )
    return [
      ...out,
      part(new SphereGeometry(BR, 32, 12, 0, Math.PI * 2, 0, theta), acc, { r: [-tilt, 0, 0] }),
      rim,
      part(new SphereGeometry(0.08, 12, 10), 0xffffff, { p: [0, BR + 0.04, -0.04] }),
    ]
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
  return [...HEADS[l.head](l), ...EARS[l.ears](l), ...MUZZLES[l.muzzle](l), ...STYLES[l.style](l)]
}
