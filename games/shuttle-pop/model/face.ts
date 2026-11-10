// Chibi face: big shiny eyes (dark iris, tinted lower half, two highlights), brows, mouth and blush as
// thin decals hugging the head surface (a sphere, a box, a muzzle bump: `surfaceOf`), all in ONE mesh. Expressions are morph targets with the same
// topology (only positions move), so moods blend smoothly: happy (^ ^ eyes, open smile), sad (droopy
// eyes, raised inner brows, frown), effort (squint, angry brows, yell), blink.
//
// `faceLayout` is pure (plain arrays, testable); `faceGeometry` wraps it for three.js.

import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { HEAD_R } from './dims'
import type { FaceKind, HeadKind, Look } from './look'
import { shade } from './merge'

export type Expr = 'neutral' | 'happy' | 'sad' | 'effort' | 'blink'
/** Morph target order (index = morphTargetInfluences slot). */
export const MORPHS: readonly Expr[] = ['happy', 'sad', 'effort', 'blink']

export interface FaceLayout {
  pos: number[]
  col: number[]
  idx: number[]
}

const COL = { eye: 0x2b2233, shine: 0xffffff, mouth: 0x8c2f3f, blush: 0xff9eb5 }
/** Eye: half width / height, centre (± x, y). */
const EYE = { a: 0.066, b: 0.086, x: 0.138, y: -0.012 }
const BROW = { w: 0.05, x: 0.138, y: 0.108, th: 0.019 }
const MOUTH_Y = -0.125
/** Mouth size share (shapes below are drawn at 1). */
const MOUTH_K = 1.3
const BLUSH = { a: 0.046, b: 0.024, x: 0.215, y: -0.085 }
const RING = 20
const COLS = 11

/** Eye shape per expression: (dx, dy) from the eye centre → new offset; highlight size share. */
function eyeShape(e: Expr, side: number): { f: (dx: number, dy: number) => [number, number]; shine: number } {
  const arch = (dx: number) => 1 - Math.min(1, (dx / EYE.a) ** 2)
  switch (e) {
    case 'happy':
      return { f: (dx, dy) => [dx * 1.05, dy * 0.18 + 0.03 * arch(dx) - 0.012], shine: 0 }
    case 'blink':
      return { f: (dx, dy) => [dx, dy * 0.1 - 0.014 * arch(dx) - 0.012], shine: 0 }
    case 'sad':
      return { f: (dx, dy) => [dx * 0.95, dy * 0.88 - 0.22 * dx * side - 0.006], shine: 1.15 }
    case 'effort':
      return { f: (dx, dy) => [dx, dy * 0.5 + 0.2 * dx * side - 0.004], shine: 0.5 }
    default:
      return { f: (dx, dy) => [dx, dy], shine: 1 }
  }
}

/** Brow height offset at t (−1 = inner end, +1 = outer end). */
function browY(e: Expr, t: number): number {
  switch (e) {
    case 'happy':
      return 0.022 + 0.012 * (1 - t * t)
    case 'sad':
      return 0.006 * (1 - t * t) + 0.024 * ((1 - t) / 2) - 0.004
    case 'effort':
      return 0.013 * t - 0.008
    default:
      return 0.006 * (1 - t * t)
  }
}

/** Mouth half width, top and bottom edge at t ∈ [−1, 1] (top ≥ bottom always). */
function mouth(e: Expr): { w: number; top: (t: number) => number; bot: (t: number) => number } {
  const line = (top: (t: number) => number) => (t: number) => top(t) - 0.0085 * (1 - 0.55 * t * t)
  switch (e) {
    case 'happy': {
      const top = (t: number) => 0.008 + 0.006 * t * t
      return { w: 0.05, top, bot: (t) => top(t) - 0.05 * (1 - t * t) }
    }
    case 'sad': {
      const top = (t: number) => 0.002 - 0.012 * t * t
      return { w: 0.03, top, bot: line(top) }
    }
    case 'effort': {
      const r = (t: number) => Math.sqrt(Math.max(0, 1 - t * t))
      return { w: 0.028, top: (t) => 0.012 * r(t), bot: (t) => -0.024 * r(t) }
    }
    default: {
      const top = (t: number) => -0.004 + 0.012 * t * t
      return { w: 0.034, top, bot: line(top) }
    }
  }
}

const c = new Color()

/** Height (+z) of the head surface at (u, v) for a decal `lift` m outside it. */
export type Surface = (u: number, v: number, lift: number) => number

const sphere =
  (r: number): Surface =>
  (u, v, lift) =>
    Math.sqrt(Math.max(0, (r + lift) ** 2 - u * u - v * v))

const HEAD_SURFACES: Record<HeadKind, Surface> = {
  round: sphere(HEAD_R),
}

/** The surface the face decals sit on for this look. */
export function surfaceOf(look: Look): Surface {
  return HEAD_SURFACES[look.head]
}

/** The face for one expression. Every expression yields the same vertex count, colours and triangles. */
export function faceLayout(look: Look, e: Expr): FaceLayout {
  const out: FaceLayout = { pos: [], col: [], idx: [] }
  const surf = surfaceOf(look)
  const vert = (u: number, v: number, layer: number, hex: number) => {
    out.pos.push(u, v, surf(u, v, 0.004 + layer * 0.0025))
    c.setHex(hex)
    out.col.push(c.r, c.g, c.b)
    return out.pos.length / 3 - 1
  }
  /** Filled ellipse (fan), CCW seen from +z; each point mapped through `f`. */
  const disc = (
    cx: number,
    cy: number,
    a: number,
    b: number,
    layer: number,
    hex: number,
    f: (u: number, v: number) => [number, number],
  ) => {
    const centre = vert(...f(cx, cy), layer, hex)
    const first = out.pos.length / 3
    for (let i = 0; i < RING; i++) {
      const ang = (i / RING) * Math.PI * 2
      vert(...f(cx + Math.cos(ang) * a, cy + Math.sin(ang) * b), layer, hex)
    }
    for (let i = 0; i < RING; i++) out.idx.push(centre, first + i, first + ((i + 1) % RING))
  }
  /** Strip between two edges sampled left → right (x increasing), CCW seen from +z. */
  const strip = (xs: number[], tops: number[], bots: number[], layer: number, hex: number) => {
    const first = out.pos.length / 3
    for (let j = 0; j < xs.length; j++) {
      vert(xs[j], tops[j], layer, hex)
      vert(xs[j], bots[j], layer, hex)
    }
    for (let j = 0; j < xs.length - 1; j++) {
      const a = first + j * 2
      out.idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
    }
  }

  for (const s of [-1, 1]) {
    // Eye: dark iris, lower tint, big + small highlight.
    const ex = s * EYE.x
    const { f, shine } = eyeShape(e, s)
    const at = (u: number, v: number): [number, number] => {
      const [dx, dy] = f(u - ex, v - EYE.y)
      return [ex + dx, EYE.y + dy]
    }
    disc(ex, EYE.y, EYE.a, EYE.b, 0, COL.eye, at)
    disc(ex, EYE.y - 0.034, 0.048, 0.039, 1, look.iris, at)
    for (const [hx, hy, hr] of [
      [0.019, 0.032, 0.024],
      [-0.023, -0.041, 0.011],
    ]) {
      const [cx, cy] = at(ex + hx, EYE.y + hy)
      disc(cx, cy, hr * shine, hr * shine, 2, COL.shine, (u, v) => [u, v])
    }
    // Brow: thicker at the inner end.
    const xs: number[] = []
    const tops: number[] = []
    const bots: number[] = []
    for (let j = 0; j < 6; j++) {
      const u = -1 + (2 * j) / 5
      const t = u * s
      const th = BROW.th * (1 - 0.3 * ((t + 1) / 2))
      const y = BROW.y + browY(e, t)
      xs.push(s * BROW.x + u * BROW.w)
      tops.push(y + th / 2)
      bots.push(y - th / 2)
    }
    strip(xs, tops, bots, 0, shade(look.hair, 0.25))
    // Blush.
    const bs = e === 'happy' ? 1.2 : e === 'sad' ? 0.85 : 1
    disc(s * BLUSH.x, BLUSH.y, BLUSH.a * bs, BLUSH.b * bs, 0, COL.blush, (u, v) => [u, v])
  }
  const m = mouth(e)
  const xs: number[] = []
  const tops: number[] = []
  const bots: number[] = []
  for (let j = 0; j < COLS; j++) {
    const t = -1 + (2 * j) / (COLS - 1)
    xs.push(t * m.w * MOUTH_K)
    tops.push(MOUTH_Y + m.top(t) * MOUTH_K)
    bots.push(MOUTH_Y + m.bot(t) * MOUTH_K)
  }
  strip(xs, tops, bots, 0, COL.mouth)
  return out
}

const FACES: Record<FaceKind, (l: Look) => BufferGeometry> = {
  chibi: (l) => {
    const base = faceLayout(l, 'neutral')
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(base.pos, 3))
    g.setAttribute('color', new Float32BufferAttribute(base.col, 3))
    g.setIndex(new BufferAttribute(new Uint16Array(base.idx), 1))
    g.morphAttributes.position = MORPHS.map((e) => new Float32BufferAttribute(faceLayout(l, e).pos, 3))
    g.computeBoundingSphere()
    return g
  },
}

/** Face mesh geometry (head space) with one morph target per MORPHS entry. */
export function faceGeometry(l: Look): BufferGeometry {
  return FACES[l.face](l)
}

/**
 * Mood weights → morph influences (MORPHS order), into `out`. Happy / sad / effort are clamped to 0..1
 * and scaled down together when they sum past 1 (blends stay inside the shapes); a blink fades out as
 * the happy squint (already closed) comes in. Continuous in every input.
 */
export function faceMix(happy: number, sad: number, effort: number, blink: number, out: number[]): number[] {
  const cl = (v: number) => Math.min(1, Math.max(0, v))
  let h = cl(happy)
  let s = cl(sad)
  let e = cl(effort)
  const sum = h + s + e
  if (sum > 1) {
    h /= sum
    s /= sum
    e /= sum
  }
  out[0] = h
  out[1] = s
  out[2] = e
  out[3] = cl(blink) * (1 - h)
  return out
}

/** Blink: 0..1 (1 = shut), a quick close-open every ~3.4 s, offset by `seed` s. */
export function blinkAt(t: number, seed: number): number {
  const PERIOD = 3.4
  const SHUT = 0.14
  const u = (((t + seed) % PERIOD) + PERIOD) % PERIOD
  return u < SHUT ? 1 - Math.abs((2 * u) / SHUT - 1) : 0
}
