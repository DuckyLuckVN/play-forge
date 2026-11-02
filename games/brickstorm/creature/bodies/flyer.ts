/**
 * Flyers: the wings are the arms (spec Hands #9). Each wing runs from its shoulder socket through the solved elbow to a
 * small mitt at the solved hand, so a flyer shows two limbs, not four. Without the ball a flyer hovers on beating
 * wings; with it, it lands, folds the far wing at its side and locks the near wing's mitt on the ball (no flapping
 * while holding). A wing drawn in front always trails away from the face, so it never covers it.
 * - owl (Hoot): a round owl with a facial disc, ear tufts and talons; feathered wings and mitts. Signature 'turn':
 *   the head swivels right round to look behind. Cheer: a flap-hop with puffed feathers and loose feathers drifting.
 *   KO: flops on its back, feathers floating down.
 * - bat (Count Flap): big pointed ears, a widow's peak, little fangs and a high vampire collar; webbed wings. Signature
 *   'wrap': the far wing wraps round the body like a cape. Cheer: rockets up on a blur of wingbeats with sonar rings.
 *   KO: drops upside-down-ish.
 */
import type { Pose } from '../../hero-avatar'
import { type Mat, type Pt, along, apply, move, mul, scaleAbout, turnAbout } from '../affine'
import { drawArm } from '../hands'
import { TAU, type Ellipse, boundsOf, ellPoints, flourish, pulse, sigOf, type Flourish } from '../motion'
import {
  OUTLINE,
  clamp,
  darkOf,
  dotEye,
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
type Variant = 'owl' | 'bat'

const PINK = '#ff8fa3'
const BEAK = '#ffa94d'
const COLLAR = '#2b1d3a'

/** The avatar's `pose.rear` while holding the ball: a flyer is fully landed at or above it. */
const REAR_HOLD = 0.55
const LIMB = 8.5
const HAND_R = 3.4
/** Folded far wing (the hold moods): tucked down behind the hip. */
const FOLD_SB = -0.3
const FOLD_EB = 0.35
/** Eyes and beak sit forward on the round head (head frame). */
const FACE_X = 2.5
const EYE_GAP = 4.3

/** A variant's shapes (kit units, standing, facing +x) and how it flies. */
interface Shape {
  body: Ellipse
  head: Ellipse
  /** Hat placement (head frame). */
  hat: HeadBox
  socketF: Pt
  socketB: Pt
  /** Ear tufts or ears reach this far over the head top. */
  ear: number
  /** Hover height without the ball, and wingbeat speed (rad/s). */
  hover: number
  beat: number
  /** Wing membrane width. */
  wing: number
  /** KO tumble about the body centre (rad, − = onto its back). */
  fall: number
  /** Cheer lift (local units). */
  lift: number
}

const SHAPES: Record<Variant, Shape> = {
  owl: {
    body: { x: -0.5, y: -17, rx: 13.5, ry: 14.5 },
    head: { x: 1, y: -34, rx: 14, ry: 12 },
    hat: { x: 0, y: -7, rx: 11.5, ry: 8 },
    socketF: { x: 6, y: -23 },
    socketB: { x: -6.5, y: -24 },
    ear: 3,
    hover: 3,
    beat: 7,
    wing: 9.5,
    fall: -1.45,
    lift: 13,
  },
  bat: {
    body: { x: 0, y: -16, rx: 10, ry: 11 },
    head: { x: 1, y: -32, rx: 12, ry: 10.5 },
    hat: { x: 0.5, y: -6.5, rx: 10, ry: 7 },
    socketF: { x: 5, y: -22 },
    socketB: { x: -5, y: -23 },
    ear: 11,
    hover: 5,
    beat: 11,
    wing: 12,
    fall: 2.2,
    lift: 17,
  },
}

const variantOf = (look: CreatureLook): Variant => (look.variant === 'bat' ? 'bat' : 'owl')

/** How airborne a flyer is: 1 hovering without the ball, 0 landed with it (follows the blended `pose.rear`). */
const airOf = (f: Frame) => clamp(1 - f.pose.rear / REAR_HOLD) * (1 - smooth(clamp(f.pose.fall)))

/** Count Flap's cape wrap (idle, the near wing keeps the ball). */
const wrapping = (v: Variant, f: Frame) =>
  v === 'bat' && f.mood === 'idle' && sigOf(f) > 0.05 && f.pose.fall < 0.02
/** The wrap far enough round that the far wing draws in front of the body (nothing covers it then). */
const wrapFront = (v: Variant, f: Frame) => wrapping(v, f) && sigOf(f) > 0.25
/** Hoot's head turn 0..1 (idle only). */
const turnOf = (v: Variant, f: Frame) => (v === 'owl' && f.mood === 'idle' ? sigOf(f) : 0)

/** Cheer lift: the owl flap-hops, the bat rockets up and floats back down. */
function liftOf(v: Variant, fl: Flourish): number {
  if (!fl.cheer) return fl.k > 0 ? pulse(fl.age, 0.4) * 3 : 0
  const s = SHAPES[v]
  return v === 'owl' ? pulse(fl.age - 0.1, 0.8) * s.lift : Math.pow(pulse(fl.age, 1.2), 0.6) * s.lift
}

interface Rig {
  /** Body frame (kit units) → kit. */
  body: Mat
  /** Head frame (origin at the head centre) → kit. */
  head: Mat
  /** 0 standing .. 1 down. */
  ko: number
  flash: number
  /** Whole-body turn (rad) the wings follow. */
  turn: number
}

function rigOf(v: Variant, f: Frame): Rig {
  const s = SHAPES[v]
  const t = f.still ? 0 : f.t
  const c = smooth(clamp(f.pose.fall))
  const fl = flourish(f)
  const air = airOf(f)
  // Hovering, it rises a little on each downstroke.
  const hover = air * (s.hover + (f.still ? 0 : Math.sin(t * s.beat + 1.4) * 1.3))
  let sq = f.still ? 0 : -f.squash * 0.03
  let puff = 0
  let flash = 0
  if (!f.still && f.mood === 'hurt' && f.moodAge < 0.5) {
    // The owl's feathers puff up; the bat flinches flat.
    const k = Math.exp(-f.moodAge * 8)
    if (v === 'owl') puff += 0.14 * k
    else sq += 0.14 * k
    flash = clamp(1 - f.moodAge / 0.3) * 0.5
  }
  if (fl.cheer && v === 'owl') puff += 0.07 * fl.k
  // The bat stretches tall as it rockets up.
  if (fl.cheer && v === 'bat') sq -= 0.08 * fl.k
  const lean = f.pose.lean * 0.7
  const centre = { x: s.body.x, y: s.body.y }
  const stand = mul(
    move(0, f.pose.crouch * 3 - hover - liftOf(v, fl)),
    mul(scaleAbout({ x: 0, y: 0 }, 1 + sq + puff, 1 - sq + puff), turnAbout({ x: 0, y: -6 }, lean)),
  )
  const tipped = mul(stand, turnAbout(centre, s.fall * c))
  // Down: settle so the lowest part (body, head or ears) rests on the floor.
  const low = c
    ? Math.max(
        ...[
          ...ellPoints(tipped, s.body),
          ...ellPoints(tipped, s.head),
          ...earTips(s).map((q) => apply(tipped, { x: s.head.x + q.x, y: s.head.y + q.y })),
        ].map((q) => q.y),
      )
    : 0
  const body = mul(move(0, -low * c), tipped)
  const lag = f.still ? 0 : Math.sin(t * 2.2 - 0.8) * 0.35
  const tilt =
    f.pose.tilt * 0.7 + (f.still ? 0 : happy(f) ? Math.sin(t * 11) * 0.07 : Math.sin(t * 0.9) * 0.03)
  const head = mul(body, mul(move(s.head.x, s.head.y + lag), turnAbout({ x: 0, y: 0 }, tilt)))
  return { body, head, ko: c, flash, turn: lean + s.fall * c }
}

function metrics(look: CreatureLook, f: Frame): BodyMetrics {
  const v = variantOf(look)
  const s = SHAPES[v]
  const r = rigOf(v, f)
  const head = apply(r.head, { x: 0, y: 0 })
  return {
    headTop: apply(r.head, { x: 0, y: -s.head.ry - s.ear * (1 - r.ko) }).y,
    // The solver keeps the mitts off the face; wing tips may brush the round head's outer rim (and the hat brim).
    head: { x: head.x, y: head.y, rx: s.head.rx * 0.82, ry: s.head.ry * 0.9 },
    socketF: apply(r.body, s.socketF),
    socketB: apply(r.body, s.socketB),
    // Wrapped round the front, nothing is drawn over the far wing's mitt.
    bodyBox: wrapFront(v, f)
      ? { ...apply(r.body, s.socketB), w: 0, h: 0 }
      : boundsOf(ellPoints(r.body, s.body)),
    upper: LIMB,
    fore: LIMB,
    armed: true,
    handR: HAND_R,
  }
}

/** Moods with their own wing moves (no flight beat on top). */
const OWN = new Set<Frame['mood']>(['cheer', 'revive', 'cast', 'hurt'])
/** Moods in which the wings rest folded (the far one always; the near one when it has no ball). */
const FOLD = new Set<Frame['mood']>(['idle', 'watch', 'aim', 'worried'])

/**
 * Wing reactions on the mood pose: both wings up beating on cheer, raised on cast, flared on a flinch, a wing flick on
 * the pump, folded at rest; airborne they beat (blended by how airborne); Count Flap's wrap; splayed out on KO.
 */
function pose(look: CreatureLook, f: Frame): Pose {
  const v = variantOf(look)
  const s = SHAPES[v]
  const r = rigOf(v, f)
  const p = { ...f.pose }
  const t = f.still ? 0 : f.t
  const flutter = (ph: number, a: number) => (f.still ? 0 : a * Math.sin(t * 20 + ph))
  if (f.mood === 'cheer' || f.mood === 'revive') {
    // Elbows out, wing tips up: a big V that frames the face.
    p.sF = 1.75 + flutter(0, 0.35)
    p.eF = 0.85 + flutter(1, 0.3)
    p.sB = -1.75 - flutter(0, 0.35)
    p.eB = -0.85 - flutter(1, 0.3)
  } else if (f.mood === 'cast') {
    p.sF = 2.3
    p.eF = 0.2
    p.sB = -2.3
    p.eB = -0.2
  } else if (f.mood === 'hurt') {
    // Flared on the flinch, then drooping.
    const k = f.moodAge < 0.35 ? 1 : 0
    p.sF = k ? 1.5 : 0.55
    p.eF = k ? -0.5 : 0.9
    p.sB = k ? -1.5 : -0.4
    p.eB = k ? 0.5 : 0.5
  } else if (f.mood === 'pump') {
    p.sB = -1.2 - (f.still ? 0 : 0.6 * pulse(f.moodAge, 0.4))
    p.eB = -0.3
  } else if (FOLD.has(f.mood) && !(f.mood === 'idle' && p.sB < -1.2)) {
    // Folded at the side (an idle wave or stretch, which raise the far wing, still plays).
    p.sB = FOLD_SB
    p.eB = FOLD_EB
    if (!f.holding) {
      p.sF = -FOLD_SB
      p.eF = -FOLD_EB
    }
  }
  // Airborne the wings beat; the near wing keeps the ball while holding.
  const air = airOf(f)
  if (air > 0 && !OWN.has(f.mood)) {
    const b = f.still ? 0 : Math.sin(t * s.beat)
    const up = 1.45 + 0.6 * b
    const bend = -0.25 * b
    p.sB = lerp(p.sB, -up, air)
    p.eB = lerp(p.eB, -bend, air)
    if (!f.holding) {
      p.sF = lerp(p.sF, up, air)
      p.eF = lerp(p.eF, bend, air)
    }
  }
  if (wrapping(v, f)) {
    // Round the front of the body, at chest height.
    const k = sigOf(f)
    p.sB = lerp(p.sB, 1, k)
    p.eB = lerp(p.eB, 0.5, k)
  }
  // Angles are in the kit frame: the wings turn with the body.
  p.sF += r.turn
  p.sB += r.turn
  const c = r.ko
  if (c > 0) {
    p.sF = lerp(p.sF, 1.5, c)
    p.eF = lerp(p.eF, 0.15, c)
    p.sB = lerp(p.sB, -1.5, c)
    p.eB = lerp(p.eB, -0.15, c)
  }
  return p
}

/** A wing's shape: bones socket → elbow → hand, and a trailing edge on the side away from `away` (the face). */
function wingGeom(socket: Pt, h: HandPose, w: number, away: Pt | null) {
  const elbow = { x: h.ex, y: h.ey }
  const hand = { x: h.x, y: h.y }
  const l = Math.max(1e-6, Math.hypot(hand.x - socket.x, hand.y - socket.y))
  const ux = (hand.x - socket.x) / l
  const uy = (hand.y - socket.y) / l
  // Trailing side: back when the wing hangs, down when it points forward.
  let n = { x: -uy, y: ux }
  if (away) {
    const mx = (socket.x + hand.x) / 2
    const my = (socket.y + hand.y) / 2
    if (n.x * (away.x - mx) + n.y * (away.y - my) > 0) n = { x: -n.x, y: -n.y }
  }
  const at = (a: Pt, b: Pt, k: number) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) })
  const bones = [hand, at(elbow, hand, 0.5), elbow, at(socket, elbow, 0.5), at(socket, elbow, 0.1)]
  const prof = [0.7, 1, 1.05, 0.85, 0.3]
  const trail = bones.map((b, i) => ({ x: b.x + n.x * w * prof[i], y: b.y + n.y * w * prof[i] }))
  return { socket, elbow, hand, bones, trail, n }
}

/** The outline points of a wing (for tests): front wings trail away from the face. */
export function wingPoints(look: CreatureLook, m: BodyMetrics, h: HandPose, front: boolean): Pt[] {
  const s = SHAPES[variantOf(look)]
  const g = wingGeom(front ? m.socketF : m.socketB, h, s.wing, front ? m.head : null)
  return [g.socket, g.elbow, g.hand, ...g.trail]
}

/** What a painter gets. */
interface Paint {
  look: CreatureLook
  f: Frame
  r: Rig
  v: Variant
  s: Shape
  /** Idle time (0 when still). */
  t: number
  /** Main colour after the hurt flash. */
  main: string
  fl: Flourish
  sig: number
}

/** One wing: the membrane (scalloped feathers or a webbed edge), finger struts, then the arm bones on top. */
function wing(ctx: Ctx, p: Paint, socket: Pt, h: HandPose, front: boolean, m: BodyMetrics): void {
  const { s, v } = p
  const g = wingGeom(socket, h, s.wing, front ? m.head : null)
  // Wings a shade darker than the body, so the near one reads over the belly.
  const c = front ? mix(p.main, darkOf(p.main), 0.6) : darkOf(p.main)
  // A bat's web is thin skin: lighter and a little pink against its fur.
  const fill = v === 'owl' ? (front ? c : darkOf(c)) : mix(front ? p.main : darkOf(p.main), PINK, 0.35)
  const d = new Path2D()
  d.moveTo(g.socket.x, g.socket.y)
  d.lineTo(g.elbow.x, g.elbow.y)
  d.lineTo(g.hand.x, g.hand.y)
  d.lineTo(g.trail[0].x, g.trail[0].y)
  // Feathers bulge out between the tips; a bat's web sags in between its fingers.
  const bulge = v === 'owl' ? 0.38 : -0.22
  for (let i = 0; i < g.trail.length - 1; i++) {
    const a = g.trail[i]
    const b = g.trail[i + 1]
    d.quadraticCurveTo(
      (a.x + b.x) / 2 + g.n.x * s.wing * bulge,
      (a.y + b.y) / 2 + g.n.y * s.wing * bulge,
      b.x,
      b.y,
    )
  }
  d.closePath()
  group(ctx, [{ p: d, c: fill, k: 0.5 }])
  // Feather lines or finger struts, from the bones out to the edge.
  ctx.strokeStyle = darkOf(fill)
  ctx.lineWidth = v === 'owl' ? 1.1 : 1.3
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i < g.trail.length - 1; i++) {
    const b = g.bones[i]
    const e = g.trail[i]
    const k = v === 'owl' ? 0.45 : 0.92
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(lerp(b.x, e.x, k), lerp(b.y, e.y, k))
  }
  ctx.stroke()
  drawArm(ctx, socket, h, v === 'owl' ? 3.4 : 3, front ? p.main : darkOf(p.main))
}

/** Ear bases and leans (head frame): far, near. */
const EARS = [
  [-7.5, -7.5, -0.45, true],
  [6, -8.5, 0.35, false],
] as const
/** Ear tips (head frame), for settling a fallen flyer on the floor. */
const earTips = (s: Shape): Pt[] =>
  EARS.map(([x, y, lean]) => ({ x: x + Math.sin(lean) * (s.ear + 2), y: y - Math.cos(lean) * (s.ear + 2) }))

/** Owl ear tufts or bat ears (head frame, behind the head). */
function ears(ctx: Ctx, p: Paint): void {
  const { v, r } = p
  for (const [x, y, lean, back] of EARS) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(lean - (p.r.flash > 0 ? 0.3 : 0) - 0.3 * r.ko)
    const c = back ? darkOf(p.main) : p.main
    if (v === 'owl') {
      group(ctx, [{ p: new Path2D('M-4 3 L-1.5 -7 L1 -2 L4 3 Z'), c }])
    } else {
      group(ctx, [{ p: new Path2D('M-5.2 3 Q-6.5 -6 0 -13 Q6 -6 5.2 3 Z'), c }])
      paint(ctx, {
        p: new Path2D('M-2.8 2 Q-3.5 -4 0 -9 Q3.2 -4 2.8 2 Z'),
        c: back ? darkOf(PINK) : PINK,
        k: 0,
        lw: 0,
      })
    }
    ctx.restore()
  }
}

/** Eyes (head frame, at the face): the owl's big amber eyes, the bat's dot eyes; ^ ^, xx, squeezed, blinking. */
function eyes(ctx: Ctx, p: Paint): void {
  const { f, t, look, v } = p
  const ex = [FACE_X - EYE_GAP, FACE_X + EYE_GAP]
  const y = 0
  if (happy(f)) {
    for (const x of ex) happyEye(ctx, x, y, v === 'owl' ? 3.3 : 2.6)
    return
  }
  if (f.eyes === 'xx') {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const x of ex) {
      ctx.moveTo(x - 2.2, y - 2.2)
      ctx.lineTo(x + 2.2, y + 2.2)
      ctx.moveTo(x + 2.2, y - 2.2)
      ctx.lineTo(x - 2.2, y + 2.2)
    }
    ctx.stroke()
    return
  }
  if (f.eyes === 'squeeze') {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 2.1
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const [x, d] of [
      [ex[0], 1],
      [ex[1], -1],
    ]) {
      ctx.moveTo(x - 2 * d, y - 2.3)
      ctx.lineTo(x + 1.9 * d, y)
      ctx.lineTo(x - 2 * d, y + 2.3)
    }
    ctx.stroke()
    return
  }
  const wide = f.eyes === 'wide' ? 1.2 : 1
  const shut = f.blink > 0 || f.pose.eyeOpen < 0.2
  const open = Math.max(0.35, Math.min(1, f.pose.eyeOpen))
  const lx = f.lookX * 0.8 + (f.still ? 0 : wander(t, 5) * 0.6)
  const ly = f.lookY * 0.7
  if (v === 'bat') {
    for (const x of ex) dotEye(ctx, x, y + 0.5, 2 * wide, 2.6 * wide * open, shut, lx, ly)
    return
  }
  // Owl: big round amber eyes with a black pupil; a heavy lid when sleepy, a line when blinking.
  for (const x of ex) {
    if (shut) {
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(x, y - 1, 3.4, 0.15 * Math.PI, 0.85 * Math.PI)
      ctx.stroke()
      continue
    }
    const R = 3.7 * wide
    paint(ctx, { p: ell(x, y, R, R), c: look.eye, k: 0, lw: 1.5 })
    ctx.fillStyle = OUTLINE
    ctx.beginPath()
    ctx.arc(x + lx * 0.9, y + ly * 0.8, 2.1 * wide, 0, TAU)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(x + lx * 0.9 - 0.8, y + ly * 0.8 - 0.9, 0.9, 0, TAU)
    ctx.fill()
    if (open < 0.95) {
      // A heavy lid over the top of the eye.
      ctx.save()
      ctx.clip(ell(x, y, R, R))
      ctx.fillStyle = p.main
      ctx.fillRect(x - R, y - R, R * 2, (1 - open) * R * 2)
      ctx.strokeStyle = OUTLINE
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(x - R, y - R + (1 - open) * R * 2)
      ctx.lineTo(x + R, y - R + (1 - open) * R * 2)
      ctx.stroke()
      ctx.restore()
    }
  }
}

/** Brows when worried or focused (head frame). */
function brows(ctx: Ctx, p: Paint): void {
  const { f } = p
  if (f.eyes === 'xx' || (Math.abs(f.pose.brow) <= 0.3 && f.pose.browUp <= 0.5)) return
  const up = f.pose.browUp * 1.3
  const knit = f.pose.brow * 1.5
  const ex = [FACE_X - EYE_GAP, FACE_X + EYE_GAP]
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(ex[0] - 3, -5 - up)
  ctx.lineTo(ex[0] + 2.2, -5 - up + knit)
  ctx.moveTo(ex[1] + 3, -5 - up)
  ctx.lineTo(ex[1] - 2.2, -5 - up + knit)
  ctx.stroke()
}

/** The owl's beak: shut, or open with a tongue when happy or shouting (head frame). */
function beak(ctx: Ctx, p: Paint): void {
  const { f } = p
  const x = FACE_X
  const y = 3.6
  const open = happy(f) || f.mood === 'ko' || f.pose.mouthOpen > 0.45
  if (open) {
    const h = happy(f) ? 3.4 : 2.2
    paint(ctx, {
      p: new Path2D(`M${x - 2.4} ${y} L${x + 2.4} ${y} L${x} ${y + h + 2} Z`),
      c: '#7a1f2b',
      k: 0,
      lw: 1.3,
    })
    paint(ctx, {
      p: new Path2D(`M${x - 2.6} ${y - 1.2} L${x + 2.6} ${y - 1.2} L${x} ${y + 1.4} Z`),
      c: BEAK,
      k: 0,
      lw: 1.3,
    })
  } else {
    paint(ctx, {
      p: new Path2D(`M${x - 2.4} ${y - 1} L${x + 2.4} ${y - 1} L${x} ${y + 3.2} Z`),
      c: BEAK,
      k: 0,
      lw: 1.3,
    })
  }
}

/** The bat's mouth with fangs: a smile, open when happy, a frown, an o on KO (head frame). */
function fangs(ctx: Ctx, p: Paint): void {
  const { f } = p
  const x = FACE_X + 1
  const y = 4.6
  // Nose.
  ctx.fillStyle = OUTLINE
  ctx.beginPath()
  ctx.ellipse(x + 0.4, y - 2.2, 1.1, 0.7, 0, 0, TAU)
  ctx.fill()
  const fang = (fx: number, fy: number) =>
    paint(ctx, {
      p: new Path2D(`M${fx - 0.9} ${fy} L${fx + 0.9} ${fy} L${fx} ${fy + 1.8} Z`),
      c: '#ffffff',
      k: 0,
      lw: 0.9,
    })
  if (happy(f)) {
    openMouth(ctx, x, y, 3.2, 3.6)
    fang(x - 1.6, y + 0.1)
    fang(x + 1.6, y + 0.1)
  } else if (f.mood === 'ko' || (f.pose.mouthOpen > 0.45 && f.pose.smile <= 0.3)) {
    ctx.fillStyle = '#7a1f2b'
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.ellipse(x, y + 1.6, 1.7, 1.2 + f.pose.mouthOpen, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    if (f.pose.smile < 0) ctx.arc(x, y + 3.4, 2.4, 1.2 * Math.PI, 1.8 * Math.PI)
    else ctx.arc(x, y - 0.6, 2.6, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
    fang(x - 1.3, y + 1.6)
    fang(x + 1.3, y + 1.6)
  }
}

/** The head (head frame): ears, head, facial disc or muzzle, face (turned for Hoot's signature), hat. */
function head(ctx: Ctx, p: Paint, k: DrawKit): void {
  const { v, s, look } = p
  ears(ctx, p)
  const shape = ell(0, 0, s.head.rx, s.head.ry)
  group(ctx, [{ p: shape, c: p.main, k: 1.1 }])
  gloss(ctx, -6, -6.5, 2.8, 1.5, -0.6)
  const u = turnOf(v, p.f)
  ctx.save()
  ctx.clip(shape)
  if (v === 'bat') {
    // A widow's peak, then a pale muzzle.
    paint(ctx, {
      p: new Path2D(
        `M-14 -14 L14 -14 L14 -8.5 Q${FACE_X + 4} -9.5 ${FACE_X} -4.5 Q${FACE_X - 4} -9.5 -14 -8.5 Z`,
      ),
      c: darkOf(darkOf(p.main)),
      k: 0,
      lw: 0,
    })
    paint(ctx, { p: ell(FACE_X + 1, 4, 6.5, 4.6), c: mix(p.main, '#ffffff', 0.4), k: 0, lw: 0 })
  }
  ctx.restore()
  // The face slides round and narrows as Hoot turns its head to look behind.
  ctx.save()
  ctx.translate(-u * 12, 0)
  ctx.scale(Math.max(0.08, 1 - u * 0.95), 1)
  if (u < 0.85) {
    if (v === 'owl') {
      // Facial disc: two overlapping rounds.
      const disc = new Path2D()
      disc.ellipse(FACE_X - EYE_GAP, 0.5, 5.8, 5.6, 0, 0, TAU)
      disc.ellipse(FACE_X + EYE_GAP, 0.5, 5.8, 5.6, 0, 0, TAU)
      ctx.strokeStyle = darkOf(look.second)
      ctx.lineWidth = 1.6
      ctx.stroke(disc)
      ctx.fillStyle = look.second
      ctx.fill(disc)
    }
    eyes(ctx, p)
    brows(ctx, p)
    if (v === 'owl') beak(ctx, p)
    else fangs(ctx, p)
    // Blush.
    ctx.fillStyle = 'rgb(255 130 150 / 0.45)'
    ctx.beginPath()
    ctx.ellipse(FACE_X - EYE_GAP - 3.6, 4.5, 2, 1.2, 0, 0, TAU)
    ctx.ellipse(FACE_X + EYE_GAP + 3.6, 4.5, 2, 1.2, 0, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
  if (u > 0.4) {
    // The back of the head: feather marks fade in as the face goes round.
    ctx.globalAlpha = clamp((u - 0.4) * 2.5)
    ctx.strokeStyle = darkOf(p.main)
    ctx.lineWidth = 1.4
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const [x, y] of [
      [4, -1],
      [8, 3],
      [3, 5],
    ]) {
      ctx.moveTo(x - 2, y - 1.5)
      ctx.lineTo(x, y)
      ctx.lineTo(x + 2, y - 1.5)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  k.hat(s.hat)
}

/** The bat's vampire collar: stand-up flaps behind the head, red lined; they flare on the wrap (body frame). */
function collar(ctx: Ctx, p: Paint): void {
  const flare = p.sig * (p.v === 'bat' ? 1 : 0)
  for (const [x, side] of [
    [-6, -1],
    [6, 1],
  ] as const) {
    const tip = side * (11 + 4 * flare)
    const d = new Path2D(
      `M${x} -24 Q${x + side * 3} -30 ${x + tip} ${-34 - 3 * flare} Q${x + side * 4} -27 ${x + side * 6} -22 Z`,
    )
    group(ctx, [{ p: d, c: COLLAR, k: 0.4 }])
    ctx.save()
    ctx.clip(d)
    paint(ctx, { p: ell(x + side * 4, -27, 4, 5), c: p.look.second, k: 0, lw: 0 })
    ctx.restore()
  }
}

/** Feet: owl talons standing, bat claws dangling (body frame). */
function feet(ctx: Ctx, p: Paint): void {
  const { v } = p
  if (v === 'owl') {
    for (const x of [-5, 4.5]) {
      group(ctx, [
        {
          p: new Path2D(
            `M${x - 3.6} 0 Q${x - 3} -3.8 ${x} -3.8 Q${x + 3} -3.8 ${x + 3.8} 0 Q${x} -1 ${x - 3.6} 0 Z`,
          ),
          c: BEAK,
          k: 0.5,
        },
      ])
    }
    return
  }
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const x of [-3, 3]) {
    ctx.moveTo(x, -5.5)
    ctx.lineTo(x, -1.5)
    ctx.moveTo(x, -1.5)
    ctx.lineTo(x + 1.5, -0.5)
  }
  ctx.stroke()
}

/** The body (body frame): round body, belly with feather chevrons or a chest tuft, gloss and the emblem. */
function body(ctx: Ctx, p: Paint, k: DrawKit): void {
  const { s, v, look } = p
  feet(ctx, p)
  const b = s.body
  const shape = ell(b.x, b.y, b.rx, b.ry)
  group(ctx, [{ p: shape, c: p.main }])
  ctx.save()
  ctx.clip(shape)
  if (v === 'owl') {
    paint(ctx, { p: ell(b.x + 4, b.y + 3.5, 9, 10.5), c: look.second, k: 0, lw: 0 })
    ctx.strokeStyle = darkOf(look.second)
    ctx.lineWidth = 1.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const [x, y] of [
      [1, -16],
      [7, -15],
      [4, -10],
      [10, -9],
      [1, -5],
      [7, -4.5],
    ]) {
      ctx.moveTo(x - 1.6, y - 1)
      ctx.lineTo(x, y + 0.4)
      ctx.lineTo(x + 1.6, y - 1)
    }
    ctx.stroke()
  } else {
    paint(ctx, { p: ell(b.x + 3, b.y - 2, 6, 7), c: mix(p.main, '#ffffff', 0.25), k: 0, lw: 0 })
  }
  ctx.restore()
  gloss(ctx, b.x - 5, b.y - 7, 2.6, 1.3, -0.4)
  k.emblem(b.x + (v === 'owl' ? 4 : 2.5), b.y + (v === 'owl' ? 4 : -1), 6)
}

/** A loose feather drifting down (kit frame). */
function feather(ctx: Ctx, x: number, y: number, rot: number, c: string, alpha: number): void {
  if (alpha <= 0.02) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.rotate(rot)
  paint(ctx, { p: new Path2D('M0 -4 Q2.4 -1 0 4 Q-2.4 -1 0 -4 Z'), c, k: 0, lw: 1.1 })
  ctx.restore()
}

/** Cheer, hurt and KO effects over everything (kit frame). */
function effects(ctx: Ctx, p: Paint, m: BodyMetrics): void {
  const { v, f, fl, t, r } = p
  if (f.still) return
  const mid = { x: m.bodyBox.x + m.bodyBox.w / 2, y: m.bodyBox.y + m.bodyBox.h / 2 }
  if (v === 'owl') {
    // Loose feathers: thrown off by the cheer's flap, the flinch, and the fall.
    const age = fl.cheer
      ? fl.age - 0.15
      : f.mood === 'hurt'
        ? f.moodAge
        : f.mood === 'ko'
          ? f.moodAge - 0.3
          : -1
    const life = f.mood === 'ko' ? 1.8 : 1.2
    if (age > 0 && age < life) {
      const k = age / life
      for (let i = 0; i < 3; i++) {
        // Out from the sides and below the face, drifting down.
        const side = i === 1 ? -1 : 1
        const dx = side * (m.bodyBox.w / 2 + 3 + 10 * easeOut(k * 2)) + Math.sin(t * 4 + i * 2) * 2
        const y = mid.y - 2 - 10 * easeOut(k * 3) + 30 * k * k + i * 4
        feather(
          ctx,
          mid.x + dx,
          y,
          Math.sin(t * 5 + i) * 0.8,
          i % 2 ? p.main : p.look.second,
          clamp(2 - k * 2),
        )
      }
    }
  }
  if (v === 'bat' && fl.k > 0.05) {
    // Sonar rings out of the mouth.
    const mouth = apply(r.head, { x: FACE_X + 6, y: 4 })
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      const q = (fl.age * 1.6 + i / 3) % 1
      ctx.strokeStyle = i % 2 ? '#ffffff' : '#ffd43b'
      ctx.globalAlpha = (1 - q) * fl.k * (fl.cheer ? 1 : 0.6)
      ctx.beginPath()
      ctx.arc(mouth.x, mouth.y, 3 + q * 14, -0.6, 0.6)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
}

function draw(ctx: Ctx, look: CreatureLook, f: Frame, k: DrawKit): void {
  const v = variantOf(look)
  const s = SHAPES[v]
  const r = rigOf(v, f)
  const m = k.metrics
  const main = r.flash ? mix(look.main, '#3a1f2e', r.flash) : look.main
  const p: Paint = { look, f, r, v, s, t: f.still ? 0 : f.t, main, fl: flourish(f), sig: sigOf(f) }
  // Count Flap's wrap brings the far wing round in front of the body.
  const wrap = wrapFront(v, f)
  const farWing = () => {
    wing(ctx, p, m.socketB, k.hands.back, wrap, m)
    k.backHand()
  }
  if (!wrap) farWing()
  ctx.save()
  along(ctx, r.body)
  if (v === 'bat') collar(ctx, p)
  body(ctx, p, k)
  ctx.restore()
  ctx.save()
  along(ctx, r.head)
  head(ctx, p, k)
  ctx.restore()
  if (wrap) farWing()
  wing(ctx, p, m.socketF, k.hands.front, true, m)
  k.frontHand()
  effects(ctx, p, m)
  if (happy(f)) ticks(ctx, m.head.x + 15, m.headTop - 2, f.moodAge)
}

/** A small mitt at the wing tip: feather tips fanned out (owl) or a webbed paw with a thumb claw (bat). */
function drawHand(ctx: Ctx, h: HandPose, look: CreatureLook, r: number): void {
  const a = Math.atan2(h.y - h.ey, h.x - h.ex)
  const len = r * (1.05 + 0.2 * h.open)
  const wid = r * (0.82 - 0.15 * h.open)
  ctx.save()
  ctx.translate(h.x, h.y)
  ctx.rotate(a)
  if (variantOf(look) === 'owl') {
    const tips = [-0.55, 0, 0.55].map((d) => ({
      p: ell(len * 0.75, d * wid * (1 + 0.6 * h.open), len * 0.55, wid * 0.4, d * (0.5 + 0.4 * h.open)),
      c: look.hand,
      k: 0.4,
    }))
    group(ctx, [...tips, { p: ell(0, 0, len, wid), c: look.hand, k: 0.6 }])
  } else {
    group(ctx, [
      { p: ell(len * 0.35, -wid * 0.95, wid * 0.5, wid * 0.32, -0.6), c: darkOf(look.hand), k: 0 },
      { p: ell(0, 0, len, wid), c: look.hand, k: 0.6 },
    ])
    ctx.strokeStyle = darkOf(look.hand)
    ctx.lineWidth = 1
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const y of [-wid * 0.3, wid * 0.3]) {
      ctx.moveTo(len * 0.45, y)
      ctx.lineTo(len * 0.95, y * 1.1)
    }
    ctx.stroke()
  }
  ctx.restore()
}

export const flyer: BodyType = { metrics, draw, drawHand, pose }
