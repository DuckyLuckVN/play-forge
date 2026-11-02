/**
 * Cubo the robot: a blue box body on stubby legs, a steel head with a dark screen face
 * (glowing eyes that glance around, a smile arc, a drifting scanline), an ear dial,
 * a pulsing chest light and a gold-buckle belt. Arms run from the shoulder sockets to the solved hands.
 */
import type { Pose } from '../../hero-avatar'
import { drawArm } from '../hands'
import { box, darkOf, ell, gloss, group, happy, happyEye, look as wander, mix, paint, ticks } from '../paint'
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
/** Clearance half-width for the hand solver: the head plus its ear dial (out to x ≈ −19). */
const HEAD_CLEAR_RX = 16
/** The hat sits on the head's top edge, its brim just above the screen. */
const HAT_BOX: HeadBox = { x: 0.5, y: HEAD_Y - 8.2, rx: 13.5, ry: 8 }
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
  const hurt = f.mood === 'hurt' && f.moodAge < 0.35 ? 0.1 * Math.sin((f.moodAge / 0.35) * Math.PI) : 0
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

function metrics(_look: CreatureLook, f: Frame): BodyMetrics {
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
    headTop: toOuter(x, { x: HEAD.x, y: HEAD.y - HEAD.ry }).y,
    head: { x: head.x, y: head.y, rx: HEAD_CLEAR_RX, ry: HEAD.ry },
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
  } else if (!f.still && (f.mood === 'idle' || f.mood === 'watch')) {
    const s = 0.12 * Math.sin(f.t * 2)
    p.sF += s
    p.sB -= s
  }
  // Pose angles are relative to the torso; the arms are drawn in the outer frame.
  const turn = p.lean - p.fall * FALL
  p.sF += turn
  p.sB += turn
  return p
}

/** Eyes, mouth and screen effects by mood: red flash when hurt, static then black on KO. */
function screenFace(ctx: Ctx, look: CreatureLook, f: Frame, hy: number): void {
  const scr = box(-10, hy - 9, 22, 17, 4.5)
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

function draw(ctx: Ctx, look: CreatureLook, f: Frame, k: DrawKit): void {
  const x = xfOf(f)
  const m = k.metrics
  const t = f.still ? 0 : f.t
  const steel = look.second
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
  // Torso, belt with a gold buckle, the emblem and a chest light that pulses (glows bright on cast).
  group(ctx, [{ p: box(-TORSO_W / 2, TORSO_TOP, TORSO_W, TORSO_BOTTOM - TORSO_TOP, 5), c: body }])
  paint(ctx, { p: box(-11, -12.5, 22, 3.4, 1), c: '#20325e', k: 0, inner: true })
  paint(ctx, { p: box(-2.6, -13.3, 5.2, 5, 1.2), c: GOLD, k: 0.4, inner: true })
  k.emblem(3, -19, 7)
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

  // Head on a neck joint: tilts, with an ear dial and the screen face.
  group(ctx, [{ p: box(-3.5, -29, 7, 5, 1.5), c: NECK, k: 0 }])
  const tilt = tiltOf(f)
  const hy = HEAD_Y
  ctx.save()
  ctx.translate(0, NECK_Y)
  ctx.rotate(tilt)
  ctx.translate(0, -NECK_Y)
  group(ctx, [
    { p: ell(-14, hy, 5, 6), c: steel },
    { p: box(-14, hy - 12, 29, 24, 7), c: steel, k: 1.1 },
  ])
  paint(ctx, { p: ell(-14.5, hy, 2.6, 3.2), c: body, k: 0, lw: 1.2 })
  const da = t * 3
  ctx.strokeStyle = '#d8ecff'
  ctx.lineWidth = 1.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-14.5, hy)
  ctx.lineTo(-14.5 + Math.cos(da) * 2, hy + Math.sin(da) * 2.4)
  ctx.stroke()
  screenFace(ctx, look, f, hy)
  gloss(ctx, -7, hy - 6.5, 2.4, 1.2, -0.4)
  k.hat(HAT_BOX)
  ctx.restore()
  if (happy(f)) ticks(ctx, 19, hy - 17, f.moodAge)
  ctx.restore()

  // Front arm and hand (with the held ball) in front.
  drawArm(ctx, m.socketF, k.hands.front, ARM_W, steel)
  k.frontHand()
}

export const robot: BodyType = { metrics, draw, pose }
