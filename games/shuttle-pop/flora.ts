// Park plants and stones as data: five tree kinds, bushes, flower clusters, grass patches and rocks.
// Each builder pushes `Prop`s (kit.ts) for one plant at (x, z), varied by the seeded `r`, so a layout
// (props.ts) composes them and the whole park still draws as one InstancedMesh per shape.
//
// Look: faceted low-poly (flat-shaded icosahedron canopies, stacked pine cones), soft pastel palette,
// a little per-cluster colour jitter so no two trees match.

import { Color } from 'three'
import { prop, type Detail, type Prop } from './kit'

export const FLORA = {
  trunk: ['#946a48', '#8a5f40', '#a07454'],
  green: ['#78b84a', '#8cc653', '#69ad45', '#9ccc5a'],
  blossom: ['#eba3b4', '#f0b2c0', '#e293a8'],
  autumn: ['#e8a849', '#eb9a45', '#e9b955', '#df8a46'],
  pine: ['#4f9446', '#5a9c4a', '#468a45'],
  /** Bushes: a touch deeper than the trees, so they sit under them. */
  bush: ['#64a842', '#5e9f40', '#72b24b'],
  /** Flower kinds: daisy, pink, yellow, lilac, coral (heads; daisies keep a golden heart). */
  flowers: {
    daisy: '#fbf6ee',
    pink: '#f2a3b8',
    yellow: '#f5cf5e',
    lilac: '#c4a5e0',
    coral: '#f19c80',
  },
  /** Close to the lawn (#7db552): tufts add texture, not dark spikes. */
  grass: ['#78b44c', '#86c257', '#6faa47', '#91c45c'],
  rock: ['#b7ad9f', '#c4bbad', '#a99f94'],
  stone: ['#d8c6aa', '#cdb99c', '#e2d3bb'],
} as const

export type FlowerKind = keyof typeof FLORA.flowers
export type TreeKind = 'round' | 'blossom' | 'autumn' | 'pine' | 'small'
export type BushKind = 'round' | 'cluster' | 'flowering'

type Rand = () => number

const pick = <T>(list: readonly T[], r: Rand): T => list[Math.floor(r() * list.length)]

const tmp = new Color()
/** `hex` nudged in lightness by up to ±`amt` (and a hint of hue), seeded: no two canopies quite alike. */
export function vary(hex: string, r: Rand, amt = 0.04): string {
  return (
    '#' +
    tmp
      .set(hex)
      .offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * 2 * amt)
      .getHexString()
  )
}

/** Shared tree options: detail level and whether it casts a shadow (far trees don't). */
export interface PlantOpts {
  detail?: Detail
  shadow?: boolean
}

function tag(out: Prop[], from: number, o: PlantOpts) {
  for (let i = from; i < out.length; i++) {
    if (o.detail) out[i].detail = o.detail
    if (o.shadow === false) out[i].shadow = false
  }
}

/**
 * A tree of `kind` at (x, z), overall size `s` (1 ≈ 4.5 m tall). Round / blossom / autumn: a trunk and
 * two to four faceted canopy blobs; pine: three stacked cones; small: a short trunk under one or two blobs.
 */
export function tree(
  out: Prop[],
  r: Rand,
  kind: TreeKind,
  x: number,
  z: number,
  s: number,
  o: PlantOpts = {},
) {
  const from = out.length
  const trunk = vary(pick(FLORA.trunk, r), r, 0.03)
  if (kind === 'pine') {
    const h = (0.95 + r() * 0.3) * s
    out.push(prop('post', trunk, x, 0.45 * s, z, 0.3 * s, 0.9 * s, 0.3 * s))
    const base = pick(FLORA.pine, r)
    for (let k = 0; k < 3; k++) {
      const w = (1.95 - k * 0.5) * s
      const ch = 1.5 * h
      out.push(
        prop('cone', vary(base, r, 0.035), x, 0.9 * s + (0.55 + k * 0.95) * h, z, w, ch, w, r() * Math.PI),
      )
    }
    tag(out, from, o)
    return
  }
  const small = kind === 'small'
  const palette = kind === 'blossom' ? FLORA.blossom : kind === 'autumn' ? FLORA.autumn : FLORA.green
  const tall = (small ? 0.9 : 1.4 + r() * 0.5) * s
  out.push(prop('post', trunk, x, tall / 2, z, 0.38 * s, tall, 0.38 * s))
  const base = pick(palette, r)
  // Main crown, then side clusters around and a little below it (a lumpy, asymmetric silhouette).
  const crown = (small ? 1.6 : kind === 'blossom' ? 2.8 : 2.5) * s
  const cy = tall + crown * 0.38
  out.push(prop('leaf', vary(base, r), x, cy, z, crown, crown * 0.88, crown, r() * Math.PI))
  const extra = small ? Math.floor(r() * 2) : 2 + Math.floor(r() * 2)
  const turn = r() * Math.PI * 2
  for (let k = 0; k < extra; k++) {
    const a = turn + (k / extra) * Math.PI * 2 + (r() - 0.5) * 0.8
    const d = crown * (0.32 + r() * 0.12)
    const c = crown * (0.55 + r() * 0.2)
    out.push(
      prop(
        'leaf',
        vary(base, r, 0.06),
        x + Math.cos(a) * d,
        cy - crown * (0.05 + r() * 0.2) + (k === 0 ? crown * 0.25 : 0),
        z + Math.sin(a) * d,
        c,
        c * 0.85,
        c,
        r() * Math.PI,
      ),
    )
  }
  tag(out, from, o)
}

/**
 * A bush at (x, z), size `s` (1 ≈ 1.2 m across): round = one squashed blob; cluster = three blobs;
 * flowering = a cluster dotted with flower heads on top.
 */
export function bush(
  out: Prop[],
  r: Rand,
  kind: BushKind,
  x: number,
  z: number,
  s: number,
  o: PlantOpts = {},
) {
  const from = out.length
  const base = pick(FLORA.bush, r)
  const blob = (dx: number, dz: number, w: number) =>
    out.push(prop('leaf', vary(base, r), x + dx, w * 0.32, z + dz, w, w * 0.72, w * 0.9, r() * Math.PI))
  blob(0, 0, 1.2 * s)
  if (kind !== 'round') {
    const a = r() * Math.PI * 2
    blob(Math.cos(a) * 0.5 * s, Math.sin(a) * 0.4 * s, 0.85 * s)
    blob(Math.cos(a + 2.4) * 0.5 * s, Math.sin(a + 2.4) * 0.4 * s, 0.75 * s)
  }
  if (kind === 'flowering') {
    const c = pick(['daisy', 'pink', 'lilac'] as const, r)
    for (let k = 0; k < 6; k++) {
      const a = r() * Math.PI * 2
      const d = r() * 0.45 * s
      out.push(
        prop(
          'bloom',
          FLORA.flowers[c],
          x + Math.cos(a) * d,
          0.62 * s + r() * 0.12 * s,
          z + Math.sin(a) * d * 0.8,
          0.16,
          0.05,
          0.16,
          r() * 6,
        ),
      )
    }
  }
  tag(out, from, o)
}

/**
 * A cluster of `n` flowers of `kinds` around (x, z) within `spread` m: heads on short stems, bunched toward
 * the middle, over a low leafy mound when `mound`.
 */
export function flowers(
  out: Prop[],
  r: Rand,
  x: number,
  z: number,
  n: number,
  kinds: readonly FlowerKind[],
  spread = 0.5,
  o: PlantOpts & { mound?: boolean } = {},
) {
  const from = out.length
  if (o.mound)
    out.push(prop('leaf', vary(FLORA.bush[0], r), x, 0.07, z, spread * 1.6, 0.26, spread * 1.3, r() * 3))
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * spread
    const fx = x + Math.cos(a) * d
    const fz = z + Math.sin(a) * d
    const h = 0.15 + r() * 0.16
    const size = 0.28 + r() * 0.1
    out.push(prop('post', FLORA.grass[0], fx, h / 2, fz, 0.018, h, 0.018))
    out.push(prop('bloom', FLORA.flowers[pick(kinds, r)], fx, h, fz, size, size * 0.15, size, r() * 6))
  }
  tag(out, from, o)
}

/** `n` grass tufts bunched around (x, z) within `spread` m (denser in the middle). */
export function grass(
  out: Prop[],
  r: Rand,
  x: number,
  z: number,
  n: number,
  spread = 0.6,
  o: PlantOpts = {},
) {
  const from = out.length
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2
    const d = Math.sqrt(r()) * spread
    const h = 0.14 + r() * 0.12
    const w = 0.28 + r() * 0.14
    out.push(
      prop('tuft', pick(FLORA.grass, r), x + Math.cos(a) * d, h / 2, z + Math.sin(a) * d, w, h, w, r() * 6),
    )
  }
  tag(out, from, o)
}

/** A rock (half sunk), size `s` m, or a little group of 2–3 when `group`. */
export function rocks(
  out: Prop[],
  r: Rand,
  x: number,
  z: number,
  s: number,
  group = false,
  o: PlantOpts = {},
) {
  const from = out.length
  const n = group ? 2 + Math.floor(r() * 2) : 1
  for (let k = 0; k < n; k++) {
    const w = s * (k === 0 ? 1 : 0.45 + r() * 0.3)
    const a = r() * Math.PI * 2
    const d = k === 0 ? 0 : s * 0.6
    const h = w * (0.55 + r() * 0.25)
    const p = prop(
      'rock',
      vary(pick(FLORA.rock, r), r, 0.03),
      x + Math.cos(a) * d,
      h * 0.32,
      z + Math.sin(a) * d,
      w,
      h,
      w * (0.8 + r() * 0.3),
      r() * 6,
    )
    p.roll = (r() - 0.5) * 0.4
    out.push(p)
  }
  tag(out, from, o)
}

/** A flat paving slab at (x, z), roughly `s` m across, its tone and turn varied. */
export function slab(out: Prop[], r: Rand, x: number, z: number, s: number, o: PlantOpts = {}) {
  const from = out.length
  out.push(
    prop(
      'slab',
      vary(pick(FLORA.stone, r), r, 0.025),
      x,
      0.02,
      z,
      s * (0.9 + r() * 0.25),
      0.05,
      s * (0.75 + r() * 0.2),
      r() * Math.PI,
    ),
  )
  tag(out, from, o)
}
