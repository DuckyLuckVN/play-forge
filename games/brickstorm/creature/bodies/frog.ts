/**
 * Master Ribbit the combo frog: a plump sitting frog with bulging eye domes, a wide grin and a throat sac that pulses,
 * a saffron monk's sash and prayer beads. The front legs are the arms (spec Hands #7), running from the chest to webbed
 * hands at the solved points; at rest the free one is planted on the ground, as a sitting frog's are. Cheer: a big hop
 * (squat, stretch in the air, legs trailing, a squash on landing) with a tongue flick at the top. Pump: a little hop.
 * Signature 'fly': a fly buzzes by, the tongue snaps it up, gulp. Hurt: a squish. KO: it splats flat.
 */
import type { Pose } from '../../hero-avatar'
import { type Mat, type Pt, along, apply, move, mul, scaleAbout, turnAbout } from '../affine'
import { drawArm } from '../hands'
import { TAU, boundsOf, ellPoints, flourish, limbTo, pulse, type Flourish } from '../motion'
import {
  OUTLINE,
  clamp,
  darkOf,
  easeOut,
  ell,
  gloss,
  group,
  happy,
  happyEye,
  lerp,
  look as wander,
  mix,
  openMouth,
  paint,
  smooth,
  ticks,
} from '../paint'
import type { BodyMetrics, BodyType, CreatureLook, DrawKit, Frame, HandPose, HeadBox } from '../types'

type Ctx = CanvasRenderingContext2D

const PINK = '#ff6b8a'
const SASH = '#ffa94d'
const BEAD = '#8d5524'

/** Body geometry, local units (feet at 0, facing +x, up is −y). */
const BODY = { x: -1, y: -17, rx: 13.5, ry: 12.5 }
const HEAD = { x: 2, y: -29.5, rx: 15, ry: 10 }
/** Eye domes on top of the head (head frame): [x, y, r]. */
const DOMES: Array<[number, number, number]> = [
  [-6.5, -8.5, 5],
  [6, -8.5, 5.4],
]
const HAT: HeadBox = { x: 0, y: -9, rx: 11, ry: 7 }
/** The mouth's front corner (head frame), where the tongue comes out. */
const MOUTH: Pt = { x: 13, y: 2.5 }
const THROAT = { x: 6.5, y: 8.5, rx: 5.5, ry: 3.2 }
const SOCKET_F: Pt = { x: 8, y: -16 }
const SOCKET_B: Pt = { x: -5, y: -16.5 }
const LIMB = 7
const HAND_R = 3.8
const LEG_W = 5
/** Back legs (body frame): thigh and webbed foot, far then near. */
const THIGHS = [
  { x: -9, y: -7, rx: 7.5, ry: 6.5, foot: { x: -14, y: -1.6 } },
  { x: 5, y: -6, rx: 8, ry: 6, foot: { x: 11, y: -1.6 } },
]

/** The hop on cheer and pump: lift, squash/stretch and how far the legs trail (0..1). */
function hopOf(fl: Flourish): { lift: number; sq: number; ext: number } {
  const a = fl.age
  if (fl.cheer) {
    const squat = pulse(a, 0.12)
    const u = (a - 0.12) / 0.5
    const air = u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0
    const land = pulse(a - 0.62, 0.23)
    return { lift: air * 20, sq: 0.12 * squat - 0.1 * air + 0.16 * land, ext: air }
  }
  if (fl.k > 0) {
    const air = pulse(a - 0.05, 0.3)
    return { lift: air * 5, sq: 0.06 * pulse(a, 0.08) - 0.04 * air, ext: air * 0.4 }
  }
  return { lift: 0, sq: 0, ext: 0 }
}

/** The fly signature's progress 0..1 (idle only; 0 when still or not playing). */
const flyOf = (f: Frame) => (f.still || f.mood !== 'idle' || f.pose.fall >= 0.02 ? 0 : clamp(f.fidget))

interface Rig {
  body: Mat
  head: Mat
  ko: number
  flash: number
  /** Legs trailing in the air 0..1. */
  ext: number
  /** Throat sac swell. */
  throat: number
}

function rigOf(f: Frame): Rig {
  const t = f.still ? 0 : f.t
  const c = smooth(clamp(f.pose.fall))
  const fl = flourish(f)
  const hop = hopOf(fl)
  let sq = (f.still ? 0 : -f.squash * 0.03) + hop.sq
  let flash = 0
  if (!f.still && f.mood === 'hurt' && f.moodAge < 0.5) {
    sq += 0.18 * Math.exp(-f.moodAge * 8)
    flash = clamp(1 - f.moodAge / 0.3) * 0.5
  }
  const breath = f.still ? 0 : Math.sin(t * 2.2) * 0.4
  const stand = mul(
    move(0, f.pose.crouch * 3 + breath - hop.lift),
    mul(scaleAbout({ x: 0, y: 0 }, 1 + sq, 1 - sq), turnAbout({ x: 0, y: -4 }, f.pose.lean * 0.6)),
  )
  // KO: a flat splat.
  const body = mul(scaleAbout({ x: 0, y: 0 }, 1 + 0.45 * c, 1 - 0.55 * c), stand)
  const lag = f.still ? 0 : Math.sin(t * 2.2 - 0.8) * 0.35
  const tilt =
    f.pose.tilt * 0.6 + (f.still ? 0 : happy(f) ? Math.sin(t * 11) * 0.05 : Math.sin(t * 0.9) * 0.025)
  const head = mul(body, mul(move(HEAD.x, HEAD.y + lag), turnAbout({ x: 0, y: 0 }, tilt)))
  // The throat pulses (faster when happy); a big gulp at the end of the fly catch.
  const q = flyOf(f)
  const beat = f.still ? 0 : (0.5 + 0.5 * Math.sin(t * (happy(f) ? 9 : 3.2))) ** 2
  const gulp = q > 0.8 ? Math.sin(((q - 0.8) / 0.2) * Math.PI) : 0
  return { body, head, ko: c, flash, ext: hop.ext, throat: beat * 0.35 + gulp * 0.9 }
}

function metrics(_look: CreatureLook, f: Frame): BodyMetrics {
  return metricsOf(rigOf(f))
}

/** Metrics from an already built rig (pose() needs both). */
function metricsOf(r: Rig): BodyMetrics {
  const head = apply(r.head, { x: 0, y: 0 })
  const top = Math.min(...DOMES.map(([x, y, rr]) => apply(r.head, { x, y: y - rr }).y))
  return {
    headTop: top,
    head: { x: head.x, y: head.y, rx: 13.5, ry: 10 },
    socketF: apply(r.body, SOCKET_F),
    socketB: apply(r.body, SOCKET_B),
    bodyBox: boundsOf(ellPoints(r.body, BODY)),
    upper: LIMB,
    fore: LIMB,
    armed: true,
    handR: HAND_R,
  }
}

/** Moods in which a free front leg is planted on the ground. */
const PLANT = new Set<Frame['mood']>(['idle', 'watch', 'aim', 'worried', 'pump', 'sad'])

/**
 * Front-leg reactions on the mood pose: the free leg planted on the ground (both without the ball), both up and out on
 * cheer, raised on cast; on KO they splay out flat along the floor.
 */
function pose(_look: CreatureLook, f: Frame): Pose {
  const r = rigOf(f)
  const m = metricsOf(r)
  const p = { ...f.pose }
  const t = f.still ? 0 : f.t
  const wave = (ph: number) => (f.still ? 0 : 0.25 * Math.sin(t * 15 + ph))
  const plant = (socket: Pt, dx: number) => limbTo(socket, { x: socket.x + dx, y: -HAND_R }, LIMB, LIMB)
  p.sF += f.pose.lean * 0.6
  p.sB += f.pose.lean * 0.6
  if (f.mood === 'cheer' || f.mood === 'revive') {
    p.sF = 2.2 + wave(0)
    p.eF = 0.4 + wave(2)
    p.sB = -2.2 - wave(1)
    p.eB = -0.4 - wave(3)
  } else if (f.mood === 'cast') {
    p.sF = 2.3
    p.eF = 0.3
    p.sB = -2.3
    p.eB = -0.3
  } else if (PLANT.has(f.mood) && !(f.mood === 'idle' && p.sB < -1.2)) {
    // The far leg plants beside the far thigh, where it shows under the belly.
    const b = plant(m.socketB, -2)
    p.sB = b.s
    p.eB = b.e
    if (!f.holding && f.mood !== 'pump') {
      const a = plant(m.socketF, 3)
      p.sF = a.s
      p.eF = a.e
    }
  }
  const c = r.ko
  if (c > 0) {
    const a = plant(m.socketF, 10)
    const b = plant(m.socketB, -10)
    p.sF = lerp(p.sF, a.s, c)
    p.eF = lerp(p.eF, a.e, c)
    p.sB = lerp(p.sB, b.s, c)
    p.eB = lerp(p.eB, b.e, c)
  }
  return p
}

/** What a painter gets. */
interface Paint {
  look: CreatureLook
  f: Frame
  r: Rig
  t: number
  main: string
  fl: Flourish
}

/** A back leg (body frame): thigh and webbed foot; in the air the foot trails down and the thigh stretches. */
function backLeg(ctx: Ctx, p: Paint, i: number): void {
  const th = THIGHS[i]
  const ext = p.r.ext
  const c = i ? p.main : darkOf(p.main)
  const fx = th.foot.x + (i ? 2 : -2) * ext
  const fy = th.foot.y + 7 * ext
  const toes = new Path2D()
  for (const a of [-0.5, 0, 0.5]) {
    const x = fx + Math.cos(a) * 5 * (i ? 1 : -1)
    toes.ellipse(x, fy + Math.sin(a) * 1.6, 1.8, 1.4, 0, 0, TAU)
  }
  group(ctx, [
    { p: toes, c: p.look.hand, k: 0.4 },
    { p: ell(fx, fy, 5.5, 2.4), c: p.look.hand, k: 0.5 },
    { p: ell(th.x, th.y + 2 * ext, th.rx, th.ry * (1 + 0.25 * ext), 0.2 * (i ? 1 : -1)), c },
  ])
  if (i) gloss(ctx, th.x - 2.5, th.y - 3, 2, 1, -0.4)
}

/** Body (body frame): belly, back spots, the saffron sash with the emblem, the prayer beads. */
function body(ctx: Ctx, p: Paint, k: DrawKit): void {
  const { look } = p
  const shape = ell(BODY.x, BODY.y, BODY.rx, BODY.ry)
  group(ctx, [{ p: shape, c: p.main }])
  ctx.save()
  ctx.clip(shape)
  paint(ctx, { p: ell(BODY.x + 5, BODY.y + 3, 9, 9.5), c: look.second, k: 0, lw: 0 })
  for (const [x, y, rr] of [
    [-11, -20, 1.8],
    [-8, -13, 1.4],
    [-12, -9, 1.2],
  ])
    paint(ctx, { p: ell(x, y, rr, rr * 0.85), c: darkOf(p.main), k: 0, lw: 0 })
  // The sash, from the near shoulder down across the belly.
  paint(ctx, {
    p: new Path2D('M-16 -24 L-10 -28 L16 -6 L10 -2 Z'),
    c: SASH,
    k: 0.4,
    lw: 1.4,
  })
  ctx.restore()
  gloss(ctx, BODY.x - 6, BODY.y - 6, 2.6, 1.3, -0.4)
  k.emblem(3.5, -13.5, 6)
  // Prayer beads round the neck, one big bead at the front.
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (0.15 + 0.7 * (i / 8))
    const x = BODY.x + Math.cos(Math.PI - a) * 11
    const y = -21.5 + Math.sin(a) * 3
    const big = i === 6
    paint(ctx, { p: ell(x, y, big ? 1.9 : 1.3, big ? 1.9 : 1.3), c: big ? '#c08040' : BEAD, k: 0, lw: 0.9 })
  }
}

/** Eyes in the domes (head frame): white with a dark pupil, ^ ^ happy, xx, squeezed, blinking. */
function eyes(ctx: Ctx, p: Paint, at: Pt | null): void {
  const { f, t, look } = p
  const lx = at ? at.x : f.lookX * 1 + (f.still ? 0 : wander(t, 9) * 0.6)
  const ly = at ? at.y : f.lookY * 0.9
  for (const [x, y, rr] of DOMES) {
    const R = rr * 0.72
    paint(ctx, { p: ell(x + 0.5, y, R, R), c: '#ffffff', k: 0, lw: 1.3 })
    ctx.strokeStyle = OUTLINE
    ctx.fillStyle = OUTLINE
    ctx.lineCap = 'round'
    if (happy(f) || (flyOf(f) > 0.8 && !at)) {
      happyEye(ctx, x + 0.5, y + 0.5, 2.4)
    } else if (f.eyes === 'xx') {
      ctx.lineWidth = 1.8
      ctx.beginPath()
      ctx.moveTo(x - 1.6, y - 1.6)
      ctx.lineTo(x + 2.6, y + 1.6)
      ctx.moveTo(x + 2.6, y - 1.6)
      ctx.lineTo(x - 1.6, y + 1.6)
      ctx.stroke()
    } else if (f.eyes === 'squeeze' || f.blink > 0 || f.pose.eyeOpen < 0.2) {
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 2.4, y + 0.5)
      ctx.lineTo(x + 3, y + 0.5)
      ctx.stroke()
    } else {
      const wide = f.eyes === 'wide' ? 0.7 : 1
      const px = x + 0.5 + clamp(lx, -1, 1) * 1.2
      const py = y + clamp(ly, -1, 1) * 1
      ctx.fillStyle = look.eye
      ctx.beginPath()
      ctx.ellipse(px, py, 2.1 * wide, 1.6 * wide, 0, 0, TAU)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(px - 0.7, py - 0.6, 0.7, 0, TAU)
      ctx.fill()
      // Sleepy or sad: a lid over the top.
      if (f.pose.eyeOpen < 0.9) {
        ctx.save()
        ctx.clip(ell(x + 0.5, y, R, R))
        ctx.fillStyle = p.main
        ctx.fillRect(x - R, y - R, R * 2.2, (1 - f.pose.eyeOpen) * R * 2)
        ctx.restore()
      }
    }
  }
  if (f.eyes !== 'xx' && (Math.abs(f.pose.brow) > 0.3 || f.pose.browUp > 0.5)) {
    const up = f.pose.browUp * 1.2
    const knit = f.pose.brow * 1.3
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.7
    ctx.beginPath()
    ctx.moveTo(DOMES[0][0] - 3, -15 - up)
    ctx.lineTo(DOMES[0][0] + 2.5, -15 - up + knit)
    ctx.moveTo(DOMES[1][0] + 3.5, -15.5 - up)
    ctx.lineTo(DOMES[1][0] - 2, -15.5 - up + knit)
    ctx.stroke()
  }
}

/** The wide grin, open and laughing when happy, wobbly on KO, a frown when sad (head frame). */
function mouth(ctx: Ctx, p: Paint, tongueOut: boolean): void {
  const { f } = p
  if (happy(f) || tongueOut) {
    openMouth(ctx, 6, 2, 6.5, tongueOut ? 3.5 : 4.5)
  } else {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.7
    ctx.lineCap = 'round'
    ctx.beginPath()
    if (f.mood === 'ko') {
      ctx.moveTo(-2, 3.5)
      ctx.quadraticCurveTo(2, 1.5, 6, 3.5)
      ctx.quadraticCurveTo(10, 5.5, 13, 3)
    } else if (f.pose.smile < 0) {
      ctx.moveTo(-1, 5)
      ctx.quadraticCurveTo(6, 1, 13, 4)
    } else {
      ctx.moveTo(-3, 2.5)
      ctx.quadraticCurveTo(5, 7.5 + f.pose.smile * 1.5, MOUTH.x + 0.5, MOUTH.y - 0.5)
    }
    ctx.stroke()
  }
  ctx.fillStyle = 'rgb(255 130 150 / 0.5)'
  ctx.beginPath()
  ctx.ellipse(-6, 2.5, 2.2, 1.3, 0, 0, TAU)
  ctx.ellipse(10.5, -1, 2.2, 1.3, 0, 0, TAU)
  ctx.fill()
}

/** The head (head frame): eye domes and head under one outline, eyes, nostrils, mouth, hat. */
function head(ctx: Ctx, p: Paint, k: DrawKit, lookAt: Pt | null, tongueOut: boolean): void {
  group(ctx, [
    ...DOMES.map(([x, y, rr], i) => ({ p: ell(x, y, rr, rr), c: i ? p.main : darkOf(p.main), k: 0.8 })),
    { p: ell(0, 0, HEAD.rx, HEAD.ry), c: p.main, k: 1 },
  ])
  // Re-fill the near dome over the head's edge so it reads as bulging on top.
  paint(ctx, { p: ell(DOMES[1][0], DOMES[1][1], DOMES[1][2], DOMES[1][2]), c: p.main, k: 0.8, lw: 0 })
  gloss(ctx, -7, -3, 2.6, 1.3, -0.5)
  eyes(ctx, p, lookAt)
  ctx.fillStyle = OUTLINE
  ctx.beginPath()
  ctx.ellipse(12.5, -2.5, 0.7, 0.5, 0.3, 0, TAU)
  ctx.ellipse(10, -2.8, 0.7, 0.5, 0.3, 0, TAU)
  ctx.fill()
  mouth(ctx, p, tongueOut)
  k.hat(HAT)
}

/** The throat sac under the chin (head frame), swelling with the pulse and the gulp. */
function throat(ctx: Ctx, p: Paint): void {
  const s = 1 + p.r.throat
  paint(ctx, {
    p: ell(THROAT.x, THROAT.y + (s - 1) * 1.5, THROAT.rx * s, THROAT.ry * s),
    c: mix(p.look.second, PINK, 0.15),
    k: 0.4,
    lw: 1.4,
  })
}

/** The tongue (kit frame): a pink rope from the mouth to `tip`, with a round sticky end. */
function tongue(ctx: Ctx, from: Pt, tip: Pt): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(tip.x, tip.y)
  ctx.stroke()
  ctx.strokeStyle = PINK
  ctx.lineWidth = 2.6
  ctx.stroke()
  ctx.restore()
  paint(ctx, { p: ell(tip.x, tip.y, 2.4, 2.1), c: PINK, k: 0.4, lw: 1.4 })
}

/** A little fly: body and two blurred wings (kit frame). */
function fly(ctx: Ctx, x: number, y: number, t: number): void {
  ctx.fillStyle = 'rgb(255 255 255 / 0.75)'
  ctx.beginPath()
  const flap = Math.sin(t * 60) * 0.5
  ctx.ellipse(x - 1, y - 2, 1.8, 1, -0.6 + flap, 0, TAU)
  ctx.ellipse(x + 1, y - 2, 1.8, 1, 0.6 - flap, 0, TAU)
  ctx.fill()
  ctx.fillStyle = OUTLINE
  ctx.beginPath()
  ctx.ellipse(x, y, 1.5, 1.1, 0, 0, TAU)
  ctx.fill()
}

/** Where the fly is during the signature (kit frame, relative to the mouth), or null once caught and swallowed. */
function flyAt(q: number, t: number, mouth: Pt): Pt | null {
  if (q <= 0 || q >= 0.8) return null
  const home = { x: mouth.x + 13, y: mouth.y - 8 }
  if (q < 0.55)
    return { x: home.x + Math.cos(q * 22) * 5, y: home.y + Math.sin(q * 31) * 3.5 + Math.sin(t * 9) * 0.5 }
  const caught = { x: home.x + Math.cos(0.55 * 22) * 5, y: home.y + Math.sin(0.55 * 31) * 3.5 }
  // Reeled back in on the tongue.
  const k = q < 0.68 ? 0 : (q - 0.68) / 0.12
  return { x: lerp(caught.x, mouth.x, k), y: lerp(caught.y, mouth.y, k) }
}

function draw(ctx: Ctx, look: CreatureLook, f: Frame, k: DrawKit): void {
  const r = rigOf(f)
  const m = k.metrics
  const t = f.still ? 0 : f.t
  const main = r.flash ? mix(look.main, '#3a1f2e', r.flash) : look.main
  const p: Paint = { look, f, r, t, main, fl: flourish(f) }
  const mouthPt = apply(r.head, MOUTH)
  // The tongue: flicked up at the top of the cheer's hop; snapping out to the fly on the signature.
  const q = flyOf(f)
  const bug = flyAt(q, t, mouthPt)
  let tip: Pt | null = null
  if (p.fl.cheer) {
    const out = pulse(p.fl.age - 0.22, 0.3)
    if (out > 0.05) tip = { x: mouthPt.x + 17 * out, y: mouthPt.y - 6 * out }
  } else if (bug && q >= 0.55) {
    const out = q < 0.62 ? (q - 0.55) / 0.07 : 1
    tip = { x: lerp(mouthPt.x, bug.x, out), y: lerp(mouthPt.y, bug.y, out) }
  }
  // Eyes on the fly while it buzzes.
  const lookAt = bug ? { x: (bug.x - mouthPt.x) / 12, y: (bug.y - mouthPt.y) / 10 } : null

  ctx.save()
  along(ctx, r.body)
  backLeg(ctx, p, 0)
  ctx.restore()
  drawArm(ctx, m.socketB, k.hands.back, LEG_W, darkOf(main))
  k.backHand()
  ctx.save()
  along(ctx, r.body)
  body(ctx, p, k)
  backLeg(ctx, p, 1)
  ctx.restore()
  ctx.save()
  along(ctx, r.head)
  head(ctx, p, k, lookAt, !!tip)
  throat(ctx, p)
  ctx.restore()
  if (tip) tongue(ctx, mouthPt, tip)
  // Once caught, the fly rides the tongue's tip back in.
  const at = tip && q >= 0.68 ? tip : bug
  if (at) fly(ctx, at.x, at.y, t)
  drawArm(ctx, m.socketF, k.hands.front, LEG_W, main)
  k.frontHand()
  if (p.fl.cheer && !f.still) {
    // A splash of droplets as it lands.
    const k2 = (p.fl.age - 0.6) / 0.45
    if (k2 > 0 && k2 < 1)
      for (const s of [-1, -0.4, 0.4, 1]) {
        const x = s * (8 + 14 * easeOut(k2))
        const y = -2 - Math.sin(Math.PI * k2) * 9 * (1.2 - Math.abs(s) * 0.4)
        ctx.globalAlpha = 1 - k2
        paint(ctx, { p: ell(x, y, 1.6, 2), c: '#a5d8ff', k: 0, lw: 1 })
      }
    ctx.globalAlpha = 1
  }
  if (happy(f)) ticks(ctx, m.head.x + 15, m.headTop - 2, f.moodAge)
}

/** A webbed front hand: a palm along the forearm with three round toe pads; it spreads when open. */
function drawHand(ctx: Ctx, h: HandPose, look: CreatureLook, r: number): void {
  const a = Math.atan2(h.y - h.ey, h.x - h.ex)
  const len = r * (0.95 + 0.2 * h.open)
  const wid = r * (0.8 - 0.1 * h.open)
  const spread = 0.5 + 0.35 * h.open
  ctx.save()
  ctx.translate(h.x, h.y)
  ctx.rotate(a)
  const pads = [-1, 0, 1].map((i) => ({
    p: ell(Math.cos(i * spread) * len * 0.95, Math.sin(i * spread) * len * 0.95, r * 0.36, r * 0.36),
    c: look.hand,
    k: 0.3,
  }))
  group(ctx, [...pads, { p: ell(0, 0, len, wid), c: look.hand, k: 0.6 }])
  ctx.restore()
}

export const frog: BodyType = { metrics, draw, drawHand, pose }
