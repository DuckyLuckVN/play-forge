/**
 * Robots: a box body on stubby legs, a head with a dark screen face (glowing eyes that glance around, a smile arc, a
 * drifting scanline), a chest light and a gold-buckle belt. Arms run from the shoulder sockets to the solved hands.
 * Each variant's head, screen, ear and chest come from `ROBOT_PARTS`:
 * - cube (Cubo): a steel box head with an ear dial and a pulsing chest light;
 * - bomb (Boomer): a round bomb head whose lit fuse sparks (flares on cheer, burns down on its signature, fizzles
 *   into smoke on KO) and a blinking red timer light;
 * - gear (Gizmo): a brass gear head that keeps turning (whirs on cheer and its signature, spins down on KO) and a
 *   pressure gauge.
 */
import type { Pose } from '../../hero-avatar'
import { drawArm } from '../hands'
import { TAU, flourish, sigOf } from '../motion'
import {
  OUTLINE,
  box,
  clamp,
  darkOf,
  easeOut,
  ell,
  gloss,
  group,
  happy,
  happyEye,
  look as wander,
  mix,
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

const GOLD = '#ffc531'
const SCREEN = '#14203d'
const NECK = '#7d8796'

/** Body geometry, local units (feet at 0, facing +x, up is −y). */
const HIP_Y = -9
const HEAD_Y = -39
const NECK_Y = -27
const SOCKET = { x: 12, y: -22 }
const HEAD: HeadBox = { x: 0.5, y: HEAD_Y, rx: 14.5, ry: 12 }
/** The hat sits on the head's top edge, its brim just above the screen. */
const HAT_BOX: HeadBox = { x: 0.5, y: HEAD_Y - 8.2, rx: 13.5, ry: 8 }
/** Boomer's fuse: from the cap on top of the bomb head, curling back (head frame). */
const FUSE = { x0: 0.5, y0: HEAD_Y - 16, cx: 1, cy: HEAD_Y - 24, x1: -6, y1: HEAD_Y - 24 }
const GEAR_TEETH = 10
const ARM_W = 4.6
const TORSO_W = 22
const TORSO_TOP = -25
const TORSO_BOTTOM = -8
/** KO: the body tips back around the heel by up to this angle. */
const FALL = 1.45
const FALL_PIVOT = -8

/** The body's frame transform (outer → upper body): KO tip, squash, crouch, lean. */
interface Xf {
  fall: number
  sq: number
  crouch: number
  lean: number
}

function xfOf(f: Frame): Xf {
  const hurt =
    !f.still && f.mood === 'hurt' && f.moodAge < 0.35 ? 0.1 * Math.sin((f.moodAge / 0.35) * Math.PI) : 0
  const bob = f.still ? 0 : 0.015 * Math.sin(f.t * 4)
  return {
    fall: -f.pose.fall * FALL,
    sq: (f.still ? 0 : -f.squash * 0.03) + hurt + bob,
    crouch: f.pose.crouch * 4,
    lean: f.pose.lean,
  }
}

const rot = (p: Pt, o: Pt, a: number): Pt => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const dx = p.x - o.x
  const dy = p.y - o.y
  return { x: o.x + dx * c - dy * s, y: o.y + dx * s + dy * c }
}

/** Maps a point from the upper-body frame to the outer frame (the same steps as `applyXf`, point-wise). */
function toOuter(x: Xf, p: Pt, upper = true): Pt {
  let q = upper ? rot(p, { x: 0, y: HIP_Y }, x.lean) : p
  if (upper) q = { x: q.x, y: q.y + x.crouch }
  q = { x: q.x * (1 + x.sq), y: q.y * (1 - x.sq) }
  return rot(q, { x: FALL_PIVOT, y: 0 }, x.fall)
}

function applyXf(ctx: Ctx, x: Xf, upper: boolean): void {
  ctx.translate(FALL_PIVOT, 0)
  ctx.rotate(x.fall)
  ctx.translate(-FALL_PIVOT, 0)
  ctx.scale(1 + x.sq, 1 - x.sq)
  if (!upper) return
  ctx.translate(0, x.crouch)
  ctx.translate(0, HIP_Y)
  ctx.rotate(x.lean)
  ctx.translate(0, -HIP_Y)
}

/** Head tilt on the neck: the pose's tilt plus a gentle sway (a happy wobble on cheer). */
const tiltOf = (f: Frame) =>
  f.pose.tilt + (f.still ? 0 : happy(f) ? Math.sin(f.t * 14) * 0.12 : Math.sin(f.t * 0.9) * 0.05)

type Variant = 'cube' | 'bomb' | 'gear'

/** Everything the head paints, in the head frame (it tilts on the neck). */
interface HeadPaint {
  look: CreatureLook
  f: Frame
  t: number
  hy: number
}

/** A robot variant: its head, screen, ear, chest light and the head's reach for the hand solver. */
interface Parts {
  /** The head shell, under the screen. */
  head(ctx: Ctx, p: HeadPaint): void
  /** The screen the face draws on (head frame). */
  screen(hy: number): Path2D
  /** Ear (or nothing) drawn over the shell, beside the screen. */
  ear?(ctx: Ctx, p: HeadPaint): void
  /** Chest light (upper-body frame). */
  chest(ctx: Ctx, f: Frame, t: number): void
  /** Clearance half-width for the hand solver (the head and what sticks out of it). */
  clearRx: number
  /** How far the head (and its cap) reaches above the head centre. */
  top: number
}

/** Cubo: the steel box head, with the ear stub on its back side. */
function cubeHead(ctx: Ctx, { look, hy }: HeadPaint): void {
  group(ctx, [
    { p: ell(-14, hy, 5, 6), c: look.second },
    { p: box(-14, hy - 12, 29, 24, 7), c: look.second, k: 1.1 },
  ])
}

/** Cubo's ear dial: its needle turns. */
function earDial(ctx: Ctx, { look, t, hy }: HeadPaint): void {
  paint(ctx, { p: ell(-14.5, hy, 2.6, 3.2), c: look.main, k: 0, lw: 1.2 })
  const da = t * 3
  ctx.strokeStyle = '#d8ecff'
  ctx.lineWidth = 1.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-14.5, hy)
  ctx.lineTo(-14.5 + Math.cos(da) * 2, hy + Math.sin(da) * 2.4)
  ctx.stroke()
}

/** Cubo's chest light: pulses, glows bright on cast. */
function chestLight(ctx: Ctx, f: Frame, t: number): void {
  const cast = f.mood === 'cast'
  const pulse = cast ? 1 : 0.5 + 0.5 * Math.sin(t * 3)
  ctx.save()
  ctx.shadowColor = '#7fe7ff'
  ctx.shadowBlur = cast ? 16 : 4 + 5 * pulse
  paint(ctx, {
    p: ell(-5.5, -19.5, cast ? 3 : 2.4, cast ? 3 : 2.4),
    c: mix('#7fd8ff', '#e6fbff', pulse),
    k: 0,
    lw: 1.3,
  })
  ctx.restore()
}

/** How far along the fuse the spark sits (0 tip .. 1 cap): it burns down on the signature, out on KO. */
const burnOf = (f: Frame) => 0.55 * sigOf(f)

/** A point on Boomer's fuse curve at `k` (0 = tip, 1 = cap). */
function fuseAt(k: number): { x: number; y: number } {
  const u = 1 - k
  const { x0, y0, cx, cy, x1, y1 } = FUSE
  return {
    x: (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1,
    y: (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1,
  }
}

/** Boomer: a round bomb head with a brass cap and a lit fuse that sparks (a big flare on cheer). */
function bombHead(ctx: Ctx, { look, f, t, hy }: HeadPaint): void {
  const burn = burnOf(f)
  const tip = fuseAt(burn)
  // The fuse: a rope from the cap, burnt short past the spark.
  ctx.lineCap = 'round'
  const rope = new Path2D()
  const n = 8
  rope.moveTo(FUSE.x0, FUSE.y0)
  for (let i = 1; i <= n; i++) {
    const q = fuseAt(1 - (1 - burn) * (i / n))
    rope.lineTo(q.x, q.y)
  }
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 4.6
  ctx.stroke(rope)
  ctx.strokeStyle = '#c9a26b'
  ctx.lineWidth = 2
  ctx.stroke(rope)
  group(ctx, [
    { p: box(-3.5, hy - 17, 8, 5.5, 1.5), c: '#e2b04a', k: 0.5 },
    { p: ell(0.5, hy, 14.5, 13), c: look.second, k: 1.2 },
  ])
  gloss(ctx, -6.5, hy - 7.5, 4, 2.2, -0.6)
  if (f.mood === 'ko') return
  // The spark: a flickering star, flaring on cheer and while it burns down.
  const fl = flourish(f)
  const flick = f.still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 31) * Math.sin(t * 17)
  const r = 2.4 + 1.4 * flick + 6 * fl.k * (fl.cheer ? 1 : 0.6) + 2 * sigOf(f)
  ctx.save()
  ctx.shadowColor = '#ffb43b'
  ctx.shadowBlur = 6 + 8 * fl.k
  ctx.fillStyle = '#ffe066'
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + (f.still ? 0 : t * 5)
    const rr = i % 2 ? r * 0.45 : r
    ctx.lineTo(tip.x + Math.cos(a) * rr, tip.y + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(tip.x, tip.y, 1.1 + 0.4 * flick, 0, TAU)
  ctx.fill()
  ctx.restore()
  // Flying sparks (more on the flare).
  if (f.still) return
  const count = 3 + Math.round(5 * fl.k)
  ctx.fillStyle = '#ffd43b'
  for (let i = 0; i < count; i++) {
    const k = (t * 2.2 + i / count) % 1
    const a = -Math.PI / 2 + (((i * 2.3) % 2.6) - 1.3)
    const d = 3 + k * (7 + 10 * fl.k)
    ctx.globalAlpha = 1 - k
    ctx.fillRect(tip.x + Math.cos(a) * d - 0.6, tip.y + Math.sin(a) * d - 0.6, 1.2, 1.2)
  }
  ctx.globalAlpha = 1
}

/** The gear's look repeats every half turn (10 teeth, 4 bolts), so whole extra half turns end where they began. */
const HALF = Math.PI
/** Steady turn speed (rad/s). */
const GEAR_SPEED = 0.6

/**
 * Gizmo's gear turn, always forward: a steady turn plus a whir of whole half turns on cheer (one turn), pump (half a
 * turn) and the signature (two turns), so nothing jumps back when the mood ends. On KO it whirs and spins down.
 */
export function gearTurn(f: Frame): number {
  if (f.still) return 0
  const a = f.moodAge
  if (f.mood === 'ko') {
    // From the steady angle where the KO began: a burst of speed that decays (4 half turns in all).
    return (f.t - a) * GEAR_SPEED + 4 * HALF * (1 - Math.exp(-a * 1.6))
  }
  const base = f.t * GEAR_SPEED
  const whir =
    f.mood === 'cheer' ? 2 * HALF * easeOut(a / 0.9) : f.mood === 'pump' ? HALF * easeOut(a / 0.4) : 0
  return base + whir + 4 * HALF * smooth(clamp(f.fidget))
}

/** Gizmo: a brass gear head that turns round its round screen. */
function gearHead(ctx: Ctx, { look, f, hy }: HeadPaint): void {
  const a0 = gearTurn(f)
  const cx = 0.5
  const p = new Path2D()
  const R = 14
  const T = 17.2
  for (let i = 0; i < GEAR_TEETH; i++) {
    const a = a0 + (i / GEAR_TEETH) * TAU
    const w = (TAU / GEAR_TEETH) * 0.22
    for (const [b, r] of [
      [a - w * 1.6, R],
      [a - w, T],
      [a + w, T],
      [a + w * 1.6, R],
    ])
      p.lineTo(cx + Math.cos(b) * r, hy + Math.sin(b) * r * 0.92)
  }
  p.closePath()
  group(ctx, [{ p, c: look.second, k: 1.1 }])
  // Bolts on the rim, turning with the gear.
  for (let i = 0; i < 4; i++) {
    const a = a0 + (i / 4) * TAU + 0.4
    paint(ctx, {
      p: ell(cx + Math.cos(a) * 12, hy + Math.sin(a) * 11, 1.2, 1.2),
      c: darkOf(look.second),
      k: 0,
      lw: 0,
    })
  }
}

/** Boomer's timer light: blinks red, faster on cast. */
function timerLight(ctx: Ctx, f: Frame, t: number): void {
  const on = f.still || Math.sin(t * (f.mood === 'cast' ? 16 : 5)) > 0
  paint(ctx, { p: box(-9, -22.5, 7.5, 5.5, 1.4), c: '#2b1b24', k: 0, lw: 1.3 })
  ctx.save()
  ctx.shadowColor = '#ff6b6b'
  ctx.shadowBlur = on ? 6 : 0
  paint(ctx, { p: ell(-5.25, -19.75, 1.6, 1.6), c: on ? '#ff8787' : '#7a2430', k: 0, lw: 0 })
  ctx.restore()
}

/** Gizmo's pressure gauge: the needle wobbles, pegs on cheer and cast. */
function gauge(ctx: Ctx, f: Frame, t: number): void {
  const hi = f.mood === 'cast' || happy(f) ? 1 : 0
  const a = -2.4 + 1.6 + hi * 1.2 + (f.still ? 0 : 0.25 * Math.sin(t * 2.3) + 0.1 * Math.sin(t * 13))
  paint(ctx, { p: ell(-5.5, -19.5, 3.4, 3.4), c: '#f8f9fa', k: 0.3, lw: 1.3 })
  ctx.strokeStyle = '#e03131'
  ctx.lineWidth = 1.1
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-5.5, -19.5)
  ctx.lineTo(-5.5 + Math.cos(a) * 2.6, -19.5 + Math.sin(a) * 2.6)
  ctx.stroke()
}

export const ROBOT_PARTS: Record<Variant, Parts> = {
  cube: {
    head: cubeHead,
    screen: (hy) => box(-10, hy - 9, 22, 17, 4.5),
    ear: earDial,
    chest: chestLight,
    clearRx: 16,
    top: 12,
  },
  bomb: {
    head: bombHead,
    screen: (hy) => box(-8.5, hy - 6.5, 19, 14, 6.5),
    chest: timerLight,
    clearRx: 15.5,
    top: 17,
  },
  gear: {
    head: gearHead,
    screen: (hy) => box(-10, hy - 9, 22, 17, 8.5),
    chest: gauge,
    clearRx: 17,
    top: 16,
  },
}
const partsOf = (look: CreatureLook): Parts =>
  ROBOT_PARTS[Object.hasOwn(ROBOT_PARTS, look.variant) ? (look.variant as Variant) : 'cube']

function metrics(look: CreatureLook, f: Frame): BodyMetrics {
  const parts = partsOf(look)
  const x = xfOf(f)
  // The head turns on its neck: the hands must clear it where it is drawn.
  const head = toOuter(x, rot(HEAD, { x: 0, y: NECK_Y }, tiltOf(f)))
  // The body box runs from the shoulders to the feet: the legs (drawn over the back hand) hide it too.
  const corners = [
    { x: -TORSO_W / 2, y: TORSO_TOP },
    { x: TORSO_W / 2, y: TORSO_TOP },
    { x: -TORSO_W / 2, y: 0 },
    { x: TORSO_W / 2, y: 0 },
  ].map((p) => toOuter(x, p))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  return {
    headTop: toOuter(x, { x: HEAD.x, y: HEAD.y - parts.top }).y,
    head: { x: head.x, y: head.y, rx: parts.clearRx, ry: HEAD.ry },
    socketF: toOuter(x, SOCKET),
    socketB: toOuter(x, { x: -SOCKET.x, y: SOCKET.y }),
    bodyBox: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    },
    upper: 6.5,
    fore: 6.5,
    armed: true,
    handR: 3.8,
  }
}

/** Moods whose back arm rests at the side (the front hand holds the ball or wrings). */
const REST = new Set<Frame['mood']>(['idle', 'watch', 'aim', 'worried'])
const REST_SB = -0.3
const REST_EB = 0.3

/** Both arms up and waving on cheer and pump, raised on cast, a gentle swing at rest; angles follow the tipped body. */
function pose(_look: CreatureLook, f: Frame): Pose {
  const p = { ...f.pose }
  const wave = (ph: number) => (f.still ? 0 : 0.3 * Math.sin(f.t * 16 + ph))
  if (f.mood === 'cheer' || f.mood === 'pump') {
    // A wide V, so the back arm shows beside the head.
    p.sF = 2.5 + wave(0)
    p.sB = -2.4 - wave(1)
    p.eF = 0.35 + wave(2)
    p.eB = 0.35 + wave(3)
  } else if (f.mood === 'cast') {
    p.sF = 2.3
    p.sB = -2.3
    p.eF = p.eB = 0.25
  } else if (REST.has(f.mood) && !(f.mood === 'idle' && p.sB < -1.2)) {
    // The free back arm rests at the side, swinging a little (an idle wave or stretch, which raise it, still play).
    const s = f.still ? 0 : 0.12 * Math.sin(f.t * 2)
    p.sB = REST_SB - s
    p.eB = REST_EB
    if (f.mood === 'idle' || f.mood === 'watch') p.sF += s
  }
  // Pose angles are relative to the torso; the arms are drawn in the outer frame.
  const turn = p.lean - p.fall * FALL
  p.sF += turn
  p.sB += turn
  return p
}

/** Eyes, mouth and screen effects by mood: red flash when hurt, static then black on KO. */
function screenFace(ctx: Ctx, look: CreatureLook, f: Frame, hy: number, scr: Path2D): void {
  const t = f.still ? 0 : f.t
  const hurt = f.mood === 'hurt' && f.moodAge < 0.2
  const ko = f.mood === 'ko'
  paint(ctx, { p: scr, c: hurt ? '#7a1020' : ko && f.moodAge >= 0.3 ? '#05070d' : SCREEN, k: 0, lw: 1.6 })
  ctx.save()
  ctx.clip(scr)
  if (ko) {
    if (f.moodAge < 0.3) {
      // Static: flickering grey bars.
      const seed = Math.floor(f.moodAge * 40)
      for (let i = 0; i < 6; i++) {
        const n = Math.abs(Math.sin(seed * 12.9898 + i * 78.233)) % 1
        ctx.fillStyle = `rgb(200 210 230 / ${0.25 + 0.5 * n})`
        ctx.fillRect(-10 + n * 8, hy - 9 + i * 3, 6 + n * 14, 1.6)
      }
    }
    ctx.restore()
    return
  }
  ctx.fillStyle = 'rgb(95 224 255 / 0.08)'
  ctx.fillRect(-11, hy - 9 + ((t * 9) % 18), 24, 2)
  ctx.restore()

  const glow = hurt ? '#ff6b6b' : look.eye
  ctx.save()
  ctx.shadowColor = glow
  ctx.shadowBlur = 7
  // Glance: the eyes slide across the screen (the signature move), else follow the look.
  const g = f.fidget > 0 ? Math.sin(f.fidget * Math.PI * 2) * 3 : 0
  const lx = g + f.lookX * 1.4 + (f.still ? 0 : wander(t, 1) * 0.6)
  const ly = f.lookY * 1.2
  const eyes = [-2, 6.5]
  ctx.fillStyle = glow
  ctx.strokeStyle = glow
  if (happy(f)) {
    for (const ex of eyes) happyEye(ctx, ex, hy - 1, 3.2, glow, 2.6)
  } else if (f.eyes === 'squeeze') {
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    for (const [ex, d] of [
      [eyes[0], 1],
      [eyes[1], -1],
    ]) {
      ctx.beginPath()
      ctx.moveTo(ex - 2.2 * d, hy - 4)
      ctx.lineTo(ex + 2.2 * d, hy - 1.5)
      ctx.lineTo(ex - 2.2 * d, hy + 1)
      ctx.stroke()
    }
  } else if (f.eyes === 'xx') {
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    for (const ex of eyes) {
      ctx.beginPath()
      ctx.moveTo(ex - 2, hy - 4)
      ctx.lineTo(ex + 2, hy)
      ctx.moveTo(ex + 2, hy - 4)
      ctx.lineTo(ex - 2, hy)
      ctx.stroke()
    }
  } else if (f.eyes === 'wide') {
    for (const ex of eyes) {
      ctx.beginPath()
      ctx.arc(ex + lx * 0.5, hy - 1.5 + ly * 0.5, 3.1, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (f.blink > 0 || f.pose.eyeOpen < 0.2) {
    for (const ex of eyes) ctx.fillRect(ex - 2.5 + lx, hy - 1, 5, 1.6)
  } else {
    const h = 7.5 * Math.max(0.3, f.pose.eyeOpen)
    for (const ex of eyes) {
      ctx.beginPath()
      ctx.roundRect(ex - 2.2 + lx, hy + 2.5 - h + ly, 4.4, h, 2.2)
      ctx.fill()
    }
  }
  // Mouth: an open "o", a frown, or the smile arc.
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.beginPath()
  const mx = 2.3 + lx * 0.5
  if (f.pose.mouthOpen > 0.45) ctx.ellipse(mx, hy + 4.2, 2.2, 1.2 + 1.6 * f.pose.mouthOpen, 0, 0, Math.PI * 2)
  else if (f.pose.smile < 0) ctx.arc(mx, hy + 6.5, 2.6, 1.2 * Math.PI, 1.8 * Math.PI)
  else ctx.arc(mx, hy + 2.5, happy(f) ? 3.8 : 2.6, 0.2 * Math.PI, 0.8 * Math.PI)
  ctx.stroke()
  ctx.restore()
}

/** Boomer's KO: the fuse fizzles out in grey smoke puffs that rise and fade (kit frame, so they rise straight up). */
function smoke(ctx: Ctx, f: Frame, at: Pt): void {
  if (f.mood !== 'ko' || f.still || f.moodAge > 2.4) return
  for (let i = 0; i < 4; i++) {
    const k = f.moodAge * 0.9 - i * 0.22
    if (k <= 0 || k >= 1.4) continue
    const r = 2 + k * 4
    ctx.fillStyle = `rgb(180 186 200 / ${0.6 * clamp(1.4 - k)})`
    ctx.beginPath()
    ctx.arc(at.x + Math.sin(k * 5 + i) * 3, at.y - 4 - k * 18, r, 0, TAU)
    ctx.fill()
  }
}

function draw(ctx: Ctx, look: CreatureLook, f: Frame, k: DrawKit): void {
  const parts = partsOf(look)
  const x = xfOf(f)
  const m = k.metrics
  const t = f.still ? 0 : f.t
  const steel = look.hand
  const body = look.main

  // Back arm and hand behind everything.
  drawArm(ctx, m.socketB, k.hands.back, ARM_W, mix(steel, '#1e2a5a', 0.25))
  k.backHand()

  // Legs: a little weight shift at rest.
  const step = f.still ? 0 : Math.sin(f.t * 2)
  ctx.save()
  applyXf(ctx, x, false)
  group(ctx, [
    { p: box(-10, -10 + Math.max(0, step) * 0.8, 7, 10, [2, 2, 3, 3]), c: darkOf(body) },
    { p: box(3, -10 + Math.max(0, -step) * 0.8, 7, 10, [2, 2, 3, 3]), c: body },
    { p: box(-12, -3, 10, 4.5, 2.2), c: steel, k: 0.6 },
    { p: box(2, -3, 10, 4.5, 2.2), c: steel, k: 0.6 },
  ])
  ctx.restore()

  ctx.save()
  applyXf(ctx, x, true)
  // Torso, belt with a gold buckle, the emblem and the variant's chest light.
  group(ctx, [{ p: box(-TORSO_W / 2, TORSO_TOP, TORSO_W, TORSO_BOTTOM - TORSO_TOP, 5), c: body }])
  paint(ctx, { p: box(-11, -12.5, 22, 3.4, 1), c: '#20325e', k: 0, inner: true })
  paint(ctx, { p: box(-2.6, -13.3, 5.2, 5, 1.2), c: GOLD, k: 0.4, inner: true })
  k.emblem(3, -19, 7)
  parts.chest(ctx, f, t)

  // Head on a neck joint: tilts, with the variant's shell, ear and the screen face.
  group(ctx, [{ p: box(-3.5, -29, 7, 5, 1.5), c: NECK, k: 0 }])
  const tilt = tiltOf(f)
  const hy = HEAD_Y
  const hp: HeadPaint = { look, f, t, hy }
  ctx.save()
  ctx.translate(0, NECK_Y)
  ctx.rotate(tilt)
  ctx.translate(0, -NECK_Y)
  parts.head(ctx, hp)
  parts.ear?.(ctx, hp)
  screenFace(ctx, look, f, hy, parts.screen(hy))
  gloss(ctx, -7, hy - 6.5, 2.4, 1.2, -0.4)
  k.hat(HAT_BOX)
  ctx.restore()
  if (happy(f)) ticks(ctx, 19, hy - 17, f.moodAge)
  ctx.restore()
  if (look.variant === 'bomb') smoke(ctx, f, toOuter(x, rot(fuseAt(0), { x: 0, y: NECK_Y }, tilt)))

  // Front arm and hand (with the held ball) in front.
  drawArm(ctx, m.socketF, k.hands.front, ARM_W, steel)
  k.frontHand()
}

export const robot: BodyType = { metrics, draw, pose }
