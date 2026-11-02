/**
 * Goldie the gold slime: a jelly blob whose bulges each wobble on their own phase, with a belt, pouch and coin buckle,
 * coin flecks drifting inside, gloss, rising bubbles, determined brows and an open grin. Armless: two floating hands
 * hover by its sides (the sockets are only the pivots the pose swings them from). The top of the jelly trails hops and
 * squashes; it splats and throws droplets on cheer, splats flat with a dark flash when hurt, and melts to a puddle on KO.
 */
import type { Pose } from '../../hero-avatar'
import {
  OUTLINE,
  darkOf,
  dotEye,
  gloss,
  group,
  happyEye,
  lightOf,
  look as wander,
  mix,
  openMouth,
  paint,
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

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const smooth = (k: number) => k * k * (3 - 2 * k)
const happy = (f: Frame) => f.mood === 'cheer' || f.mood === 'pump' || f.eyes === 'happy'
const ell = (x: number, y: number, rx: number, ry: number, rot = 0) => {
  const p = new Path2D()
  p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  return p
}

/** Reaction splat (+ = wider and flatter): a bouncy spring on cheer and pump, a flat splat on hurt. */
function splatOf(f: Frame): number {
  const a = f.moodAge
  if ((f.mood === 'cheer' || f.mood === 'pump') && a < 1.2) return Math.exp(-a * 5) * Math.cos(a * 18) * 0.28
  if (f.mood === 'hurt' && a < 0.6) return 0.3 * Math.exp(-a * 7)
  return 0
}

/** The jelly's deformation for this frame: everything the body does to its shape. */
interface Jelly {
  /** Squash spring (+ = wider), before the top's extra. */
  sq: number
  splat: number
  /** Top offset from the hop lag (+ = down). */
  lag: number
  lean: number
  crouch: number
  melt: number
}

function jellyOf(f: Frame): Jelly {
  return {
    sq: -f.squash * 0.03,
    splat: splatOf(f),
    lag: -f.hop * HOP_LAG,
    lean: f.pose.lean,
    crouch: f.pose.crouch,
    melt: smooth(clamp(f.pose.fall)),
  }
}

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
  return { x, y }
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

function metrics(_look: CreatureLook, f: Frame): BodyMetrics {
  const j = jellyOf(f)
  const corners = [
    { x: BOUNDS.l, y: BOUNDS.t },
    { x: BOUNDS.r, y: BOUNDS.t },
    { x: BOUNDS.l, y: 0 },
    { x: BOUNDS.r, y: 0 },
  ].map((p) => warp(j, p))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const head = warp(j, HEAD)
  return {
    headTop: warp(j, { x: 1, y: -TOP }).y,
    head: { x: head.x, y: head.y, rx: HEAD.rx, ry: HEAD.ry * (1 - 0.6 * j.melt) },
    socketF: warp(j, SOCKET),
    socketB: warp(j, { x: -SOCKET.x, y: SOCKET.y }),
    bodyBox: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    },
    upper: 8,
    fore: 8,
    armed: false,
    handR: 4.2,
  }
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/**
 * Floating-hand reactions on the mood pose: hands hover a little out from the sides and bob; up and waving on
 * cheer and pump, raised on cast; a lob throw cocked up over the shoulder (no room behind a blob), flung forward;
 * on KO they flop by the puddle.
 */
function pose(_look: CreatureLook, f: Frame): Pose {
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
function droplets(ctx: Ctx, look: CreatureLook, f: Frame): void {
  const a = f.moodAge
  if (!(f.mood === 'cheer' || f.mood === 'pump') || a >= 0.9) return
  ctx.save()
  ctx.globalAlpha = clamp(1.4 - a * 1.5)
  ctx.fillStyle = lightOf(look.main)
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
function belt(ctx: Ctx, j: Jelly, blob: Path2D): void {
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
  paint(ctx, { p: roundBox(-4, -4.5, 8, 9, 2), c: mix(BELT, '#c77d0a', 0.4), k: 0.4, inner: true, lw: 1.5 })
  paint(ctx, {
    p: roundBox(-4, -4.5, 8, 3.2, [2, 2, 0.6, 0.6]),
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

const roundBox = (x: number, y: number, w: number, h: number, r: number | number[]) => {
  const p = new Path2D()
  p.roundRect(x, y, w, h, r)
  return p
}

/** Determined brows, eyes that look around, and the open grin; xx on KO, squeezed on a flinch. */
function face(ctx: Ctx, f: Frame, t: number): void {
  const fy = -4
  const flip = f.fidget > 0 ? Math.sin(f.fidget * Math.PI) : 0
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
function bubbles(ctx: Ctx, look: CreatureLook, top: number, t: number): void {
  for (const [bx, r, ph] of [
    [17, 2.4, 0],
    [24, 1.7, 0.45],
    [12, 1.3, 0.75],
  ]) {
    const k = (t * 0.5 + ph) % 1
    const y = top + 6 - k * 22
    const x = bx + Math.sin(t * 4 + ph * 9) * 1.5
    const rr = r * (k > 0.9 ? 1 + (k - 0.9) * 8 : 1)
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

/** Signature: a coin pops out of the top, spins up and drops back in. */
function coinflip(ctx: Ctx, f: Frame, top: Pt): void {
  const k = f.fidget
  const y = top.y - 4 - 28 * 4 * k * (1 - k)
  const spin = Math.abs(Math.cos(k * Math.PI * 6))
  paint(ctx, { p: ell(top.x + 6, y, 3.6 * Math.max(0.15, spin), 3.6), c: GOLD, k: 0.3, lw: 1.4 })
  if (spin > 0.4) gloss(ctx, top.x + 6 - spin, y - 1.2, 0.9 * spin, 0.6)
}

function draw(ctx: Ctx, look: CreatureLook, f: Frame, k: DrawKit): void {
  const j = jellyOf(f)
  const t = f.still ? 0 : f.t
  const ko = f.mood === 'ko'
  // A dark flash on the hurt splat.
  const flash = f.mood === 'hurt' && f.moodAge < 0.25 ? 0.55 * (1 - f.moodAge / 0.25) : 0
  const main = flash ? mix(look.main, '#5a2a00', flash) : look.main

  // Floating hands: no arms, so the back one simply hovers behind the jelly.
  k.backHand()
  droplets(ctx, look, f)

  const blob = blobPath(j, t, f.still)
  group(ctx, [{ p: blob, c: main, k: 1.4 }])
  ctx.save()
  ctx.clip(blob)
  flecks(ctx, j, t)
  ctx.restore()
  belt(ctx, j, blob)
  k.emblem(warp(j, { x: 10, y: -17 }).x, warp(j, { x: 10, y: -17 }).y, 5)

  // Gloss on the upper left, wobbling with the dome.
  const g = (ph: number) => (f.still ? 0 : Math.sin(t * 3.4 + ph) * 0.6)
  const g1 = warp(j, { x: -12 + g(1), y: -36 + g(2) })
  const g2 = warp(j, { x: -18, y: -22 })
  gloss(ctx, g1.x, g1.y, 4, 2.4 * (1 - 0.6 * j.melt), -0.7)
  gloss(ctx, g2.x, g2.y, 1.6, 1.1, -0.7)

  ctx.save()
  ride(ctx, j, { x: FACE.x, y: FACE.y + (f.still ? 0 : Math.sin(t * 3.4 + 2.5) * 0.5) }, 0.55)
  face(ctx, f, t)
  ctx.restore()

  // The hat rides the top of the jelly, leaning with it (never wider than 1.15×); on a melt it tips back onto the puddle.
  const hc = warp(j, HAT)
  const hs = warp(j, { x: HAT.x + 1, y: HAT.y })
  ctx.save()
  ctx.translate(hc.x - 17 * j.melt, hc.y + 2 * j.melt)
  ctx.rotate(Math.atan(j.lean * 0.7) - 0.7 * j.melt)
  k.hat({ x: 0, y: 0, rx: HAT.rx * clamp(hs.x - hc.x, 0.85, 1.15), ry: HAT.ry })
  ctx.restore()

  const top = warp(j, { x: 1, y: -TOP })
  if (!ko) bubbles(ctx, look, top.y, t)
  if (f.fidget > 0) coinflip(ctx, f, top)
  if (happy(f)) ticks(ctx, 22, top.y - 4, f.moodAge)

  k.frontHand()
}

export const slime: BodyType = { metrics, draw, pose }
