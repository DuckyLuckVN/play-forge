/**
 * Cap'n Pinch the sky crab, seen from the front: a wide shell on six little legs, eyes on stalks, the tricorn perched
 * between them. The hands are claws (spec Hands #8): an arm from each side of the shell to
 * a claw whose pincers open by `open`; a carried ball sits between the pincers, the lower one under it and the upper
 * one drawn over it as the grip. Idle: it scuttles side to side (offsetX), legs tapping; it stops when it crouches to
 * aim. Signature 'snip': the far claw rises and snips. Cheer: both claws up clacking, a sideways dance and bubbles.
 * Hurt: the eyes duck down their stalks. KO: it flips onto its back, legs and claws in the air, the hat beside it.
 */
import type { Pose } from '../../hero-avatar'
import { type Mat, type Pt, along, apply, move, mul, scaleAbout, turnAbout } from '../affine'
import { drawArm } from '../hands'
import { TAU, boundsOf, ellPoints, flourish, pulse, sigOf, type Flourish } from '../motion'
import {
  OUTLINE,
  clamp,
  darkOf,
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
import type { BodyMetrics, BodyType, CreatureLook, DrawKit, Frame, HandPose, HeadBox } from '../types'

type Ctx = CanvasRenderingContext2D

/** Body geometry, local units (feet at 0, facing +x): the crab stands behind the ball, its shell left of the spot. */
const SHELL = { x: -7, y: -16, rx: 14, ry: 10.5 }
const STALKS: Array<{ base: Pt; top: Pt }> = [
  { base: { x: -13, y: -23 }, top: { x: -19, y: -35 } },
  { base: { x: -1, y: -23 }, top: { x: 5, y: -35 } },
]
const EYE_R = 4.2
/** The tricorn sits on the shell top between the stalks (shell frame). */
const HAT: HeadBox = { x: -7, y: -26, rx: 9, ry: 6 }
const SOCKET_F: Pt = { x: 6, y: -14 }
const SOCKET_B: Pt = { x: -20, y: -14 }
const UPPER = 7
const FORE = 11
const HAND_R = 4.6
const ARM_W = 4.4
/** Claw resting pose: out to the side, pincers up. */
const READY_S = 0.6
const READY_E = 2
/** Legs: root on the shell (shell frame) and foot tip on the floor, per side. */
const LEGS: Array<{ root: Pt; tip: Pt }> = [
  { root: { x: -1, y: -9 }, tip: { x: 8, y: 0 } },
  { root: { x: 2, y: -11 }, tip: { x: 13, y: 0 } },
  { root: { x: 4.5, y: -13 }, tip: { x: 18, y: 0 } },
].flatMap((l) => [
  l,
  { root: { x: 2 * SHELL.x - l.root.x, y: l.root.y }, tip: { x: 2 * SHELL.x - l.tip.x, y: 0 } },
])

interface Rig {
  /** Shell frame → kit. */
  shell: Mat
  ko: number
  flash: number
  /** Stalk length 0..1 (the eyes duck in when hurt, retract on KO). */
  stalk: number
  turn: number
}

function rigOf(f: Frame): Rig {
  const t = f.still ? 0 : f.t
  const c = smooth(clamp(f.pose.fall))
  const fl = flourish(f)
  let sq = f.still ? 0 : -f.squash * 0.03
  let flash = 0
  let duck = 0
  if (!f.still && f.mood === 'hurt' && f.moodAge < 0.6) {
    const k = Math.exp(-f.moodAge * 7)
    sq += 0.12 * k
    duck = clamp(1 - f.moodAge / 0.6)
    flash = clamp(1 - f.moodAge / 0.3) * 0.5
  }
  // Little dance hops on the cheer, a bounce on the pump.
  const hop = fl.cheer
    ? Math.abs(Math.sin(fl.age * 9)) * 3.5 * pulse(fl.age, 1.2)
    : fl.k > 0
      ? pulse(fl.age, 0.4) * 2
      : 0
  const breath = f.still ? 0 : Math.sin(t * 2.4) * 0.4
  const lean = f.pose.lean * 0.4
  const stand = mul(
    move(0, f.pose.crouch * 3 + breath - hop),
    mul(scaleAbout({ x: SHELL.x, y: 0 }, 1 + sq, 1 - sq), turnAbout({ x: SHELL.x, y: 0 }, lean)),
  )
  const flipped = mul(stand, turnAbout({ x: SHELL.x, y: SHELL.y }, Math.PI * c))
  // On its back: settle the shell onto the floor.
  const low = c ? Math.max(...ellPoints(flipped, SHELL).map((q) => q.y)) : 0
  return {
    shell: mul(move(0, -low * c), flipped),
    ko: c,
    flash,
    stalk: (1 - 0.65 * duck) * (1 - c),
    turn: lean + Math.PI * c,
  }
}

/** An eye's centre (shell frame) for this stalk length. */
const eyeAt = (i: number, stalk: number): Pt => {
  const s = STALKS[i]
  return { x: lerp(s.base.x, s.top.x, stalk), y: lerp(s.base.y, s.top.y, stalk) }
}

function metrics(_look: CreatureLook, f: Frame): BodyMetrics {
  const r = rigOf(f)
  const mid = { x: (eyeAt(0, r.stalk).x + eyeAt(1, r.stalk).x) / 2, y: eyeAt(0, r.stalk).y - 1 }
  const head = apply(r.shell, mid)
  const tops = [0, 1].map((i) => apply(r.shell, { x: eyeAt(i, r.stalk).x, y: eyeAt(i, r.stalk).y - EYE_R }).y)
  return {
    headTop: Math.min(...tops, apply(r.shell, { x: HAT.x, y: HAT.y - 11 }).y),
    head: { x: head.x, y: head.y, rx: 11, ry: 7.5 },
    socketF: apply(r.shell, SOCKET_F),
    socketB: apply(r.shell, SOCKET_B),
    bodyBox: boundsOf(ellPoints(r.shell, SHELL)),
    upper: UPPER,
    fore: FORE,
    armed: true,
    handR: HAND_R,
  }
}

/** Moods where the claws rest ready at the sides (the near one keeps the ball while holding). */
const READY = new Set<Frame['mood']>(['idle', 'watch', 'aim', 'worried', 'heal', 'sad'])

/**
 * Claw reactions on the mood pose: ready at the sides at rest, both up on cheer and cast, raised to guard on a flinch
 * or a fright, wide on a wow, the far claw up snipping on the signature; on KO the claws wave in the air.
 */
function pose(_look: CreatureLook, f: Frame): Pose {
  const r = rigOf(f)
  const p = { ...f.pose }
  const t = f.still ? 0 : f.t
  const wave = (ph: number) => (f.still ? 0 : 0.25 * Math.sin(t * 14 + ph))
  const both = (s: number, e: number) => {
    p.sF = s
    p.eF = e
    p.sB = -s
    p.eB = -e
  }
  if (f.mood === 'cheer' || f.mood === 'revive') {
    both(2.4, 0.5)
    p.sF += wave(0)
    p.sB -= wave(1.5)
  } else if (f.mood === 'cast') {
    both(2.6, 0.3)
  } else if ((f.mood === 'hurt' && f.moodAge < 0.35) || f.mood === 'scared') {
    both(1.9, 1)
  } else if (f.mood === 'wow') {
    both(1.9, 0.6)
  } else if (f.mood === 'pump') {
    p.sB = -READY_S
    p.eB = -READY_E
  } else if (READY.has(f.mood) || f.mood === 'hurt') {
    const droop = f.mood === 'sad' || f.mood === 'hurt' ? 0.4 : 0
    const sway = f.still ? 0 : 0.06 * Math.sin(t * 2.4 + 0.5)
    if (!(f.mood === 'idle' && p.sB < -1.2)) {
      p.sB = -READY_S + droop - sway
      p.eB = -READY_E + droop * 1.5
    }
    if (!f.holding) {
      p.sF = READY_S - droop + sway
      p.eF = READY_E - droop * 1.5
    }
  }
  if (f.mood === 'idle' && sigOf(f) > 0.05 && f.pose.fall < 0.02) {
    // The snip: the far claw goes up high.
    const k = sigOf(f)
    p.sB = lerp(p.sB, -2.5, k)
    p.eB = lerp(p.eB, -0.5, k)
  }
  p.sF += r.turn
  p.sB += r.turn
  const c = r.ko
  if (c > 0) {
    // Flipped: the near claw is now on the far side; both wave up in the air.
    p.sF = lerp(p.sF, -2.7 + wave(0), c)
    p.eF = lerp(p.eF, -0.4, c)
    p.sB = lerp(p.sB, 2.7 - wave(2), c)
    p.eB = lerp(p.eB, 0.4, c)
  }
  return p
}

/** Sideways scuttle at rest (stops as it crouches, gone when down), plus the cheer's side-to-side dance. */
function offsetX(_look: CreatureLook, f: Frame): number {
  if (f.still) return 0
  const calm = clamp(1 - 3 * Math.abs(f.pose.crouch)) * (1 - clamp(f.pose.fall))
  const fl = flourish(f)
  const dance = fl.cheer ? Math.sin(fl.age * 9) * 4 * pulse(fl.age, 1.2) : 0
  return 2.4 * Math.sin(f.t * 1.4) * calm + dance
}

/** How fast it scuttles now (0..1): the legs tap while it moves. */
function scuttling(f: Frame): number {
  if (f.still) return 0
  const calm = clamp(1 - 3 * Math.abs(f.pose.crouch)) * (1 - clamp(f.pose.fall))
  return Math.abs(Math.cos(f.t * 1.4)) * calm + (flourish(f).cheer ? 1 : 0)
}

/** Claw parts round the gap centre `h` (pincer half-gap `R`): palm behind, pincers either side of the gap. */
function clawParts(h: HandPose, R: number) {
  const dx = h.x - h.ex
  const dy = h.y - h.ey
  const l = Math.hypot(dx, dy)
  const d = l > 1e-6 ? { x: dx / l, y: dy / l } : { x: 1, y: 0 }
  // The upper side: up when the claw points forward.
  const n = { x: d.y, y: -d.x }
  const rot = Math.atan2(d.y, d.x)
  const w = HAND_R * 0.62
  const back = HAND_R * 1.9
  const palm = { x: h.x - d.x * back, y: h.y - d.y * back }
  // Each pincer runs from the palm's front to a little past the gap centre, curling in at the tip.
  const from = -back + HAND_R
  const to = R * 0.6 + 1
  const pincer = (side: 1 | -1, short: number) => {
    const off = R + w * 0.45
    const along = (from + to * short) / 2
    return ell(
      h.x + n.x * side * off + d.x * along,
      h.y + n.y * side * off + d.y * along,
      (to * short - from) / 2,
      w * 0.55,
      rot + side * 0.3,
    )
  }
  return { d, n, rot, palm, upper: pincer(1, 1), lower: pincer(-1, 0.8) }
}

/** The claw: palm and lower pincer, and the upper pincer unless a carried ball's grip draws it over the ball. */
function drawHand(ctx: Ctx, h: HandPose, look: CreatureLook, r: number): void {
  const R = h.grip ?? r * (0.3 + 0.7 * h.open)
  const c = clawParts(h, R)
  const parts = [
    { p: c.lower, c: look.hand, k: 0.5 },
    ...(h.grip === undefined ? [{ p: c.upper, c: look.hand, k: 0.5 }] : []),
    { p: ell(c.palm.x, c.palm.y, HAND_R * 1.1, HAND_R * 0.95, c.rot), c: look.hand, k: 0.7 },
  ]
  group(ctx, parts)
  gloss(ctx, c.palm.x - 1.2, c.palm.y - 1.5, 1.4, 0.8, -0.4)
}

/** The upper pincer over the carried ball's edge, so the ball reads as held between the pincers. */
function drawGrip(
  ctx: Ctx,
  h: HandPose,
  ball: { x: number; y: number; r: number },
  look: CreatureLook,
): void {
  const c = clawParts(
    { ...h, x: ball.x, y: ball.y, ex: ball.x - (h.x - h.ex), ey: ball.y - (h.y - h.ey) },
    ball.r,
  )
  group(ctx, [{ p: c.upper, c: look.hand, k: 0.5 }])
}

/** What a painter gets. */
interface Paint {
  look: CreatureLook
  f: Frame
  r: Rig
  t: number
  main: string
  fl: Flourish
  sig: number
}

/** Six little legs from under the shell, tapping as it scuttles (shell frame, behind the shell). */
function legs(ctx: Ctx, p: Paint): void {
  const { f, t, r } = p
  const go = scuttling(f)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  LEGS.forEach((l, i) => {
    const side = l.tip.x > SHELL.x ? 1 : -1
    // Up in the air when flipped: the legs wiggle.
    const lift =
      Math.max(0, Math.sin(t * 12 + i * 2.1)) * 2.2 * go + (f.still ? 0 : Math.sin(t * 16 + i) * 1.5 * r.ko)
    // Out and up to the knee, then down to the foot: a crab's Λ legs.
    const knee = { x: l.tip.x - side * 1.5, y: l.root.y - 5 - lift }
    const tip = { x: l.tip.x, y: l.tip.y - lift }
    const d = new Path2D(`M${l.root.x} ${l.root.y} L${knee.x} ${knee.y} L${tip.x} ${tip.y}`)
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 4.6
    ctx.stroke(d)
    ctx.strokeStyle = i % 2 ? darkOf(p.main) : p.main
    ctx.lineWidth = 2.2
    ctx.stroke(d)
  })
  ctx.restore()
}

/** The shell (shell frame): underside plate, spots, gloss, the mouth and the emblem. */
function shell(ctx: Ctx, p: Paint, k: DrawKit): void {
  const { look, f } = p
  const s = ell(SHELL.x, SHELL.y, SHELL.rx, SHELL.ry)
  group(ctx, [{ p: s, c: p.main, k: 1.1 }])
  ctx.save()
  ctx.clip(s)
  paint(ctx, { p: ell(SHELL.x, SHELL.y + 9, 12, 5.5), c: look.second, k: 0, lw: 1.2 })
  for (const [x, y, rr] of [
    [-14, -21, 1.8],
    [-9, -24, 1.4],
    [1, -22, 1.6],
  ])
    paint(ctx, { p: ell(x, y, rr, rr * 0.8), c: lightOf(p.main), k: 0, lw: 0 })
  ctx.restore()
  gloss(ctx, SHELL.x - 7, SHELL.y - 5, 3, 1.4, -0.3)
  k.emblem(SHELL.x - 6.5, SHELL.y + 7, 5)
  // Mouth (follows the look a little).
  const x = SHELL.x + 3 + f.lookX * 0.8
  const y = SHELL.y + 1
  if (happy(f)) openMouth(ctx, x, y, 2.6, 3)
  else {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    if (f.mood === 'ko' || f.pose.mouthOpen > 0.45)
      ctx.ellipse(x, y + 1.2, 1.5, 1 + f.pose.mouthOpen, 0, 0, TAU)
    else if (f.pose.smile < 0) ctx.arc(x, y + 3, 2.2, 1.2 * Math.PI, 1.8 * Math.PI)
    else ctx.arc(x, y - 0.5, 2.2, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgb(255 130 150 / 0.5)'
  ctx.beginPath()
  ctx.ellipse(x - 6, y - 1, 2, 1.2, 0, 0, TAU)
  ctx.ellipse(x + 6, y - 1, 2, 1.2, 0, 0, TAU)
  ctx.fill()
}

/** Eyes on the stalk tips (shell frame, over the hat): white eyes with pupils, looking about. */
/** An eye's drawn centre (shell frame): on its stalk, swaying. */
function eyeSway(p: Paint, i: number): Pt {
  const e = eyeAt(i, p.r.stalk)
  const sway = p.f.still ? 0 : Math.sin(p.t * 2.4) * 0.6
  return { x: e.x + sway * (i ? 1 : -1) * p.r.stalk, y: e.y }
}

/** The eye stalks (shell frame, behind the hat). */
function stalks(ctx: Ctx, p: Paint): void {
  ctx.lineCap = 'round'
  for (const i of [0, 1]) {
    const e = eyeSway(p, i)
    const s = STALKS[i]
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(s.base.x, s.base.y)
    ctx.lineTo(e.x, e.y)
    ctx.stroke()
    ctx.strokeStyle = p.main
    ctx.lineWidth = 2.4
    ctx.stroke()
  }
}

function eyes(ctx: Ctx, p: Paint): void {
  const { f, r, t } = p
  const lx = f.lookX * 1.1 + (f.still ? 0 : wander(t, 7) * 0.6)
  const ly = f.lookY * 1
  for (const i of [0, 1]) {
    const { x: ex, y } = eyeSway(p, i)
    const e = { x: ex, y }
    group(ctx, [{ p: ell(ex, e.y, EYE_R, EYE_R), c: '#ffffff', k: 0.4 }])
    ctx.strokeStyle = OUTLINE
    ctx.fillStyle = OUTLINE
    ctx.lineCap = 'round'
    if (happy(f)) happyEye(ctx, ex, e.y, 2.4)
    else if (f.eyes === 'xx') {
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(ex - 2, e.y - 2)
      ctx.lineTo(ex + 2, e.y + 2)
      ctx.moveTo(ex + 2, e.y - 2)
      ctx.lineTo(ex - 2, e.y + 2)
      ctx.stroke()
    } else if (f.eyes === 'squeeze' || f.blink > 0 || f.pose.eyeOpen < 0.2) {
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(ex - 2.4, e.y)
      ctx.lineTo(ex + 2.4, e.y)
      ctx.stroke()
    } else {
      const wide = f.eyes === 'wide' ? 0.7 : 1
      ctx.beginPath()
      ctx.arc(ex + lx, e.y + ly, 2 * wide, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(ex + lx - 0.7, e.y + ly - 0.8, 0.75, 0, TAU)
      ctx.fill()
    }
  }
  // Worried or angry brows over the eyes.
  if (f.eyes !== 'xx' && (Math.abs(f.pose.brow) > 0.3 || f.pose.browUp > 0.5)) {
    const up = f.pose.browUp * 1.2
    const knit = f.pose.brow * 1.4
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.7
    ctx.beginPath()
    for (const [i, side] of [
      [0, 1],
      [1, -1],
    ]) {
      const e = eyeAt(i, r.stalk)
      ctx.moveTo(e.x - 3 * side, e.y - EYE_R - 2 - up)
      ctx.lineTo(e.x + 2.5 * side, e.y - EYE_R - 2 - up + knit)
    }
    ctx.stroke()
  }
}

/** Bubbles on the cheer and pump, and snip lines at the far claw on the signature (kit frame). */
function effects(ctx: Ctx, p: Paint, k: DrawKit): void {
  const { f, fl, t, r } = p
  if (f.still) return
  if (fl.k > 0.05) {
    const mouth = apply(r.shell, { x: SHELL.x + 3, y: SHELL.y })
    for (let i = 0; i < (fl.cheer ? 4 : 2); i++) {
      const q = (fl.age * 0.9 + i * 0.27) % 1
      const x = mouth.x + Math.sin(t * 5 + i * 2) * 3 + (i - 1.5) * 3
      const y = mouth.y - 4 - q * 26
      ctx.globalAlpha = (1 - q) * Math.min(1, fl.k * 2)
      paint(ctx, { p: ell(x, y, 1.6 + i * 0.4, 1.6 + i * 0.4), c: '#d0ebff', k: 0, lw: 1.1 })
      gloss(ctx, x - 0.5, y - 0.6, 0.6, 0.4)
    }
    ctx.globalAlpha = 1
  }
  if (p.sig > 0.3 && f.mood === 'idle') {
    // Snip! lines out of the far claw's tip as it shuts.
    const h = k.hands.back
    const shut = 1 - Math.abs(Math.sin(t * 18))
    if (shut > 0.6) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.8
      ctx.lineCap = 'round'
      ctx.beginPath()
      for (const a of [-0.9, -0.3, 0.3]) {
        const dir = Math.atan2(h.y - h.ey, h.x - h.ex) + a
        ctx.moveTo(h.x + Math.cos(dir) * 5, h.y + Math.sin(dir) * 5)
        ctx.lineTo(h.x + Math.cos(dir) * 8, h.y + Math.sin(dir) * 8)
      }
      ctx.stroke()
    }
  }
}

function draw(ctx: Ctx, look: CreatureLook, f: Frame, k: DrawKit): void {
  const r = rigOf(f)
  const m = k.metrics
  const t = f.still ? 0 : f.t
  const main = r.flash ? mix(look.main, '#3a1f2e', r.flash) : look.main
  const p: Paint = { look, f, r, t, main, fl: flourish(f), sig: sigOf(f) }
  // Claws clack on the cheer (both) and the snip (the far one): the kit draws its hands with this `open`.
  const clack = f.still ? 0 : Math.abs(Math.sin(t * 16))
  const snip = f.mood === 'idle' ? p.sig * Math.abs(Math.sin(t * 18)) : 0
  const cheer = p.fl.cheer ? clack * Math.min(1, p.fl.k * 3) : 0
  k.hands.back = { ...k.hands.back, open: Math.max(k.hands.back.open, cheer, snip) }
  k.hands.front = { ...k.hands.front, open: Math.max(k.hands.front.open, cheer) }

  const claw = (socket: Pt, h: HandPose, c: string) => {
    const palm = clawParts(h, 0).palm
    drawArm(ctx, socket, { ...h, x: palm.x, y: palm.y }, ARM_W, c)
  }
  claw(m.socketB, k.hands.back, darkOf(main))
  k.backHand()
  ctx.save()
  along(ctx, r.shell)
  legs(ctx, p)
  shell(ctx, p, k)
  stalks(ctx, p)
  if (r.ko < 0.5) k.hat(HAT)
  eyes(ctx, p)
  ctx.restore()
  // Flipped over, the hat has tumbled off beside it.
  if (r.ko >= 0.5) k.hat({ x: SHELL.x + 26, y: -3, rx: HAT.rx, ry: HAT.ry })
  claw(m.socketF, k.hands.front, main)
  k.frontHand()
  effects(ctx, p, k)
  if (happy(f)) ticks(ctx, m.head.x + 14, m.headTop - 2, f.moodAge)
}

export const crab: BodyType = { metrics, draw, drawHand, drawGrip, pose, offsetX }
