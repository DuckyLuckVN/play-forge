// Chibi face: big shiny eyes (dark iris, tinted lower half, two highlights), brows, mouth and blush as
// thin decals hugging the head surface (a sphere, a box, a muzzle bump: `surfaceOf`), all in ONE mesh. Expressions are morph targets with the same
// topology (only positions move), so moods blend smoothly: happy (^ ^ eyes, open smile), sad (droopy
// eyes, raised inner brows, frown), effort (squint, angry brows, yell), blink.
//
// `faceLayout` is pure (plain arrays, testable); `faceGeometry` wraps it for three.js.

import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { BOX_HEAD, HEAD_R } from './dims'
import { cheekX, cheekZ, MUZZLE_DIMS } from './head'
import { limbOf, type FaceKind, type HeadKind, type Look } from './look'
import { shade, tint } from './merge'
import { PALETTE } from './palette'
import { roundBoxZ } from './shapes'

export type Expr = 'neutral' | 'happy' | 'sad' | 'effort' | 'blink'
/** Morph target order (index = morphTargetInfluences slot). */
export const MORPHS: readonly Expr[] = ['happy', 'sad', 'effort', 'blink']

export interface FaceLayout {
  pos: number[]
  col: number[]
  idx: number[]
}

const COL = PALETTE

/** What a face kind draws. Every expression of one kind has the same parts (morph-safe). */
export interface FaceStyle {
  brows: boolean
  blush: boolean
  /** Eye centre raised by (m). */
  eyeUp: number
  /** Nose decal on the muzzle (colour: look.nose or dark). */
  nose: boolean
  /** Chibi smile, or the cat's ω mouth. */
  mouth: 'chibi' | 'cat'
  whiskers: boolean
  /** Dark patches behind the eyes (look.limb). */
  patch: boolean
  /** A dark rounded visor plate behind the eyes. */
  visor: boolean
  /** Eyes + mouth glow in the iris colour (on a visor). */
  glow: boolean
  /** Two lash flicks at each eye's outer top corner (follow the eye's expression shape). */
  lashes: boolean
  /**
   * Toy eyes (humans): bigger and lower, an iris gradient with a dark pupil, a thick upper lid line; thin
   * brows, a small open smile, soft (alpha-faded) blush.
   */
  toy: boolean
}
const HUMAN_FACE: FaceStyle = {
  brows: true,
  blush: true,
  eyeUp: 0,
  nose: false,
  mouth: 'chibi',
  whiskers: false,
  patch: false,
  visor: false,
  glow: false,
  lashes: false,
  toy: false,
}
const CHIBI_FACE: FaceStyle = { ...HUMAN_FACE, toy: true }
const ANIMAL_FACE: FaceStyle = {
  ...HUMAN_FACE,
  brows: false,
  eyeUp: 0.02,
  nose: true,
  mouth: 'cat',
  lashes: true,
}
export const FACE_STYLES: Record<FaceKind, FaceStyle> = {
  chibi: CHIBI_FACE,
  chibiLash: { ...CHIBI_FACE, lashes: true },
  animal: ANIMAL_FACE,
  kitty: { ...ANIMAL_FACE, whiskers: true },
  panda: { ...ANIMAL_FACE, patch: true, blush: false },
  visor: { ...HUMAN_FACE, brows: false, blush: false, visor: true, glow: true },
  jelly: { ...HUMAN_FACE, brows: false, eyeUp: 0.01, lashes: true },
  ghost: { ...HUMAN_FACE, brows: false, lashes: true },
}
/** Robot visor plate: half width / height, centre y, squareness (ring exponent < 1), colour. */
const VISOR = { a: 0.27, b: 0.125, y: -0.01, k: 0.35, color: PALETTE.visor }
/** Whiskers: 3 per side from the muzzle edge outward (x from / to, y, slope), thickness. */
const WHISKER = { x0: 0.11, x1: 0.25, y: -0.115, gap: 0.022, tilt: 0.12, th: 0.0055 }
/** Panda eye patch: half width / height, offset from the eye centre (outward, down), tilt (rad). */
const PATCH = { a: 0.088, b: 0.108, dx: 0.012, dy: -0.012, tilt: 0.45 }
/** Lash flicks: (outward, up) offset from the eye centre in eye radii, half length / thickness, tilt (rad). */
const LASHES: readonly (readonly [number, number, number])[] = [
  [0.78, 0.72, 0.5],
  [0.98, 0.32, 0.18],
]
const LASH = { a: 0.024, b: 0.0065 }
/** Eye: half width / height, centre (± x, y). */
interface EyeDims {
  a: number
  b: number
  x: number
  y: number
}
const EYE: EyeDims = { a: 0.066, b: 0.086, x: 0.138, y: -0.012 }
const BROW = { w: 0.05, x: 0.138, y: 0.108, th: 0.019 }
const MOUTH_Y = -0.125
/**
 * Toy eyes: dims; iris + pupil size shares; lid line thickness (middle, ends) as shares of the radius;
 * brows (gap over the eye top); mouth height; soft blush; tongue colour.
 */
const TOY = {
  eye: { a: 0.086, b: 0.102, x: 0.158, y: -0.062 } as EyeDims,
  iris: { a: 0.9, b: 0.9, dy: -0.004 },
  pupil: { a: 0.5, b: 0.54, dy: 0.008 },
  lid: { mid: 0.13, end: 0.05, from: 0.06 },
  brow: { gap: 0.034, w: 0.046, th: 0.011 },
  mouthY: -0.19,
  blush: { a: 0.066, b: 0.038, x: 0.245, y: -0.165 },
  tongue: 0xf07a8a,
}
/** Mouth size share (shapes below are drawn at 1). */
const MOUTH_K = 1.3
const BLUSH = { a: 0.046, b: 0.024, x: 0.215, y: -0.085 }
const RING = 20
const COLS = 11

/** Eye shape per expression: (dx, dy) from the eye centre → new offset; highlight size share. */
function eyeShape(
  e: Expr,
  side: number,
  E: EyeDims = EYE,
): { f: (dx: number, dy: number) => [number, number]; shine: number } {
  const arch = (dx: number) => 1 - Math.min(1, (dx / E.a) ** 2)
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

/** The cat's ω mouth (same conventions as `mouth`): two small arcs under the nose, open when happy. */
function catMouth(e: Expr): { w: number; top: (t: number) => number; bot: (t: number) => number } {
  const omega = (t: number) => 0.006 - 0.012 * (1 - (2 * Math.abs(t) - 1) ** 2)
  const line = (top: (t: number) => number) => (t: number) => top(t) - 0.007
  switch (e) {
    case 'happy':
      return { w: 0.034, top: omega, bot: (t) => omega(t) - 0.032 * (1 - t * t) - 0.004 }
    case 'sad': {
      const top = (t: number) => 0.004 - 0.012 * t * t
      return { w: 0.026, top, bot: line(top) }
    }
    case 'effort':
      return mouth(e)
    default:
      return { w: 0.03, top: omega, bot: line(omega) }
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

/** Small open smile (toy faces): a soft D at rest, wide open when happy. */
function toyMouth(e: Expr): { w: number; top: (t: number) => number; bot: (t: number) => number } {
  switch (e) {
    case 'happy': {
      const top = (t: number) => 0.006 + 0.006 * t * t
      return { w: 0.042, top, bot: (t) => top(t) - 0.04 * (1 - t * t) }
    }
    case 'neutral': {
      const top = (t: number) => 0.003 + 0.006 * t * t
      return { w: 0.032, top, bot: (t) => top(t) - 0.026 * (1 - t * t) - 0.002 }
    }
    default:
      return mouth(e)
  }
}

/** `a` → `b` by k (0..1). */
function mixHex(a: number, b: number, k: number): number {
  return c.setHex(a).lerp(c2.setHex(b), k).getHex()
}

const c = new Color()
const c2 = new Color()

/** Height (+z) of the head surface at (u, v) for a decal `lift` m outside it. */
export type Surface = (u: number, v: number, lift: number) => number

const sphere =
  (r: number): Surface =>
  (u, v, lift) =>
    Math.sqrt(Math.max(0, (r + lift) ** 2 - u * u - v * v))

const HEAD_SURFACES: Record<HeadKind, Surface> = {
  round: sphere(HEAD_R),
  // The round head with the cheek puff (head.ts puffCheeks): x widened, z fuller, by height.
  chibi: (u, v, lift) =>
    cheekZ(v) * Math.sqrt(Math.max(0, (HEAD_R + lift) ** 2 - (u / cheekX(v)) ** 2 - v * v)),
  box: (u, v, lift) => roundBoxZ(BOX_HEAD.a, BOX_HEAD.b, BOX_HEAD.c, BOX_HEAD.n, u, v, lift),
}

/** The surface the face decals sit on for this look: the head, with the muzzle bump (if any) on top. */
export function surfaceOf(look: Look): Surface {
  const head = HEAD_SURFACES[look.head]
  if (look.muzzle === 'none') return head
  const m = MUZZLE_DIMS[look.muzzle]
  return (u, v, lift) => {
    const q = 1 - (u / (m.a + lift)) ** 2 - ((v - m.y) / (m.b + lift)) ** 2
    const snout = q > 0 ? m.z + (m.c + lift) * Math.sqrt(q) : 0
    return Math.max(head(u, v, lift), snout)
  }
}

/** The face for one expression. Every expression yields the same vertex count, colours and triangles. */
export function faceLayout(look: Look, e: Expr): FaceLayout {
  const out: FaceLayout = { pos: [], col: [], idx: [] }
  const surf = surfaceOf(look)
  const st = FACE_STYLES[look.face]
  /** Eyes sit one layer up over patches / a visor. */
  const L = st.patch || st.visor ? 1 : 0
  const eyeCol = st.glow ? look.iris : COL.eye
  const irisCol = st.glow ? tint(look.iris, 0.6) : look.iris
  const E = st.toy ? TOY.eye : EYE
  const eyeY = E.y + st.eyeUp
  /** Quad strip through point pairs (outer, inner) running left → right, CCW seen from +z. */
  const band = (pairs: [number, number, number, number][], layer: number, hex: number) => {
    const first = out.pos.length / 3
    for (const [ox, oy, ix, iy] of pairs) {
      vert(ox, oy, layer, hex)
      vert(ix, iy, layer, hex)
    }
    for (let j = 0; j < pairs.length - 1; j++) {
      const a = first + j * 2
      out.idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
    }
  }
  const vert = (u: number, v: number, layer: number, hex: number, alpha = 1) => {
    out.pos.push(u, v, surf(u, v, 0.004 + layer * 0.0025))
    c.setHex(hex)
    out.col.push(c.r, c.g, c.b, alpha)
    return out.pos.length / 3 - 1
  }
  /**
   * Filled ellipse (fan), CCW seen from +z; each point mapped through `f`. `rim` colours the ring by its
   * angle (a gradient; colours depend only on the angle, so every expression keeps them), `rimAlpha` fades
   * the edge.
   */
  const disc = (
    cx: number,
    cy: number,
    a: number,
    b: number,
    layer: number,
    hex: number,
    f: (u: number, v: number) => [number, number],
    rim: (ang: number) => number = () => hex,
    rimAlpha = 1,
  ) => {
    const centre = vert(...f(cx, cy), layer, hex)
    const first = out.pos.length / 3
    for (let i = 0; i < RING; i++) {
      const ang = (i / RING) * Math.PI * 2
      vert(...f(cx + Math.cos(ang) * a, cy + Math.sin(ang) * b), layer, rim(ang), rimAlpha)
    }
    for (let i = 0; i < RING; i++) out.idx.push(centre, first + i, first + ((i + 1) % RING))
  }
  /** Strip between two edges sampled left → right (x increasing), CCW seen from +z (`botHex`: a gradient down). */
  const strip = (xs: number[], tops: number[], bots: number[], layer: number, hex: number, botHex = hex) => {
    const first = out.pos.length / 3
    for (let j = 0; j < xs.length; j++) {
      vert(xs[j], tops[j], layer, hex)
      vert(xs[j], bots[j], layer, botHex)
    }
    for (let j = 0; j < xs.length - 1; j++) {
      const a = first + j * 2
      out.idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
    }
  }

  if (st.visor) {
    const vy = VISOR.y + st.eyeUp
    disc(0, vy, VISOR.a, VISOR.b, 0, VISOR.color, (u, v) => {
      // Ring point → squircle (same vertex count as any disc).
      const cu = u / VISOR.a
      const cv = (v - vy) / VISOR.b
      return [
        Math.sign(cu) * Math.abs(cu) ** VISOR.k * VISOR.a,
        vy + Math.sign(cv) * Math.abs(cv) ** VISOR.k * VISOR.b,
      ]
    })
  }
  for (const s of [-1, 1]) {
    const ex = s * E.x
    if (st.patch) {
      const px = ex + s * PATCH.dx
      const py = eyeY + PATCH.dy
      const ca = Math.cos(PATCH.tilt * s)
      const sa = Math.sin(PATCH.tilt * s)
      disc(px, py, PATCH.a, PATCH.b, 0, limbOf(look), (u, v) => {
        const du = u - px
        const dv = v - py
        return [px + du * ca - dv * sa, py + du * sa + dv * ca]
      })
    }
    // Eye: dark iris, lower tint, big + small highlight.
    const { f, shine } = eyeShape(e, s, E)
    const at = (u: number, v: number): [number, number] => {
      const [dx, dy] = f(u - ex, v - eyeY)
      return [ex + dx, eyeY + dy]
    }
    disc(ex, eyeY, E.a, E.b, L, eyeCol, at)
    if (st.toy) {
      // Iris: dark at the top, glowing toward the bottom; pupil; then the lid line over the top arc.
      const top = shade(look.iris, 0.6)
      const bottom = tint(look.iris, 0.15)
      const I = TOY.iris
      disc(ex, eyeY + I.dy, E.a * I.a, E.b * I.b, L + 1, look.iris, at, (ang) =>
        mixHex(top, bottom, (1 - Math.sin(ang)) / 2),
      )
      const Pu = TOY.pupil
      disc(ex, eyeY + Pu.dy, E.a * Pu.a, E.b * Pu.b, L + 2, COL.eye, at)
      const pairs: [number, number, number, number][] = []
      const N = 12
      for (let j = 0; j <= N; j++) {
        const th = Math.PI * (1 - TOY.lid.from) - (j / N) * Math.PI * (1 - 2 * TOY.lid.from)
        const sn = Math.sin(th)
        const w = TOY.lid.end + (TOY.lid.mid - TOY.lid.end) * sn
        const o = at(ex + Math.cos(th) * E.a * (1 + w * 0.6), eyeY + sn * E.b * (1 + w))
        const i = at(ex + Math.cos(th) * E.a * 0.97, eyeY + sn * E.b * 0.97)
        pairs.push([o[0], o[1], i[0], i[1]])
      }
      band(pairs, L + 3, COL.eye)
    } else disc(ex, eyeY - 0.034, 0.048, 0.039, L + 1, irisCol, at)
    const hiL = st.toy ? L + 4 : L + 2
    for (const [hx, hy, hr] of st.toy
      ? [
          [0.022, 0.03, 0.026],
          [-0.026, -0.04, 0.012],
        ]
      : [
          [0.019, 0.032, 0.024],
          [-0.023, -0.041, 0.011],
        ]) {
      const [cx, cy] = at(ex + hx, eyeY + hy)
      disc(cx, cy, hr * shine, hr * shine, hiL, COL.shine, (u, v) => [u, v])
    }
    if (st.lashes)
      for (const [ox, oy, tilt] of LASHES) {
        // Anchored on the eye's (morphed) outline, so a happy squint carries them down.
        const [cx, cy] = at(ex + s * ox * E.a, eyeY + oy * E.b)
        const ca = Math.cos(tilt * s)
        const sa = Math.sin(tilt * s)
        const lx = cx + s * LASH.a * 0.8
        disc(lx, cy, LASH.a, LASH.b, st.toy ? L + 3 : L, eyeCol, (u, v) => {
          const du = u - lx
          const dv = v - cy
          return [lx + du * ca - dv * sa, cy + du * sa + dv * ca]
        })
      }
    if (st.brows) {
      // Brow: thicker at the inner end.
      const xs: number[] = []
      const tops: number[] = []
      const bots: number[] = []
      const bw = st.toy ? TOY.brow.w : BROW.w
      const bth = st.toy ? TOY.brow.th : BROW.th
      const by = st.toy ? E.y + E.b + TOY.brow.gap : BROW.y
      for (let j = 0; j < 6; j++) {
        const u = -1 + (2 * j) / 5
        const t = u * s
        const th = bth * (1 - 0.3 * ((t + 1) / 2))
        const y = by + st.eyeUp + browY(e, t)
        xs.push(s * E.x + u * bw)
        tops.push(y + th / 2)
        bots.push(y - th / 2)
      }
      strip(xs, tops, bots, 0, shade(look.hair, st.toy ? 0.15 : 0.25))
    }
    if (st.blush) {
      const bs = e === 'happy' ? 1.2 : e === 'sad' ? 0.85 : 1
      const B = st.toy ? TOY.blush : BLUSH
      // Toy blush fades out to its edge (the face mesh blends).
      disc(s * B.x, B.y, B.a * bs, B.b * bs, 0, COL.blush, (u, v) => [u, v], undefined, st.toy ? 0 : 1)
    }
    if (st.whiskers)
      for (let w = -1; w <= 1; w++) {
        const y0 = WHISKER.y + w * WHISKER.gap
        const slope = w * WHISKER.tilt
        const xs: number[] = []
        const tops: number[] = []
        const bots: number[] = []
        for (let j = 0; j < 4; j++) {
          const k = j / 3
          // Left side runs outer → inner so x increases.
          const kk = s < 0 ? 1 - k : k
          const x = s * (WHISKER.x0 + (WHISKER.x1 - WHISKER.x0) * kk)
          const y = y0 + slope * (WHISKER.x1 - WHISKER.x0) * kk
          const th = WHISKER.th * (1 - 0.5 * kk)
          xs.push(x)
          tops.push(y + th / 2)
          bots.push(y - th / 2)
        }
        strip(xs, tops, bots, 0, shade(look.skin, 0.55))
      }
  }
  if (st.nose && look.muzzle !== 'none') {
    const m = MUZZLE_DIMS[look.muzzle]
    const ny = m.y + m.b * 0.5
    disc(0, ny, 0.024, 0.015, 1, look.nose ?? COL.nose, (u, v) => [u, v + (v < ny ? (v - ny) * 0.5 : 0)])
  }
  const m = st.mouth === 'cat' ? catMouth(e) : st.toy ? toyMouth(e) : mouth(e)
  const xs: number[] = []
  const tops: number[] = []
  const bots: number[] = []
  const my = st.toy ? TOY.mouthY : MOUTH_Y
  for (let j = 0; j < COLS; j++) {
    const t = -1 + (2 * j) / (COLS - 1)
    xs.push(t * m.w * MOUTH_K)
    tops.push(my + m.top(t) * MOUTH_K)
    bots.push(my + m.bot(t) * MOUTH_K)
  }
  const mc = st.glow ? look.iris : COL.mouth
  strip(xs, tops, bots, L, mc, st.toy ? TOY.tongue : mc)
  return out
}

/** Face mesh geometry (head space, the look's FACE_STYLES entry) with one morph target per MORPHS entry. */
export function faceGeometry(l: Look): BufferGeometry {
  const base = faceLayout(l, 'neutral')
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(base.pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(base.col, 4))
  g.setIndex(new BufferAttribute(new Uint16Array(base.idx), 1))
  g.morphAttributes.position = MORPHS.map((e) => new Float32BufferAttribute(faceLayout(l, e).pos, 3))
  g.computeBoundingSphere()
  return g
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
