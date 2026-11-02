/**
 * Slimes: a jelly blob whose bulges each wobble on their own phase, with gloss, determined brows and an open grin.
 * Armless: two floating hands hover by its sides (the sockets are only the pivots the pose swings them from). The top
 * of the jelly trails hops and squashes; it splats and throws droplets on cheer, splats flat with a dark flash when
 * hurt, and melts to a puddle on KO. Each variant's extras come from `KINDS`:
 * - gold (Goldie): a belt, pouch and coin buckle, coin flecks drifting inside, rising bubbles; flips a coin;
 * - snow (Flurry): an icy jelly under a snow cap, twinkling frost sparkles; whirls up a flurry; KO leaves a snow pile;
 * - twins (Pip & Pop): two small slimes side by side that bob in turn, the front twin's hand holding the ball and the
 *   back twin's hand waving now and then; they juggle a pebble between them; both flop on KO.
 */
import type { Pose } from '../../hero-avatar'
import { TAU, boundsOf, flourish, pulse, sigOf } from '../motion'
import {
  OUTLINE,
  box,
  clamp,
  darkOf,
  dotEye,
  ell,
  gloss,
  group,
  happy,
  happyEye,
  lerp,
  lightOf,
  look as wander,
  mix,
  openMouth,
  paint,
  smooth,
  ticks,
} from '../paint'
import type { BodyMetrics, BodyType, CreatureLook, DrawKit, Frame, HeadBox } from '../types'

type Ctx = CanvasRenderingContext2D
interface Pt {
  x: number
  y: number
}

const GOLD = '#ffd43b'
const BELT = '#7a4a06'
const SNOW = '#f8fbff'

/** Blob height (local units, feet at 0, up is −y): the top of the dome, before any wobble. */
const TOP = 47
/** The arm pivots at the blob's sides (spec: (±16, −22)). */
const SOCKET = { x: 16, y: -22 }
/** Face centre, and the box the hand solver keeps the hands out of (eyes, brows and grin). */
const FACE = { x: 0.5, y: -30 }
const HEAD: HeadBox = { x: 0.5, y: -34, rx: 11, ry: 9 }
/** The hat sits on the dome, its brim just below the top. */
const HAT: HeadBox = { x: 1, y: -44, rx: 12, ry: 8 }
/** Un-wobbled outline bounds (the bulges reach ±1.6 past them). */
const BOUNDS = { l: -24, r: 24, t: -TOP - 1.6 }
/** The top trails a hop by this share of it (hop < 0 is up). */
const HOP_LAG = 0.3
/** The top gets the squash spring with this much extra. */
const TOP_EXTRA = 0.5
/** A full melt flattens the jelly by this share (a puddle tall enough to keep its face). */
const MELT_Y = 0.62

/** Reaction splat (+ = wider and flatter): a bouncy spring on cheer and pump, a flat splat on hurt. */
function splatOf(f: Frame): number {
  if (f.still) return 0
  const a = f.moodAge
  if ((f.mood === 'cheer' || f.mood === 'pump') && a < 1.2) return Math.exp(-a * 5) * Math.cos(a * 18) * 0.28
  if (f.mood === 'hurt' && a < 0.6) return 0.3 * Math.exp(-a * 7)
  return 0
}

/** The jelly's deformation for this frame: everything the body does to its shape. */
export interface Jelly {
  /** Squash spring (+ = wider), before the top's extra. */
  sq: number
  splat: number
  /** Top offset from the hop lag (+ = down). */
  lag: number
  lean: number
  crouch: number
  melt: number
  /** Placement in the kit's frame: the blob's centre x, its lift (+ = up), its width and height scale (1 alone). */
  ox: number
  oy: number
  s: number
  sy: number
  /** The face's shift (blob units, + = forward); the front twin looks back a little so the held ball clears it. */
  faceX: number
}

/** Where a slime stands, and how big it is; `twin` marks one of the pair. */
interface Placement {
  ox: number
  s: number
  sy: number
  faceX: number
  phase: number
  delay: number
  twin: boolean
}
const ALONE: Placement = { ox: 0, s: 1, sy: 1, faceX: 0, phase: 0, delay: 0, twin: false }

type Variant = 'gold' | 'snow' | 'twins'
const variantOf = (look: CreatureLook): Variant =>
  Object.hasOwn(KINDS, look.variant) ? (look.variant as Variant) : 'gold'

/**
 * Pip & Pop: the front twin (small, in front, holds the ball; a jelly curl on top) and the back twin (taller and
 * slimmer, behind, waves; wears the hat, so the front twin's hat never covers its face). The pair keeps one slime's
 * footprint (within ±26) and the back twin's face shows over the front twin's shoulder.
 */
const TWINS: Record<'front' | 'back', Placement> = {
  front: { ox: 4, s: 0.62, sy: 0.66, faceX: -3, phase: 0, delay: 0, twin: true },
  back: { ox: -9, s: 0.7, sy: 0.86, faceX: -4, phase: Math.PI, delay: 0.18, twin: true },
}
/** The back twin waves for this long out of every `WAVE_EVERY` seconds. */
const WAVE_FOR = 1.6
const WAVE_EVERY = 4.5

function jellyOf(f: Frame, at = ALONE): Jelly {
  // Twins bob in turn at rest, and hop in turn on a cheer (a pump is a little hop).
  const fl = flourish(f)
  const bob = f.still || !at.twin ? 0 : 1.4 * Math.max(0, Math.sin(f.t * 3.2 + at.phase))
  const hop = !at.twin || !fl.k ? 0 : (fl.cheer ? 9 : 3) * pulse(f.moodAge - at.delay, fl.cheer ? 0.45 : 0.3)
  return {
    sq: -f.squash * 0.03,
    splat: splatOf(f),
    lag: -f.hop * HOP_LAG,
    lean: f.pose.lean,
    crouch: f.pose.crouch,
    melt: smooth(clamp(f.pose.fall)),
    ox: at.ox,
    oy: bob + hop,
    s: at.s,
    sy: at.sy,
    faceX: at.faceX,
  }
}

/** The blobs to draw, back to front: one slime, or the back twin then the front twin. */
const jelliesOf = (look: CreatureLook, f: Frame): Jelly[] =>
  variantOf(look) === 'twins' ? [jellyOf(f, TWINS.back), jellyOf(f, TWINS.front)] : [jellyOf(f)]

/** Maps a point of the resting blob to the kit's frame: squash and splat (more on top), hop lag, lean skew, crouch, melt. */
function warp(j: Jelly, p: Pt): Pt {
  const k = clamp(-p.y / TOP)
  const s = j.sq * (1 + TOP_EXTRA * k) + j.splat
  let x = p.x * (1 + s) * (1 + 0.06 * j.crouch)
  let y = p.y * (1 - s) * (1 - 0.12 * j.crouch) + j.lag * k
  x += -y * j.lean * 0.7
  // Melting: the jelly slumps and spreads, the base most.
  x *= 1 + j.melt * (0.55 - 0.15 * k)
  y *= 1 - MELT_Y * j.melt
  return { x: j.ox + x * j.s, y: (y - j.oy) * j.sy }
}

/** SVG path in blob units, every `x y` pair warped (M L C Q Z only). */
const jellyPath = (j: Jelly, d: string) =>
  new Path2D(
    d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, a: string, b: string) => {
      const q = warp(j, { x: +a, y: +b })
      return `${q.x.toFixed(3)} ${q.y.toFixed(3)}`
    }),
  )

/**
 * The local affine at `p` (the warp's slope there), so small parts (face, buckle, flecks) ride the jelly.
 * The height scale never drops under `minY`, so a melted face still reads.
 */
function ride(ctx: Ctx, j: Jelly, p: Pt, minY = 0.3): void {
  const o = warp(j, p)
  const ax = warp(j, { x: p.x + 1, y: p.y })
  const ay = warp(j, { x: p.x, y: p.y + 1 })
  ctx.translate(o.x, o.y)
  ctx.transform(ax.x - o.x, ax.y - o.y, ay.x - o.x, Math.max(minY, ay.y - o.y), 0, 0)
}

/** The blob outline: each bulge wobbles on its own phase, so it reads as jelly, not a scaled picture. */
function blobPath(j: Jelly, t: number, still: boolean): Path2D {
  const w = (ph: number, amp = 1.2) => (still ? 0 : Math.sin(t * 3.4 + ph) * amp).toFixed(3)
  return jellyPath(
    j,
    `M-21 -5 C${-26 + +w(0)} -9 ${-25 + +w(0.5)} ${-21 + +w(1)} -17 ${-25 + +w(1.2)} ` +
      `C-17 ${-40 + +w(2)} -7 ${-TOP + +w(2.4, 1.6)} 1 ${-TOP + +w(2.6, 1.6)} ` +
      `C10 ${-TOP + +w(3)} ${19 + +w(3.3)} -39 ${19 + +w(3.6)} ${-27 + +w(3.8)} ` +
      `C${24 + +w(4.4)} -22 ${25 + +w(4.8)} -9 19 -4 C12 1 -14 1 -21 -5 Z`,
  )
}

/** One slime's face box in the kit's frame (the head box warped, scaled and shifted with the face). */
export function faceBoxOf(j: Jelly): HeadBox {
  const c = warp(j, { x: HEAD.x + j.faceX, y: HEAD.y })
  return { x: c.x, y: c.y, rx: HEAD.rx * j.s, ry: HEAD.ry * j.sy * (1 - 0.6 * j.melt) }
}

/** The jellies of a look for a frame (for tests: each twin's own face). */
export const slimeJellies = (look: CreatureLook, f: Frame): Jelly[] => jelliesOf(look, f)

function metrics(look: CreatureLook, f: Frame): BodyMetrics {
  const js = jelliesOf(look, f)
  const pts = js.flatMap((j) =>
    [
      { x: BOUNDS.l, y: BOUNDS.t },
      { x: BOUNDS.r, y: BOUNDS.t },
      { x: BOUNDS.l, y: 0 },
      { x: BOUNDS.r, y: 0 },
    ].map((p) => warp(j, p)),
  )
  const front = js[js.length - 1]
  const back = js[0]
  const melt = 1 - 0.6 * front.melt
  let head: HeadBox
  if (js.length > 1) {
    // Twins: the box round both faces (the solver keeps hands a circle of its larger half-size away from its centre).
    const fs = js.map((j) => faceBoxOf(j))
    const l = Math.min(...fs.map((h) => h.x - h.rx))
    const r = Math.max(...fs.map((h) => h.x + h.rx))
    const t = Math.min(...fs.map((h) => h.y - h.ry))
    const b = Math.max(...fs.map((h) => h.y + h.ry))
    head = { x: (l + r) / 2, y: (t + b) / 2, rx: (r - l) / 2, ry: ((b - t) / 2) * melt }
  } else {
    const c = warp(front, HEAD)
    head = { x: c.x, y: c.y, rx: HEAD.rx, ry: HEAD.ry * melt }
  }
  return {
    headTop: Math.min(...js.map((j) => warp(j, { x: 1, y: -TOP }).y)),
    head,
    socketF: warp(front, SOCKET),
    socketB: warp(back, { x: -SOCKET.x, y: SOCKET.y }),
    bodyBox: boundsOf(pts),
    upper: 8,
    fore: 8,
    armed: false,
    handR: 4.2,
  }
}

/**
 * Floating-hand reactions on the mood pose: hands hover a little out from the sides and bob; up and waving on
 * cheer and pump, raised on cast; a lob throw cocked up over the shoulder (no room behind a blob), flung forward;
 * on KO they flop by the puddle.
 */
function pose(look: CreatureLook, f: Frame): Pose {
  const p = { ...f.pose }
  const t = f.t
  const wave = (ph: number) => (f.still ? 0 : 0.3 * Math.sin(t * 16 + ph))
  const bob = (ph: number) => (f.still ? 0 : 0.14 * Math.sin(t * 2.6 + ph))
  switch (f.mood) {
    case 'cheer':
    case 'pump':
      // Up beside the hat, waving.
      p.sF = 2.75 + wave(0)
      p.sB = -2.7 - wave(1)
      p.eF = 0.15 + wave(2)
      p.eB = -0.15 - wave(3)
      break
    case 'cast':
      p.sF = 2.3
      p.sB = -2.3
      p.eF = p.eB = 0.25
      break
    case 'throw': {
      const k = smooth(clamp(f.moodAge / 0.22))
      p.sF = lerp(2.85, 1.9, k)
      p.eF = lerp(0.4, 0.1, k)
      break
    }
    case 'idle':
    case 'watch':
      p.sF += 0.25
      p.sB -= 0.3
      p.eF += bob(0)
      p.eB += bob(1.3)
      // The back twin waves now and then (its character beat), up beside its own head.
      if (variantOf(look) === 'twins' && !f.still && t % WAVE_EVERY < WAVE_FOR) {
        p.sB = -3
        p.eB = 0.3 + 0.4 * Math.sin(t * 12)
      }
      break
    default:
      p.eF += bob(0)
      p.eB += bob(1.3)
  }
  // Behind a blob there is nothing to hold a back hand up: it floats out past the back side instead of hiding under the jelly.
  if (f.mood !== 'cheer' && f.mood !== 'pump' && f.mood !== 'cast') p.sB = Math.min(p.sB, -0.45)
  // The jelly leans by skewing: the hands lean along.
  p.sF += p.lean * 0.5
  p.sB += p.lean * 0.5
  // KO: the hands slump out by the puddle's sides.
  const m = smooth(clamp(f.pose.fall))
  if (m > 0) {
    p.sF = lerp(p.sF, 0.9, m)
    p.eF = lerp(p.eF, 0.6, m)
    p.sB = lerp(p.sB, -0.9, m)
    p.eB = lerp(p.eB, -0.6, m)
  }
  return p
}

/** Droplets fly out of a cheer splat (in the kit's frame, behind the body). */
function droplets(ctx: Ctx, color: string, f: Frame): void {
  const a = f.moodAge
  if (f.still || !(f.mood === 'cheer' || f.mood === 'pump') || a >= 0.9) return
  ctx.save()
  ctx.globalAlpha = clamp(1.4 - a * 1.5)
  ctx.fillStyle = color
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.2
  for (let i = 0; i < 7; i++) {
    const ang = -0.3 - (i / 6) * (Math.PI - 0.6)
    const v = 38 + (i % 3) * 9
    const r = 2.2 - (i % 2) * 0.6
    ctx.beginPath()
    ctx.ellipse(
      Math.cos(ang) * v * a,
      -18 + Math.sin(ang) * v * a + 70 * a * a,
      r,
      r * 1.25,
      ang + Math.PI / 2,
      0,
      Math.PI * 2,
    )
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

/** Small spinning coins suspended in the gold jelly. */
function flecks(ctx: Ctx, j: Jelly, t: number): void {
  for (const [x, y, ph] of [
    [-14, -31, 0],
    [-9, -10, 1.7],
    [13, -10, 3.1],
    [-17, -19, 4.4],
    [11, -38, 5.6],
  ]) {
    const spin = Math.cos(t * 1.6 + ph)
    ctx.save()
    ride(ctx, j, { x, y: y + Math.sin(t * 0.8 + ph) * 0.8 })
    paint(ctx, { p: ell(0, 0, 1.9 * Math.max(0.25, Math.abs(spin)), 1.9), c: '#fff1a8', k: 0, lw: 0.8 })
    ctx.restore()
  }
}

/** Belt band, pouch and the coin buckle, riding the jelly. */
function belt(ctx: Ctx, j: Jelly, blob: Path2D, look: CreatureLook): void {
  ctx.save()
  ctx.clip(blob)
  paint(ctx, {
    p: jellyPath(j, 'M-30 -15 Q0 -10 30 -15 L30 -10 Q0 -5 -30 -10 Z'),
    c: BELT,
    k: 0,
    inner: true,
    lw: 1.5,
  })
  ctx.restore()
  ctx.save()
  ride(ctx, j, { x: -14, y: -12 })
  paint(ctx, { p: box(-4, -4.5, 8, 9, 2), c: mix(BELT, look.second, 0.4), k: 0.4, inner: true, lw: 1.5 })
  paint(ctx, {
    p: box(-4, -4.5, 8, 3.2, [2, 2, 0.6, 0.6]),
    c: mix(BELT, '#000000', 0.15),
    k: 0,
    inner: true,
    lw: 1.2,
  })
  ctx.restore()
  // Coin buckle: a gold coin with a rim and a stamped bar.
  ctx.save()
  ride(ctx, j, { x: -1, y: -12.4 })
  paint(ctx, { p: ell(0, 0, 3.6, 3.6), c: GOLD, k: 0.35, inner: true, lw: 1.4 })
  ctx.strokeStyle = darkOf(GOLD)
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.arc(0, 0, 2.3, 0, Math.PI * 2)
  ctx.moveTo(0, -1.4)
  ctx.lineTo(0, 1.4)
  ctx.stroke()
  ctx.restore()
}

/** Determined brows, eyes that look around, and the open grin; xx on KO, squeezed on a flinch. */
function face(ctx: Ctx, f: Frame, t: number): void {
  const fy = -4
  const flip = sigOf(f)
  const lx = f.lookX * 1.1 + (f.still ? 0 : wander(t, 3) * 0.7)
  const ly = f.lookY * 0.9 + (f.still ? 0 : wander(t, 9) * 0.4) - flip * 1.4
  const eyes = [-5.5, 6]
  ctx.lineCap = 'round'
  if (happy(f)) {
    for (const ex of eyes) happyEye(ctx, ex, fy, 3)
  } else if (f.eyes === 'xx') {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 2
    ctx.beginPath()
    for (const ex of eyes) {
      ctx.moveTo(ex - 2.4, fy - 2.4)
      ctx.lineTo(ex + 2.4, fy + 2.4)
      ctx.moveTo(ex + 2.4, fy - 2.4)
      ctx.lineTo(ex - 2.4, fy + 2.4)
    }
    ctx.stroke()
  } else if (f.eyes === 'squeeze') {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 2.2
    ctx.beginPath()
    for (const [ex, d] of [
      [eyes[0], 1],
      [eyes[1], -1],
    ]) {
      ctx.moveTo(ex - 2.4 * d, fy - 2.6)
      ctx.lineTo(ex + 2.2 * d, fy)
      ctx.lineTo(ex - 2.4 * d, fy + 2.6)
    }
    ctx.stroke()
  } else {
    const wide = f.eyes === 'wide' ? 1.3 : 1
    const shut = f.blink > 0 || f.pose.eyeOpen < 0.2
    const open = Math.max(0.35, Math.min(1, f.pose.eyeOpen))
    for (const ex of eyes) dotEye(ctx, ex, fy, 2.4 * wide, 3.2 * wide * open, shut, lx, ly)
  }
  // Brows: angled in (determined) at rest, lower inside when angry, raised when worried or amazed.
  if (f.eyes !== 'xx') {
    const up = f.pose.browUp * 1.6
    const knit = 2 + f.pose.brow * 1.2
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.moveTo(-9.5, fy - 6.8 - up)
    ctx.lineTo(-2.5, fy - 6.8 - up + knit)
    ctx.moveTo(10, fy - 6.8 - up)
    ctx.lineTo(3, fy - 6.8 - up + knit)
    ctx.stroke()
  }
  // Mouth: the open grin (wider when happy), a frown when hurt or sad, a small "o" when amazed or knocked out.
  const my = fy + 5.2
  if (f.mood === 'ko' || (f.pose.mouthOpen > 0.45 && !happy(f) && f.pose.smile <= 0.3)) {
    ctx.fillStyle = '#7a1f2b'
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.ellipse(0.5, my + 1.5, 2, 1.4 + 1.4 * f.pose.mouthOpen, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  } else if (f.pose.smile < 0) {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.8
    ctx.beginPath()
    ctx.arc(0.5, my + 4, 3, 1.2 * Math.PI, 1.8 * Math.PI)
    ctx.stroke()
  } else {
    const joy = happy(f)
    openMouth(ctx, 0.5, my, joy ? 4.6 : 3.4, joy ? 6 : 3.4 + 0.6 * Math.sin(t * 3.4) + 2 * f.pose.mouthOpen)
  }
}

/** Bubbles rise from the dome, wobble and pop. */
function bubbles(ctx: Ctx, look: CreatureLook, top: Pt, t: number, s: number): void {
  for (const [bx, r, ph] of [
    [17, 2.4, 0],
    [24, 1.7, 0.45],
    [12, 1.3, 0.75],
  ]) {
    const k = (t * 0.5 + ph) % 1
    const y = top.y + (6 - k * 22) * s
    const x = top.x + (bx - 1 + Math.sin(t * 4 + ph * 9) * 1.5) * s
    const rr = r * s * (k > 0.9 ? 1 + (k - 0.9) * 8 : 1)
    ctx.globalAlpha = k > 0.9 ? 1 - (k - 0.9) * 10 : 1
    ctx.fillStyle = lightOf(look.main)
    ctx.strokeStyle = 'rgb(20 26 46 / 0.6)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, rr, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    gloss(ctx, x - rr * 0.35, y - rr * 0.35, rr * 0.35, rr * 0.25)
    ctx.globalAlpha = 1
  }
}

/** Flurry's snow cap: a white drift over the dome with a scalloped edge (clipped to the jelly). */
function snowCap(ctx: Ctx, j: Jelly): void {
  paint(ctx, {
    p: jellyPath(
      j,
      'M-30 -38 Q-24 -34 -18 -39 Q-12 -35 -6 -41 Q0 -37 6 -41 Q12 -36 18 -39 Q24 -34 30 -38 L30 -60 L-30 -60 Z',
    ),
    c: SNOW,
    k: 0.5,
    inner: true,
    lw: 1.4,
  })
}

/** A four-point twinkle. */
function twinkle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.quadraticCurveTo(x, y, x, y + r)
  ctx.quadraticCurveTo(x, y, x - r, y)
  ctx.quadraticCurveTo(x, y, x, y - r)
  ctx.fill()
}

/** Frost sparkles twinkling in and round the icy jelly. */
function sparkles(ctx: Ctx, j: Jelly, t: number): void {
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.shadowColor = '#a5f3ff'
  ctx.shadowBlur = 4
  for (const [x, y, ph] of [
    [-15, -24, 0],
    [12, -12, 1.9],
    [-6, -9, 3.6],
    [24, -38, 2.7],
    [-26, -30, 4.8],
  ]) {
    const k = 0.5 + 0.5 * Math.sin(t * 2.4 + ph)
    if (k < 0.15) continue
    const p = warp(j, { x, y })
    twinkle(ctx, p.x, p.y, 1 + 2.4 * k)
  }
  ctx.restore()
}

/** A snowflake: three crossed strokes with an outline so it reads on the board. */
function flake(ctx: Ctx, x: number, y: number, r: number, a: number): void {
  for (const [c, w] of [
    [OUTLINE, 2.6],
    ['#ffffff', 1.3],
  ] as const) {
    ctx.strokeStyle = c
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      const b = a + (i * Math.PI) / 3
      ctx.moveTo(x - Math.cos(b) * r, y - Math.sin(b) * r)
      ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r)
    }
    ctx.stroke()
  }
}

/** Flurry's KO: the slumped jelly becomes a snow pile, lumps of snow heaped on its base. */
function snowPile(ctx: Ctx, j: Jelly): void {
  if (j.melt < 0.3) return
  const k = (j.melt - 0.3) / 0.7
  group(
    ctx,
    [
      [-20, -2, 9],
      [19, -2, 8],
      [-4, -1, 10],
    ].map(([x, y, r]) => {
      const p = warp(j, { x, y })
      return { p: ell(p.x, p.y, r * k * j.s, r * 0.6 * k * j.s), c: SNOW, k: 0.5 }
    }),
  )
}

/** Signature: a coin pops out of the top, spins up and drops back in. */
function coinflip(ctx: Ctx, f: Frame, js: Jelly[]): void {
  const top = warp(js[0], { x: 1, y: -TOP })
  const k = f.fidget
  const y = top.y - 4 - 28 * 4 * k * (1 - k)
  const spin = Math.abs(Math.cos(k * Math.PI * 6))
  paint(ctx, { p: ell(top.x + 6, y, 3.6 * Math.max(0.15, spin), 3.6), c: GOLD, k: 0.3, lw: 1.4 })
  if (spin > 0.4) gloss(ctx, top.x + 6 - spin, y - 1.2, 0.9 * spin, 0.6)
}

/** Signature: a flurry of snowflakes whirls round the slime and settles. */
function flurry(ctx: Ctx, f: Frame, js: Jelly[]): void {
  const c = warp(js[0], { x: 0, y: -26 })
  const k = sigOf(f)
  ctx.save()
  ctx.globalAlpha = clamp(k * 1.6)
  for (let i = 0; i < 7; i++) {
    const a = f.fidget * TAU * 1.5 + (i / 7) * TAU
    flake(ctx, c.x + Math.cos(a) * (20 + 8 * k), c.y + Math.sin(a) * 9 - 12 * k * Math.sin(i), 2.2, a * 2)
  }
  ctx.restore()
}

/** Signature: the twins toss a pebble over to each other and back. */
function juggle(ctx: Ctx, f: Frame, js: Jelly[]): void {
  const [back, front] = js.map((j) => warp(j, { x: 1, y: -TOP }))
  const k = clamp(f.fidget)
  const q = k < 0.5 ? k * 2 : 2 - k * 2
  const x = lerp(front.x, back.x, q)
  const y = lerp(front.y, back.y, q) - 4 - 22 * 4 * q * (1 - q)
  paint(ctx, { p: ell(x, y, 2.6, 2.3, k * 9), c: '#a7b0c0', k: 0.4, lw: 1.4 })
}

/** Everything one slime's extras need. */
interface SlimePaint {
  look: CreatureLook
  f: Frame
  t: number
  j: Jelly
  blob: Path2D
}

/** A slime variant: what it paints in and on its jelly, its signature, its hurt flash and its cheer droplets. */
interface Kind {
  /** Painted inside the jelly (clipped to it). */
  inside?(ctx: Ctx, p: SlimePaint): void
  /** Painted on the jelly, under the face (belt, pouch). */
  over?(ctx: Ctx, p: SlimePaint): void
  /** Painted round the jelly over the face (bubbles, sparkles); not on KO. */
  around?(ctx: Ctx, p: SlimePaint): void
  /** Painted on KO over the puddle. */
  ko?(ctx: Ctx, p: SlimePaint): void
  sig(ctx: Ctx, f: Frame, js: Jelly[]): void
  flash: string
  drop(look: CreatureLook): string
}

const KINDS: Record<Variant, Kind> = {
  gold: {
    inside: (ctx, p) => flecks(ctx, p.j, p.t),
    over: (ctx, p) => belt(ctx, p.j, p.blob, p.look),
    around: (ctx, p) => bubbles(ctx, p.look, warp(p.j, { x: 1, y: -TOP }), p.t, p.j.s),
    sig: coinflip,
    flash: '#5a2a00',
    drop: (look) => lightOf(look.main),
  },
  snow: {
    inside: (ctx, p) => snowCap(ctx, p.j),
    around: (ctx, p) => sparkles(ctx, p.j, p.t),
    ko: (ctx, p) => snowPile(ctx, p.j),
    sig: flurry,
    flash: '#1c3f6e',
    drop: () => SNOW,
  },
  twins: {
    sig: juggle,
    flash: '#4a1030',
    drop: (look) => lightOf(look.main),
  },
}

/** The front twin's jelly curl on top (blob units). */
const CURL = 'M-4 -45 C-6 -55 4 -60 10 -56 C4 -55 2 -51 3 -45 Z'

/**
 * One slime: the jelly, its variant extras, gloss, face and hat. `front` marks the front (or only) slime, which
 * carries the emblem; `hat` is false for the front twin, which gets a jelly curl instead.
 */
function blob(
  ctx: Ctx,
  look: CreatureLook,
  f: Frame,
  k: DrawKit,
  j: Jelly,
  color: string,
  front: boolean,
  hat: boolean,
): void {
  const kind = KINDS[variantOf(look)]
  const t = f.still ? 0 : f.t
  // A dark flash on the hurt splat; a snow slime pales into a snow pile as it slumps.
  const flash = !f.still && f.mood === 'hurt' && f.moodAge < 0.25 ? 0.55 * (1 - f.moodAge / 0.25) : 0
  let main = flash ? mix(color, kind.flash, flash) : color
  if (kind.ko) main = mix(main, SNOW, 0.75 * j.melt)
  const path = blobPath(j, t, f.still)
  const p: SlimePaint = { look, f, t, j, blob: path }
  group(
    ctx,
    hat
      ? [{ p: path, c: main, k: 1.4 }]
      : [
          { p: jellyPath(j, CURL), c: main },
          { p: path, c: main, k: 1.4 },
        ],
  )
  if (kind.inside) {
    ctx.save()
    ctx.clip(path)
    kind.inside(ctx, p)
    ctx.restore()
  }
  kind.over?.(ctx, p)
  if (front) {
    const e = warp(j, { x: 10, y: -17 })
    k.emblem(e.x, e.y, 5 * j.s)
  }
  if (f.mood === 'ko') kind.ko?.(ctx, p)

  // Gloss on the upper left, wobbling with the dome.
  const g = (ph: number) => (f.still ? 0 : Math.sin(t * 3.4 + ph) * 0.6)
  const g1 = warp(j, { x: -12 + g(1), y: -36 + g(2) })
  const g2 = warp(j, { x: -18, y: -22 })
  gloss(ctx, g1.x, g1.y, 4 * j.s, 2.4 * j.sy * (1 - 0.6 * j.melt), -0.7)
  gloss(ctx, g2.x, g2.y, 1.6 * j.s, 1.1 * j.s, -0.7)

  ctx.save()
  ride(
    ctx,
    j,
    { x: FACE.x + j.faceX, y: FACE.y + (f.still ? 0 : Math.sin(t * 3.4 + 2.5) * 0.5) },
    0.55 * j.sy,
  )
  face(ctx, f, t)
  ctx.restore()

  if (hat) placeHat(ctx, k, j)
  if (f.mood !== 'ko') kind.around?.(ctx, p)
}

/** The hat rides the top of the jelly, leaning with it (never wider than 1.15×); on a melt it tips back onto the puddle. */
function placeHat(ctx: Ctx, k: DrawKit, j: Jelly): void {
  const hc = warp(j, HAT)
  const hs = warp(j, { x: HAT.x + 1, y: HAT.y })
  ctx.save()
  ctx.translate(hc.x - 17 * j.melt * j.s, hc.y + 2 * j.melt * j.sy)
  ctx.rotate(Math.atan(j.lean * 0.7) - 0.7 * j.melt)
  k.hat({ x: 0, y: 0, rx: HAT.rx * j.s * clamp((hs.x - hc.x) / j.s, 0.85, 1.15), ry: HAT.ry * j.sy })
  ctx.restore()
}

function draw(ctx: Ctx, look: CreatureLook, f: Frame, k: DrawKit): void {
  const kind = KINDS[variantOf(look)]
  const js = jelliesOf(look, f)

  // Floating hands: no arms, so the back one simply hovers behind the jelly.
  k.backHand()
  droplets(ctx, kind.drop(look), f)
  // Twins: the back twin in the second colour, the front twin (with the emblem) in the main one.
  js.forEach((j, i) => {
    const twin = js.length > 1
    const front = i === js.length - 1
    blob(ctx, look, f, k, j, twin && !front ? look.second : look.main, front, !twin || !front)
  })
  if (!f.still && f.fidget > 0) kind.sig(ctx, f, js)
  if (happy(f)) ticks(ctx, 22, Math.min(...js.map((j) => warp(j, { x: 1, y: -TOP }).y)) - 4, f.moodAge)

  k.frontHand()
}

export const slime: BodyType = { metrics, draw, pose }
