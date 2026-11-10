// Head builders (head bone space: origin at the head centre, face on +z): the head shape, ears, muzzle and
// the hair + headwear style, each picked by the look's key. All merged into one mesh by model.ts; the
// face features (eyes, brows, mouth, blush) are a separate morphing mesh (face.ts).

import { ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, Vector3 } from 'three'
import { HEAD_R } from './dims'
import type { EarKind, HeadKind, Look, MuzzleKind, StyleKind } from './look'
import { dir, part, place, shade, turn, type Part } from './merge'

const R = HEAD_R
const HALF_PI = Math.PI / 2
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)

export const HEADS: Record<HeadKind, (l: Look) => Part[]> = {
  round: (l) => [part(new SphereGeometry(R, 32, 24), l.skin)],
}

export const EARS: Record<EarKind, (l: Look) => Part[]> = {
  human: (l) =>
    [-1, 1].map((s) =>
      part(new SphereGeometry(0.055, 10, 8), l.skin, { p: [s * 0.352, -0.03, -0.01], s: [0.6, 1, 0.8] }),
    ),
  none: () => [],
}

export const MUZZLES: Record<MuzzleKind, (l: Look) => Part[]> = {
  none: () => [],
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
}

/** Head shape + ears + muzzle + hair/headwear, in head space. */
export function headParts(l: Look): Part[] {
  return [...HEADS[l.head](l), ...EARS[l.ears](l), ...MUZZLES[l.muzzle](l), ...STYLES[l.style](l)]
}
