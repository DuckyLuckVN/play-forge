// Animated extra bones: tails, floppy / twitchy ears, wing nubs, an antenna. Each is a pivot on a body
// bone (hips, torso or head) with its own merged mesh (one draw call; a pair is the same geometry
// mirrored), animated by a pose channel (flair.ts). Static bits (round panda ears, horns) stay merged
// into their bone instead (head.ts / body.ts): an extra costs a draw call, so only things that move are
// extras. Budget: ≤ 3 extra meshes per look.

import { CapsuleGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, Vector3 } from 'three'
import type { Channel } from '../flair'
import { BOX_HEAD, HEAD_R } from './dims'
import { bellyOf, type ExtraKind, type Look } from './look'
import { PALETTE } from './palette'
import { dir, part, shade, tint, turn, type Part, type Triple } from './merge'

export interface ExtraSpec {
  /** The bone it hangs on. */
  parent: 'hips' | 'torso' | 'head'
  /** Pivot in the parent bone's space (the +x one of a pair). */
  at: Triple
  /** Also a mirrored twin at −x (ears, wings). */
  pair?: boolean
  channel: Channel
  /** Parts in pivot space. */
  parts: (l: Look) => Part[]
  /** Unlit parts on the same pivot (a light), shown while the channel's `glow` is on. */
  glow?: (l: Look) => Part[]
}

const Y = new Vector3(0, 1, 0)
const EAR_PINK = PALETTE.earPink

/** Head point at (polar, az) just inside the surface, and the ear's lean (normal tipped up by `up`). */
function earBase(polar: number, az: number, up: number): { at: Triple; aim: Vector3 } {
  const d = dir(polar, az)
  const p = d.clone().multiplyScalar(HEAD_R * 0.93)
  return {
    at: [p.x, p.y, p.z],
    aim: d
      .clone()
      .add(new Vector3(0, up, 0))
      .normalize(),
  }
}

/** A pointy ear (cone flattened front-back) with an inner patch, rising along `aim` from the pivot. */
function pointyEar(
  aim: Vector3,
  r: number,
  h: number,
  outer: number | ((x: number, y: number, z: number) => number),
  inner: number,
): Part[] {
  const q = turn(Y, aim)
  const cone = new ConeGeometry(r, h, 14).translate(0, h / 2, 0)
  const tip = aim.clone().multiplyScalar(h * 0.42)
  // Inner patch: a smaller cone just in front (toward +z of the head).
  const front = new Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(r * 0.32)
  return [
    part(cone, outer, { r: q, s: [1, 1, 0.5] }),
    part(new ConeGeometry(r * 0.6, h * 0.72, 12), inner, {
      p: [tip.x + front.x, tip.y + front.y, tip.z + front.z],
      r: q,
      s: [1, 1, 0.3],
    }),
  ]
}

const CAT_EAR = earBase(0.24 * Math.PI, 0.95, 0.5)
const FOX_EAR = earBase(0.22 * Math.PI, 0.85, 0.6)
const BUNNY_EAR = earBase(0.1 * Math.PI, 0.55, 1.8)

/** Spheres along a curve (a tail): `pts` (x, y, z, r) merged, painted by index. */
function beads(
  pts: readonly (readonly [number, number, number, number])[],
  paint: (i: number) => number,
): Part[] {
  return pts.map(([x, y, z, r], i) => part(new SphereGeometry(r, 12, 8), paint(i), { p: [x, y, z] }))
}

export const EXTRAS: Record<ExtraKind, ExtraSpec> = {
  /** Cat: pointy ears with pink insides; they twitch. */
  catEars: {
    parent: 'head',
    at: CAT_EAR.at,
    pair: true,
    channel: 'twitch',
    parts: (l) => pointyEar(CAT_EAR.aim, 0.1, 0.17, l.skin, EAR_PINK),
  },
  /** Fox: big ears with dark tips and white insides; they twitch. */
  foxEars: {
    parent: 'head',
    at: FOX_EAR.at,
    pair: true,
    channel: 'twitch',
    parts: (l) => {
      const dark = shade(l.limb ?? l.skin, 0.1)
      const tipFrom = 0.16
      return pointyEar(
        FOX_EAR.aim,
        0.12,
        0.25,
        (x, y, z) => (Math.hypot(x, y, z) > tipFrom ? dark : l.skin),
        bellyOf(l),
      )
    },
  },
  /** Bunny: long ears standing up, pink inside; they flop. */
  bunnyEars: {
    parent: 'head',
    at: BUNNY_EAR.at,
    pair: true,
    channel: 'flop',
    parts: (l) => {
      const q = turn(Y, BUNNY_EAR.aim)
      const len = 0.27
      const c = BUNNY_EAR.aim.clone().multiplyScalar(len / 2 + 0.04)
      const f = new Vector3(0, 0, 1).applyQuaternion(q).multiplyScalar(0.022)
      return [
        part(new CapsuleGeometry(0.058, len, 6, 14), l.skin, { p: [c.x, c.y, c.z], r: q, s: [1, 1, 0.5] }),
        part(new CapsuleGeometry(0.034, len * 0.85, 6, 12), EAR_PINK, {
          p: [c.x + f.x, c.y + f.y, c.z + f.z],
          r: q,
          s: [1, 1, 0.35],
        }),
      ]
    },
  },
  /** Cat: a long tail curling up behind, tabby rings; it wags. */
  catTail: {
    parent: 'hips',
    at: [0, 0.02, -0.13],
    channel: 'wag',
    parts: (l) => {
      const pts: [number, number, number, number][] = []
      for (let i = 0; i < 9; i++) {
        const u = i / 8
        // Out the back, then up with a curl at the tip.
        pts.push([
          0,
          0.02 + 0.3 * u * u + 0.04 * Math.sin(u * 5),
          -0.04 - 0.2 * Math.sin(u * 1.9),
          0.046 - 0.01 * u,
        ])
      }
      return beads(pts, (i) => (i % 3 === 2 ? l.hair : l.skin))
    },
  },
  /** Fox: a big fluffy tail with a white tip; it wags. */
  foxTail: {
    parent: 'hips',
    at: [0, 0.0, -0.13],
    channel: 'wag',
    parts: (l) => {
      const tail = new SphereGeometry(1, 18, 12)
      return [
        part(tail, l.skin, { p: [0, 0.1, -0.15], r: [-0.9, 0, 0], s: [0.085, 0.17, 0.085] }),
        part(tail, bellyOf(l), { p: [0, 0.22, -0.24], r: [-0.9, 0, 0], s: [0.065, 0.08, 0.065] }),
      ]
    },
  },
  /** Bunny: a cotton puff; it wiggles. */
  bunnyTail: {
    parent: 'hips',
    at: [0, 0.01, -0.14],
    channel: 'wag',
    parts: (l) => [part(new SphereGeometry(0.065, 14, 10), bellyOf(l), { p: [0, 0.01, -0.03] })],
  },
  /** Dragon: a tail sweeping back and up, a row of spikes, an arrow tip; it wags. */
  dragonTail: {
    parent: 'hips',
    at: [0, 0.0, -0.13],
    channel: 'wag',
    parts: (l) => {
      const pts: [number, number, number, number][] = []
      for (let i = 0; i < 7; i++) {
        const u = i / 6
        pts.push([0, 0.02 + 0.12 * u * u, -0.03 - 0.24 * u, 0.07 - 0.04 * u])
      }
      const out = beads(pts, () => l.skin)
      for (let i = 1; i < 6; i++) {
        const [, y, z, r] = pts[i]
        out.push(
          part(new ConeGeometry(0.022, 0.05, 4), l.accent, {
            p: [0, y + r * 0.9, z],
            r: [-0.4, 0, 0],
            s: [0.45, 1, 1],
          }),
        )
      }
      const [, ty, tz] = pts[6]
      out.push(
        part(new ConeGeometry(0.05, 0.08, 4), l.accent, {
          p: [0, ty + 0.02, tz - 0.05],
          r: [-1.9, 0, 0],
          s: [1, 1, 0.35],
        }),
      )
      return out
    },
  },
  /** Dragon: little wing nubs on the back; they flutter. */
  wings: {
    parent: 'torso',
    at: [0.07, 0.25, -0.14],
    pair: true,
    channel: 'flap',
    parts: (l) => {
      const bone = shade(l.skin, 0.2)
      const membrane = tint(l.accent, 0.35)
      const lobe = new SphereGeometry(0.1, 16, 10)
      return [
        part(new CapsuleGeometry(0.02, 0.16, 4, 8), bone, { p: [0.08, 0.06, -0.03], r: [0, 0.35, -1.0] }),
        part(lobe, membrane, { p: [0.1, 0.0, -0.05], r: [0, 0.35, -0.45], s: [1.1, 0.8, 0.2] }),
        part(lobe, membrane, { p: [0.07, -0.05, -0.04], r: [0, 0.35, -0.2], s: [0.7, 0.6, 0.18] }),
        part(new ConeGeometry(0.016, 0.045, 8), l.hair, { p: [0.155, 0.125, -0.06], r: [0, 0.35, -1.0] }),
      ]
    },
  },
  /** Robot: an antenna on top that sways; its bulb blinks (unlit glow mesh). */
  antenna: {
    parent: 'head',
    at: [0, BOX_HEAD.b - 0.01, 0],
    channel: 'sway',
    parts: (l) => [
      part(new CylinderGeometry(0.04, 0.05, 0.03, 16), shade(l.skin, 0.25), { p: [0, 0.01, 0] }),
      part(new CylinderGeometry(0.009, 0.009, 0.14, 8), shade(l.skin, 0.35), { p: [0, 0.09, 0] }),
    ],
    glow: (l) => [part(new SphereGeometry(0.035, 14, 10), l.accent, { p: [0, 0.18, 0] })],
  },
}

/** Meshes an extra adds (a pair is two; a glow one more each). */
export function extraMeshes(s: ExtraSpec): number {
  return (s.pair ? 2 : 1) * (s.glow ? 2 : 1)
}
