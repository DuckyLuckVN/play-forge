/**
 * Golems: stone bodies on stubby block legs, chunky block arms from the shoulder sockets to fist hands. They breathe
 * heavily, the head a beat behind the shoulders; on cheer they throw their fists up and stomp (shake, dust, pebbles),
 * chips fly off the shoulder when hurt. Each variant's shape and painters come from `SHAPES`:
 * - brick (Bastion): a castle head with a dark visor (white slit eyes), a blue scarf whose tail flaps and a badge that
 *   pulses gold; whips its scarf; crumbles into five blocks on KO;
 * - boulder (Bram): one round mossy rock with a friendly face; yawns; a flower pops up on cheer; rolls onto its back
 *   on KO (feet up);
 * - mountain (Granite): a wide trapezoid body and a snowy peak head with deep-set glowing eyes; rumbles (a small shake,
 *   pebbles tumbling); snow bursts off the peak on cheer; crumbles on KO;
 * - lava (Grakka): basalt with glowing cracks that pulse, a glowing grin; lets off steam; hurt sprays embers; sparks
 *   on cheer; cools dark and crumbles on KO.
 */
import type { Pose } from '../../hero-avatar'
import { type Mat, type Pt, along, apply, move, mul, turnAbout } from '../affine'
import { TAU, boundsOf, flourish, sigOf } from '../motion'
import {
  OUTLINE,
  box,
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

const GOLD = '#ffc531'
const VISOR = '#16182a'
const PEBBLE = '#9aa0ad'

/** Body geometry, local units (feet at 0, facing +x, up is −y). */
const HIP_Y = -10
/** Bastion's visor line: the head runs from HY − 7 to HY + 11, its merlons up to HY − 11.5. */
const HY = -41
const HEAD_TOP = HY - 11.5
const HEAD_W = 12
/** Bastion's torso; the other golems' torsos are in `SHAPES`. */
const TORSO = { x: -13, y: -31, w: 26, h: 22 }
const ARM_W = 7
/** Breathing: rate (rad/s), shoulder rise, and how far behind the head follows (rad). */
const BREATH = 1.6
const BREATH_AMP = 1.1
const HEAD_LAG = 0.9

/** The stomp of a cheer (big) or a fist pump (smaller): when the foot lands and how hard. */
function stompOf(f: Frame): { at: number; amp: number } | null {
  if (f.mood === 'cheer') return { at: 0.42, amp: 1 }
  if (f.mood === 'pump') return { at: 0.28, amp: 0.5 }
  return null
}
/** Fists up before the stomp (0..1), slammed down on it. */
function raiseOf(f: Frame): number {
  const s = stompOf(f)
  if (!s) return 0
  const a = f.moodAge
  return a < s.at ? easeOut(a / (s.at * 0.72)) : a < s.at + 0.08 ? 1 - (a - s.at) / 0.08 : 0
}
/** Seconds since the stomp landed (< 0 before it, or no stomp). */
const afterOf = (f: Frame) => {
  const s = stompOf(f)
  return s ? f.moodAge - s.at : -1
}

type Variant = 'brick' | 'boulder' | 'mountain' | 'lava'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Everything a golem's painters need for this frame. */
interface GolemPaint {
  look: CreatureLook
  f: Frame
  k: DrawKit
  t: number
  /** The stone colour (dark-flashed on a hurt). */
  stone: string
  s: Shape
  /** Lava heat 0 (cooled) .. 1 (bright), pulsing; 0 for stone golems. */
  heat: number
}

/** A golem variant: its geometry (local units) and painters. */
interface Shape {
  neck: Pt
  /** The head's centre line (eyes) and top, and the head's half-width at the top. */
  hy: number
  top: number
  topW: number
  /** Clearance box for the hand solver. */
  head: HeadBox
  hat: HeadBox
  torso: Box
  socket: Pt
  /** Back and front leg blocks. */
  legs: [Box, Box]
  /** How it goes down on KO: crumbling into blocks, or rolling back in one piece. */
  ko: 'crumble' | 'roll'
  /** The torso: whole (0), or its back (−1) or front (1) half once it crumbles. */
  torsoPath(half: -1 | 0 | 1): Path2D
  /** Stone detail painted over the torso, clipped to it (seams, strata, moss, cracks). */
  torsoDetail(ctx: Ctx, p: GolemPaint): void
  /** The head (in the head frame), with its hat. */
  headPaint(ctx: Ctx, p: GolemPaint): void
  /** Under everything (Bastion's scarf tail), in the neck frame. */
  behind?(ctx: Ctx, p: GolemPaint): void
  /** Over the head (Bastion's scarf band and badge), in the neck frame. */
  neckPaint?(ctx: Ctx, p: GolemPaint): void
  /** Where the emblem sits on the torso (Bastion wears it on the badge instead). */
  emblem?: { x: number; y: number; size: number }
  /** Cheer flourish, signature and other effects, in the kit's frame, over everything. */
  fx(ctx: Ctx, p: GolemPaint, r: Rig): void
}

/** The five blocks a KO crumbles into: their standing centre, where they settle, their spin and how high they tumble. */
interface Block {
  from: Pt
  to: Pt
  spin: number
  lift: number
}
const centre = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
/**
 * The pile: back leg and back torso half on the ground behind, the front leg tumbled onto it, the front half leaning on
 * it, and the head rolled off in front onto its back, so every block shows.
 */
function blocksOf(s: Shape): Record<'legB' | 'legF' | 'torsoB' | 'torsoF' | 'head', Block> {
  const t = s.torso
  return {
    legB: { from: centre(s.legs[0]), to: { x: -22, y: -5 }, spin: -Math.PI / 2, lift: 6 },
    legF: { from: centre(s.legs[1]), to: { x: -9, y: -18 }, spin: 0.5, lift: 10 },
    torsoB: {
      from: { x: t.x + t.w / 4, y: t.y + t.h / 2 },
      to: { x: -10, y: -6.5 },
      spin: -Math.PI / 2,
      lift: 9,
    },
    torsoF: {
      from: { x: t.x + (t.w * 3) / 4, y: t.y + t.h / 2 },
      to: { x: 4, y: -12.5 },
      spin: 0.35,
      lift: 8,
    },
    head: { from: { x: 0, y: s.hy + 2 }, to: { x: 13, y: -12 }, spin: Math.PI / 2, lift: 14 },
  }
}
/** Bram's KO: rolls back onto its back (feet up), sliding a little, and rocks to a stop. */
const ROLL = { angle: -1.05, slide: -9, about: { x: 0, y: -24 } }

/** Every part's transform for this frame (local units → the kit's frame). */
interface Rig {
  legB: Mat
  legF: Mat
  torsoB: Mat
  torsoF: Mat
  /** The neck (scarf band and badge): follows the breath a beat late, without the head's tilt. */
  neck: Mat
  head: Mat
  /** 0..1 how far the KO crumble (or roll) has gone. */
  crumble: number
}

const breathOf = (f: Frame, lag = 0) => (f.still ? 0 : -Math.sin(f.t * BREATH - lag) * BREATH_AMP)

/** Head tilt on the neck: a heavy head turns only part of the pose's tilt, plus a slow sway (a happy wobble on cheer). */
const tiltOf = (f: Frame) =>
  f.pose.tilt * 0.6 + (f.still ? 0 : happy(f) ? Math.sin(f.t * 12) * 0.08 : Math.sin(f.t * 0.9) * 0.04)

function rigOf(f: Frame, s: Shape): Rig {
  const hurt =
    !f.still && f.mood === 'hurt' && f.moodAge < 0.35 ? 0.08 * Math.sin((f.moodAge / 0.35) * Math.PI) : 0
  const sq = (f.still ? 0 : -f.squash * 0.03) + hurt
  const after = afterOf(f)
  const dip =
    !f.still && after > 0 && after < 0.2 ? Math.sin((after / 0.2) * Math.PI) * 2 * (stompOf(f)?.amp ?? 0) : 0
  const squash: Mat = [1 + sq, 0, 0, 1 - sq, 0, 0]
  // The upper body: breathing rise, then lean about the hip, crouch, squash.
  const upper = mul(
    squash,
    mul(
      move(0, f.pose.crouch * 4 + dip),
      mul(turnAbout({ x: 0, y: HIP_Y }, f.pose.lean), move(0, breathOf(f))),
    ),
  )
  // The head follows the breath a beat late, and tilts on the neck.
  const neck = mul(upper, move(0, breathOf(f, HEAD_LAG) - breathOf(f)))
  const head = mul(neck, turnAbout(s.neck, tiltOf(f)))
  const c = smooth(clamp(f.pose.fall))
  // Settling: a little rock as the blocks land.
  const ko = f.mood === 'ko' && !f.still ? f.moodAge - 0.45 : -1
  const rock = ko > 0 && ko < 0.5 ? Math.sin(ko * 30) * 0.08 * (1 - ko / 0.5) : 0
  if (s.ko === 'roll') {
    const roll = (m: Mat): Mat =>
      c <= 0 ? m : mul(move(ROLL.slide * c, 0), mul(turnAbout(ROLL.about, ROLL.angle * c + rock), m))
    return {
      legB: roll(squash),
      legF: roll(squash),
      torsoB: roll(upper),
      torsoF: roll(upper),
      neck: roll(neck),
      head: roll(head),
      crumble: c,
    }
  }
  const b = blocksOf(s)
  const fall = (bl: Block, m: Mat): Mat =>
    c <= 0
      ? m
      : mul(
          move(c * (bl.to.x - bl.from.x), c * (bl.to.y - bl.from.y) - Math.sin(Math.PI * c) * bl.lift),
          mul(turnAbout(bl.from, c * bl.spin + rock), m),
        )
  return {
    legB: fall(b.legB, squash),
    legF: fall(b.legF, squash),
    torsoB: fall(b.torsoB, upper),
    torsoF: fall(b.torsoF, upper),
    neck: fall(b.head, neck),
    head: fall(b.head, head),
    crumble: c,
  }
}

const corners = (m: Mat, { x, y, w, h }: Box) =>
  [
    { x, y },
    { x: x + w, y },
    { x, y: y + h },
    { x: x + w, y: y + h },
  ].map((p) => apply(m, p))

function metrics(look: CreatureLook, f: Frame): BodyMetrics {
  const s = shapeOf(look)
  const r = rigOf(f, s)
  const t = s.torso
  const pts = [
    ...corners(r.legB, s.legs[0]),
    ...corners(r.legF, s.legs[1]),
    ...corners(r.torsoB, { ...t, w: t.w / 2 }),
    ...corners(r.torsoF, { ...t, x: t.x + t.w / 2, w: t.w / 2 }),
  ]
  const head = apply(r.head, s.head)
  return {
    headTop: Math.min(...[-s.topW, s.topW].map((x) => apply(r.head, { x, y: s.top }).y)),
    head: { x: head.x, y: head.y, rx: s.head.rx, ry: s.head.ry },
    socketF: apply(r.torsoF, s.socket),
    socketB: apply(r.torsoB, { x: -s.socket.x, y: s.socket.y }),
    bodyBox: boundsOf(pts),
    upper: 7.5,
    fore: 7.5,
    armed: true,
    handR: 4.6,
  }
}

/** Moods whose back arm hangs at the side (the front hand holds the ball or wrings). */
const HANG = new Set<Frame['mood']>(['idle', 'watch', 'aim', 'worried'])
/** Back arm hang: out behind the hip, the forearm nearly straight down. */
const HANG_SB = -0.5
const HANG_EB = 0.25

/**
 * Arm reactions on the mood pose: fists up then a flex after the stomp on cheer and pump, raised on cast, a slow heavy
 * sway at rest; on KO the arms slump out over the rubble. Angles follow the lean (the arms draw in the kit's frame).
 */
function pose(_look: CreatureLook, f: Frame): Pose {
  const p = { ...f.pose }
  const shake = (ph: number) => (f.still ? 0 : 0.12 * Math.sin(f.t * 18 + ph))
  if (stompOf(f)) {
    const k = raiseOf(f)
    const flexed = afterOf(f) > 0 ? 1 : 0
    p.sF = lerp(0.55, 2.75, k) + shake(0) * flexed
    p.eF = lerp(1.9 * flexed + 0.3 * (1 - flexed), 0.3, k)
    p.sB = -lerp(0.55, 2.7, k) - shake(1) * flexed
    p.eB = -lerp(1.9 * flexed + 0.3 * (1 - flexed), 0.3, k)
  } else if (f.mood === 'cast') {
    p.sF = 2.3
    p.sB = -2.3
    p.eF = p.eB = 0.25
  } else if (HANG.has(f.mood) && !(f.mood === 'idle' && p.sB < -1.2)) {
    // A heavy back arm hangs relaxed just behind the hip, the fist clear of the torso (an idle wave or stretch, which
    // raise it up and back, still play). It sways with the breath.
    const s = f.still ? 0 : 0.08 * Math.sin(f.t * BREATH + 0.6)
    p.sB = HANG_SB - s
    p.eB = HANG_EB
    if (f.mood === 'idle' || f.mood === 'watch') p.sF += s
  }
  p.sF += p.lean
  p.sB += p.lean
  const c = smooth(clamp(f.pose.fall))
  if (c > 0) {
    p.sF = lerp(p.sF, 0.7, c)
    p.eF = lerp(p.eF, 0.6, c)
    p.sB = lerp(p.sB, -1.7, c)
    p.eB = lerp(p.eB, -0.3, c)
  }
  return p
}

/** Stomp sideways shake (cheer only) and Granite's rumble, in local forward units (the avatar applies facing). */
function offsetX(look: CreatureLook, f: Frame): number {
  if (f.still) return 0
  const rumble = look.signature === 'rumble' ? Math.sin(f.t * 70) * 0.8 * sigOf(f) : 0
  const after = afterOf(f)
  // Only the cheer stomp shakes: pumps come often in play and kick up dust alone.
  if (f.mood !== 'cheer' || after <= 0 || after >= 0.35) return rumble
  return rumble + Math.sin(after * 90) * 2.4 * (1 - after / 0.35)
}

/** A straight stone block from `a` to `b`, `w` wide, running a little past both ends. */
function slab(a: Pt, b: Pt, w: number): Path2D {
  const l = Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y))
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }
  const n = { x: -u.y * (w / 2), y: u.x * (w / 2) }
  const e = w * 0.2
  const p0 = { x: a.x - u.x * e, y: a.y - u.y * e }
  const p1 = { x: b.x + u.x * e, y: b.y + u.y * e }
  const p = new Path2D()
  p.moveTo(p0.x + n.x, p0.y + n.y)
  p.lineTo(p1.x + n.x, p1.y + n.y)
  p.lineTo(p1.x - n.x, p1.y - n.y)
  p.lineTo(p0.x - n.x, p0.y - n.y)
  p.closePath()
  return p
}

/** A chunky block arm: shoulder block, upper arm, elbow joint, forearm (one outline). */
function blockArm(ctx: Ctx, socket: Pt, h: HandPose, color: string): void {
  const elbow = { x: h.ex, y: h.ey }
  group(ctx, [
    { p: slab(elbow, h, ARM_W * 0.9), c: color, k: 0.5 },
    { p: slab(socket, elbow, ARM_W), c: color, k: 0.5 },
    { p: box(elbow.x - 3.6, elbow.y - 3.6, 7.2, 7.2, 2), c: darkOf(color), k: 0.4 },
    { p: box(socket.x - 5, socket.y - 5, 10, 10, 3), c: color, k: 0.8 },
  ])
}

/** A stone fist along the forearm, knuckle seams on its leading side; opens into a flat palm on the throw. */
function drawHand(ctx: Ctx, h: HandPose, look: CreatureLook, r: number): void {
  const a = Math.atan2(h.y - h.ey, h.x - h.ex)
  const len = r * (1.9 + 0.5 * h.open)
  const wid = r * (1.9 - 0.6 * h.open)
  ctx.save()
  ctx.translate(h.x, h.y)
  ctx.rotate(a)
  group(ctx, [
    {
      p: box(-len * 0.15, -wid * 0.5 - r * 0.45, r * 1.05, r * 0.85, r * 0.3),
      c: darkOf(look.hand),
      k: 0.3,
      lw: 0,
    },
    { p: box(-len / 2, -wid / 2, len, wid, r * 0.45), c: look.hand, k: 0.6 },
  ])
  // Knuckle seams across the fist's front.
  ctx.strokeStyle = darkOf(look.hand)
  ctx.lineWidth = 1.1
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const y of [-wid / 6, wid / 6]) {
    ctx.moveTo(len * 0.18, y)
    ctx.lineTo(len / 2 - 0.6, y)
  }
  ctx.stroke()
  ctx.restore()
}

/** Thin mortar seams between the stones. */
function seam(ctx: Ctx, color: string, pts: Array<[number, number, number, number]>): void {
  ctx.strokeStyle = darkOf(color)
  ctx.lineWidth = 1.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const [x1, y1, x2, y2] of pts) {
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  ctx.stroke()
}

/** Dust puffs and pebbles thrown up by the stomp (feet frame). */
function stompDust(ctx: Ctx, f: Frame): void {
  const after = afterOf(f)
  if (f.still || after <= 0 || after >= 0.8) return
  const amp = stompOf(f)?.amp ?? 0
  const k = after / 0.8
  for (const side of [-1, 1]) {
    ctx.fillStyle = `rgb(205 205 220 / ${0.55 * (1 - k)})`
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(
        side * (14 + i * 6 + k * 16),
        -2 - i * 2 - k * 6,
        (3 + i + k * 4) * (0.6 + 0.4 * amp),
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }
    for (let i = 0; i < 2; i++) {
      const v = 26 + i * 10
      const x = side * (12 + v * after)
      const y = -4 - 34 * after * amp + 90 * after * after
      if (y < 2) paint(ctx, { p: box(x - 1.5, y - 1.5, 3, 3, 0.6), c: PEBBLE, k: 0, lw: 1 })
    }
  }
}

/** Hurt: stone chips (or, for lava, glowing embers) fly up off the front shoulder and tumble. */
function chips(ctx: Ctx, look: CreatureLook, f: Frame, at: Pt, embers: boolean): void {
  const a = f.moodAge
  if (f.still || f.mood !== 'hurt' || a >= 0.6) return
  ctx.save()
  ctx.globalAlpha = clamp(1.5 - a * 2.5)
  for (let i = 0; i < (embers ? 7 : 4); i++) {
    const ang = -2.3 + (i % 4) * 0.5 - (i >> 2) * 0.25
    const v = 40 + (i % 2) * 14
    const x = at.x + Math.cos(ang) * v * a
    const y = at.y - 4 + Math.sin(ang) * v * a + 110 * a * a
    const s = 2.6 - (i % 2) * 0.8
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a * (8 + i * 3))
    if (embers) {
      ctx.shadowColor = look.second
      ctx.shadowBlur = 5
      paint(ctx, { p: ell(0, 0, s * 0.6, s * 0.6), c: i % 2 ? '#ffe066' : look.second, k: 0, lw: 0 })
    } else
      paint(ctx, { p: box(-s / 2, -s / 2, s, s, 0.5), c: i % 2 ? darkOf(look.main) : look.main, k: 0, lw: 1 })
    ctx.restore()
  }
  ctx.restore()
}

/** The scarf tail: flaps in waves behind the neck, harder after a stomp, whipping on the signature gust. */
function scarfTail(ctx: Ctx, { look, f, t }: GolemPaint): void {
  const after = afterOf(f)
  const gust = (!f.still && after > 0 && after < 0.6 ? 1 - after / 0.6 : 0) + 1.6 * sigOf(f)
  const f1 = Math.sin(t * 6) * (2 + gust * 3)
  const f2 = Math.sin(t * 6 - 1.2) * (2.5 + gust * 4)
  // Whipping: the tail streams out longer and higher.
  const reach = 30 + gust * 6
  const y = HY + 12
  group(ctx, [
    {
      p: new Path2D(
        `M-10 ${y} C-17 ${y - 2 + f1 * 0.4} ${-22 - gust * 2} ${y - 3 + f1 - gust * 2} ${-reach} ${y - 6 + f2 - gust * 4} ` +
          `C${-reach + 2} ${y - 1 + f2 - gust * 3} -23 ${y + 3 + f1 * 0.5} -12 ${y + 5} Z`,
      ),
      c: mix(look.second, OUTLINE, 0.15),
    },
  ])
}

/** The crenellated castle head: stones, the visor with its slit eyes, and the helmet. */
function castleHead(ctx: Ctx, { look, f, k, stone, t }: GolemPaint): void {
  const castle = new Path2D(
    `M${-HEAD_W} ${HY + 11} L${-HEAD_W} ${HEAD_TOP} L-7 ${HEAD_TOP} L-7 ${HY - 7} L7 ${HY - 7} L7 ${HEAD_TOP} ` +
      `L${HEAD_W} ${HEAD_TOP} L${HEAD_W} ${HY + 11} Z`,
  )
  group(ctx, [{ p: castle, c: stone, k: 1.1 }])
  seam(ctx, stone, [
    [-HEAD_W, HY - 3.5, HEAD_W, HY - 3.5],
    [-HEAD_W, HY + 3, -6.5, HY + 3],
    [8, HY + 3, HEAD_W, HY + 3],
  ])
  gloss(ctx, -9.5, HEAD_TOP + 2.5, 1.5, 1, -0.3)
  k.hat(SHAPES.brick.hat)

  const visor = box(-6.5, HY - 2, 14.5, 8.5, 3.2)
  paint(ctx, { p: visor, c: VISOR, k: 0, inner: true, lw: 1.5 })
  ctx.save()
  ctx.clip(visor)
  eyes(ctx, look, f, t)
  ctx.restore()
}

/** The scarf band round the neck, the knot's flap hanging on the chest, and the badge pulsing gold on it. */
function scarfBand(ctx: Ctx, { look, k, t }: GolemPaint): void {
  group(ctx, [{ p: box(-14, HY + 9, 28, 6.5, 3.2), c: look.second }])
  const flap = new Path2D(
    `M-1 ${HY + 14} L9 ${HY + 14} L9 ${HY + 20} Q9 ${HY + 25} 4 ${HY + 27} Q-1 ${HY + 25} -1 ${HY + 20} Z`,
  )
  paint(ctx, { p: flap, c: look.second, k: 0.5, lw: 1.5 })
  gloss(ctx, -8, HY + 10.6, 2.4, 0.9, 0)
  // The badge: a gold-rimmed shield plate with the hero's emblem.
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4)
  const bx = 4
  const by = HY + 19.5
  ctx.save()
  ctx.shadowColor = GOLD
  ctx.shadowBlur = 3 + 4 * pulse
  paint(ctx, { p: box(bx - 4, by - 4, 8, 8.5, [2, 2, 4, 4]), c: GOLD, k: 0.3, lw: 1.3 })
  ctx.restore()
  paint(ctx, { p: box(bx - 2.8, by - 2.8, 5.6, 6, [1.4, 1.4, 3, 3]), c: lightOf(look.second), k: 0, lw: 0 })
  k.emblem(bx, by + 0.2, 6)
}

/** Slit eyes (in a visor or glowing on rock): glance around, arcs when happy, x's on KO, chevrons on a flinch. */
function eyes(ctx: Ctx, look: CreatureLook, f: Frame, t: number, y = HY + 2.2): void {
  const c = f.mood === 'hurt' && f.moodAge < 0.2 ? '#ff6b6b' : look.eye
  const ex = [-2.4, 4.2]
  ctx.fillStyle = c
  ctx.strokeStyle = c
  ctx.lineCap = 'round'
  ctx.shadowColor = c
  ctx.shadowBlur = 3
  if (happy(f)) {
    for (const x of ex) happyEye(ctx, x, y + 1, 2.4, c, 2.2)
  } else if (f.eyes === 'xx') {
    ctx.lineWidth = 1.7
    ctx.beginPath()
    for (const x of ex) {
      ctx.moveTo(x - 2, y - 2)
      ctx.lineTo(x + 2, y + 2)
      ctx.moveTo(x + 2, y - 2)
      ctx.lineTo(x - 2, y + 2)
    }
    ctx.stroke()
  } else if (f.eyes === 'squeeze') {
    ctx.lineWidth = 1.8
    ctx.beginPath()
    for (const [x, d] of [
      [ex[0], 1],
      [ex[1], -1],
    ]) {
      ctx.moveTo(x - 1.8 * d, y - 2.4)
      ctx.lineTo(x + 1.8 * d, y)
      ctx.lineTo(x - 1.8 * d, y + 2.4)
    }
    ctx.stroke()
  } else {
    const lx = f.lookX * 1 + (f.still ? 0 : wander(t, 5) * 1.1)
    const ly = f.lookY * 0.8
    if (f.blink > 0 || f.pose.eyeOpen < 0.2) {
      for (const x of ex) ctx.fillRect(x - 1.5 + lx, y, 3, 1.4)
    } else {
      const wide = f.eyes === 'wide' ? 1.25 : 1
      const h = 5 * wide * Math.max(0.4, Math.min(1, f.pose.eyeOpen))
      ctx.beginPath()
      for (const x of ex) ctx.roundRect(x - 1.5 * wide + lx, y + 0.5 - h / 2 + ly, 3 * wide, h, 1.5 * wide)
      ctx.fill()
    }
  }
  ctx.shadowBlur = 0
}

/** Bastion's torso: one block standing, two halves once it crumbles, with mortar seams. */
const brickTorso = (half: -1 | 0 | 1) =>
  half === 0
    ? box(TORSO.x, TORSO.y, TORSO.w, TORSO.h, 4.5)
    : half < 0
      ? box(TORSO.x, TORSO.y, TORSO.w / 2, TORSO.h, [4.5, 1, 1, 4.5])
      : box(0, TORSO.y, TORSO.w / 2, TORSO.h, [1, 4.5, 4.5, 1])

function brickDetail(ctx: Ctx, { stone }: GolemPaint): void {
  seam(ctx, stone, [
    [TORSO.x, -20, -TORSO.x, -20],
    [0, TORSO.y, 0, -20],
    [-6.5, -20, -6.5, -9],
    [6.5, -20, 6.5, -9],
  ])
}

/** Bram: one round boulder (it never splits). */
const BOULDER = { x: 0, y: -24, rx: 21, ry: 20 }
const boulderTorso = () => ell(BOULDER.x, BOULDER.y, BOULDER.rx, BOULDER.ry)

/** Speckles, a crack, and the moss cap with grass tufts. */
function boulderDetail(ctx: Ctx, { look, stone }: GolemPaint): void {
  ctx.fillStyle = darkOf(stone)
  for (const [x, y, r] of [
    [-12, -18, 1.3],
    [9, -11, 1.1],
    [-4, -9, 0.9],
    [14, -22, 0.8],
    [-16, -27, 0.8],
  ]) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
  }
  seam(ctx, stone, [
    [-15, -12, -10, -15],
    [-10, -15, -11, -19],
  ])
  paint(ctx, {
    p: new Path2D('M-24 -33 Q-17 -38 -11 -34 Q-5 -40 1 -36 Q8 -41 13 -35 Q19 -38 24 -31 L24 -50 L-24 -50 Z'),
    c: look.second,
    k: 0.6,
    lw: 1.4,
  })
}

/** Bram's face, on the rock: friendly dot eyes, thick brows, a smile; a slow big yawn on its signature. */
function boulderFace(ctx: Ctx, { f, k, t, s }: GolemPaint): void {
  const y = s.hy
  const yawn = sigOf(f)
  const ex = [-5.5, 5.5]
  const lx = f.lookX * 1 + (f.still ? 0 : wander(t, 5) * 0.8)
  const ly = f.lookY * 0.8
  ctx.lineCap = 'round'
  if (happy(f)) for (const x of ex) happyEye(ctx, x, y + 1, 2.6)
  else if (f.eyes === 'xx') {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 2
    ctx.beginPath()
    for (const x of ex) {
      ctx.moveTo(x - 2.2, y - 2.2)
      ctx.lineTo(x + 2.2, y + 2.2)
      ctx.moveTo(x + 2.2, y - 2.2)
      ctx.lineTo(x - 2.2, y + 2.2)
    }
    ctx.stroke()
  } else if (f.eyes === 'squeeze') {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 2.2
    ctx.beginPath()
    for (const [x, d] of [
      [ex[0], 1],
      [ex[1], -1],
    ]) {
      ctx.moveTo(x - 2.2 * d, y - 2.4)
      ctx.lineTo(x + 2 * d, y)
      ctx.lineTo(x - 2.2 * d, y + 2.4)
    }
    ctx.stroke()
  } else {
    const wide = f.eyes === 'wide' ? 1.3 : 1
    const shut = f.blink > 0 || f.pose.eyeOpen < 0.2 || yawn > 0.4
    const open = Math.max(0.35, Math.min(1, f.pose.eyeOpen)) * (1 - 0.6 * yawn)
    for (const x of ex) dotEye(ctx, x, y, 2.2 * wide, 2.8 * wide * open, shut, lx, ly)
  }
  // Heavy brows: a calm slope, up when worried or yawning.
  if (f.eyes !== 'xx') {
    const up = f.pose.browUp * 1.4 + yawn * 1.5
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 2.6
    ctx.beginPath()
    ctx.moveTo(-8.5, y - 5 - up)
    ctx.lineTo(-3, y - 5.5 - up + f.pose.brow)
    ctx.moveTo(8.5, y - 5 - up)
    ctx.lineTo(3, y - 5.5 - up + f.pose.brow)
    ctx.stroke()
  }
  const my = y + 6
  if (yawn > 0.05) openMouth(ctx, 0.5, my - 1, 2.5 + 1.5 * yawn, 2 + 6 * yawn)
  else if (happy(f)) openMouth(ctx, 0.5, my - 0.5, 4.2, 4.5)
  else {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 1.8
    ctx.beginPath()
    if (f.pose.smile < 0) ctx.arc(0.5, my + 3, 3, 1.2 * Math.PI, 1.8 * Math.PI)
    else if (f.pose.mouthOpen > 0.45) ctx.ellipse(0.5, my + 1, 2, 1.2 + 1.6 * f.pose.mouthOpen, 0, 0, TAU)
    else ctx.arc(0.5, my - 1.5, 3.4, 0.2 * Math.PI, 0.8 * Math.PI)
    ctx.stroke()
  }
  k.hat(s.hat)
}

/** Granite's torso: a wide-based trapezoid (halves once it crumbles). */
function mountainTorso(half: -1 | 0 | 1): Path2D {
  const pts =
    half === 0
      ? [-16, -9, -11, -34, 11, -34, 16, -9]
      : half < 0
        ? [-16, -9, -11, -34, 0, -34, 0, -9]
        : [0, -9, 0, -34, 11, -34, 16, -9]
  return new Path2D(`M${pts[0]} ${pts[1]} L${pts[2]} ${pts[3]} L${pts[4]} ${pts[5]} L${pts[6]} ${pts[7]} Z`)
}

function mountainDetail(ctx: Ctx, { stone }: GolemPaint): void {
  seam(ctx, stone, [
    [-15, -18, -3, -20],
    [-3, -20, 4, -17],
    [4, -17, 15, -19],
    [-12, -27, -2, -28],
    [5, -29, 12, -27],
  ])
}

const PEAK = 'M-14 -31 L-12 -41 L-5 -51 Q1 -60 7 -51 L12 -41 L14 -31 Z'

/** Granite's head: a rocky peak under a snow cap, deep-set glowing eyes, a stern mouth. */
function peakHead(ctx: Ctx, { look, f, k, t, stone, s }: GolemPaint): void {
  const peak = new Path2D(PEAK)
  group(ctx, [{ p: peak, c: stone, k: 1.1 }])
  ctx.save()
  ctx.clip(peak)
  paint(ctx, {
    p: new Path2D(
      'M-20 -40 L-14 -36 L-11 -41 L-6 -46.5 L0 -42 L5 -46 L10 -41.5 L14 -36 L20 -40 L20 -70 L-20 -70 Z',
    ),
    c: look.second,
    k: 0.5,
    lw: 1.4,
  })
  seam(ctx, stone, [
    [-13, -35, -8, -36],
    [9, -36, 13, -34],
  ])
  ctx.restore()
  gloss(ctx, -3.5, -53, 1.6, 0.9, -0.6)
  const recess = box(-8, s.hy - 4, 16.5, 7.5, 3.5)
  paint(ctx, { p: recess, c: VISOR, k: 0, inner: true, lw: 1.5 })
  ctx.save()
  ctx.clip(recess)
  eyes(ctx, look, f, t, s.hy - 0.5)
  ctx.restore()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (happy(f)) ctx.arc(1, s.hy + 3, 3, 0.15 * Math.PI, 0.85 * Math.PI)
  else if (f.pose.smile < 0 || f.eyes === 'xx') ctx.arc(1, s.hy + 7.5, 2.6, 1.2 * Math.PI, 1.8 * Math.PI)
  else {
    ctx.moveTo(-1.5, s.hy + 5.5)
    ctx.lineTo(3.5, s.hy + 5.5)
  }
  ctx.stroke()
  k.hat(s.hat)
}

/** Grakka's torso: a rough basalt block (halves once it crumbles). */
const LAVA = { x: -12, y: -30, w: 24, h: 21 }
const lavaTorso = (half: -1 | 0 | 1) =>
  half === 0
    ? box(LAVA.x, LAVA.y, LAVA.w, LAVA.h, 7)
    : half < 0
      ? box(LAVA.x, LAVA.y, LAVA.w / 2, LAVA.h, [7, 1, 1, 7])
      : box(0, LAVA.y, LAVA.w / 2, LAVA.h, [1, 7, 7, 1])

/** The glow colour at `heat`: the lava colour itself when hot, cooling to dark rock. */
const glowOf = (look: CreatureLook, heat: number) =>
  heat >= 1 ? look.second : mix('#3b2a33', look.second, heat)

/** Glowing cracks: a dark seam with a bright core that pulses (blur only while hot). */
function cracks(ctx: Ctx, look: CreatureLook, heat: number, d: string): void {
  const p = new Path2D(d)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 3
  ctx.stroke(p)
  ctx.save()
  ctx.shadowColor = look.second
  ctx.shadowBlur = 6 * heat
  ctx.strokeStyle = glowOf(look, Math.min(1, heat))
  ctx.lineWidth = 1.6
  ctx.stroke(p)
  ctx.restore()
}

function lavaDetail(ctx: Ctx, { look, heat }: GolemPaint): void {
  cracks(ctx, look, heat, 'M-9 -27 L-5 -22 L-7 -16 L-3 -12 M5 -29 L3 -23 L8 -18 L6 -12 M-1 -19 L2 -16')
}

/** Grakka's head: a lumpy lava rock with glowing cracks, glowing eyes and a glowing grin. */
function impHead(ctx: Ctx, { look, f, k, t, stone, s, heat }: GolemPaint): void {
  const y = s.hy
  const rock = new Path2D(
    `M-12 ${y + 4} Q-14 ${y - 6} -6 ${y - 10} Q0 ${y - 13} 7 ${y - 10} Q13 ${y - 7} 12 ${y + 2} ` +
      `Q12 ${y + 10} 1 ${y + 10} Q-11 ${y + 11} -12 ${y + 4} Z`,
  )
  group(ctx, [{ p: rock, c: stone, k: 1.1 }])
  ctx.save()
  ctx.clip(rock)
  cracks(ctx, look, heat, `M-10 ${y - 4} L-6 ${y - 6} L-5 ${y - 10} M8 ${y + 4} L11 ${y + 7}`)
  ctx.restore()
  gloss(ctx, -6, y - 7, 2, 1, -0.5)
  eyes(ctx, { ...look, eye: heat > 0.2 ? look.eye : '#8a7a80' }, f, t, y - 1)
  // The grin: a jagged glowing mouth (cools dark on KO).
  const w = happy(f) ? 5 : 3.8
  const h = happy(f) ? 4 : f.pose.smile < 0 ? 1.6 : 2.6
  const grin = new Path2D(
    `M${0.5 - w} ${y + 4} L${0.5 + w} ${y + 4} Q${0.5 + w * 0.7} ${y + 4 + h} 0.5 ${y + 4 + h} ` +
      `Q${0.5 - w * 0.7} ${y + 4 + h} ${0.5 - w} ${y + 4} Z`,
  )
  ctx.save()
  ctx.shadowColor = look.second
  ctx.shadowBlur = 5 * heat
  paint(ctx, { p: grin, c: glowOf(look, heat), k: 0, lw: 1.5 })
  ctx.restore()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.2
  ctx.beginPath()
  for (const x of [-1.5, 2.5]) {
    ctx.moveTo(x, y + 4)
    ctx.lineTo(x + 0.6, y + 5.6)
  }
  ctx.stroke()
  k.hat(s.hat)
}

/** Lava heat: a slow pulse (brighter on cheer and cast), cooling to nothing as it goes down. */
function heatOf(f: Frame): number {
  const pulse = f.still ? 0.8 : 0.7 + 0.3 * Math.sin(f.t * 2.6)
  const flare = flourish(f).k * 0.6 + (f.mood === 'cast' ? 0.4 : 0)
  return Math.max(0, (pulse + flare) * (1 - smooth(clamp(f.pose.fall))))
}

/** Soft white puffs (steam, snow) rising from `at` over the 0..1 `k`. */
function puffs(ctx: Ctx, at: Pt, k: number, n: number, spread: number, color: string): void {
  if (k <= 0) return
  for (let i = 0; i < n; i++) {
    const q = (k + i / n) % 1
    ctx.fillStyle = `rgb(${color} / ${0.75 * Math.sin(Math.PI * q) * Math.min(1, k * 3)})`
    ctx.beginPath()
    ctx.arc(at.x + Math.sin(i * 2.1 + q * 4) * spread, at.y - q * 16, 1.8 + q * 3.5, 0, TAU)
    ctx.fill()
  }
}

/** Bastion: its stomp and the hurt chips are enough. */
function brickFx(): void {}

/** Bram: a flower pops up on the moss on a cheer (a smaller one on a pump) and folds away again. */
function boulderFx(ctx: Ctx, { f }: GolemPaint, r: Rig): void {
  const fl = flourish(f)
  const end = fl.cheer ? 1.4 : 0.6
  if (f.still || (f.mood !== 'cheer' && f.mood !== 'pump') || fl.age >= end) return
  const s = easeOut(fl.age / 0.25) * clamp((end - fl.age) / 0.3) * (fl.cheer ? 1 : 0.6)
  const at = apply(r.torsoF, { x: 4, y: -43 })
  const top = { x: at.x, y: at.y - 7 * s }
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(at.x, at.y + 2)
  ctx.lineTo(top.x, top.y)
  ctx.stroke()
  ctx.strokeStyle = '#2f9e44'
  ctx.lineWidth = 1.4
  ctx.stroke()
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + fl.age * 2
    paint(ctx, {
      p: ell(top.x + Math.cos(a) * 3 * s, top.y + Math.sin(a) * 3 * s, 2.3 * s, 2.3 * s),
      c: '#ffc9de',
      k: 0,
      lw: 1.1,
    })
  }
  paint(ctx, { p: ell(top.x, top.y, 1.7 * s, 1.7 * s), c: '#ffd43b', k: 0, lw: 1.1 })
}

/** Granite: snow bursts off the peak on a cheer; pebbles tumble down its sides on the rumble. */
function mountainFx(ctx: Ctx, { f }: GolemPaint, r: Rig): void {
  const peak = apply(r.head, { x: 1, y: -56 })
  const fl = flourish(f)
  if (fl.k > 0) puffs(ctx, peak, clamp(fl.age * 1.4), 6, 7 * fl.k + 2, '248 251 255')
  const sig = sigOf(f)
  if (sig <= 0) return
  for (let i = 0; i < 3; i++) {
    const q = (clamp(f.fidget) * 2 + i / 3) % 1
    const side = i % 2 ? 1 : -1
    const p = apply(r.torsoF, { x: side * (8 + q * 9), y: -36 + q * 30 })
    paint(ctx, { p: box(p.x - 1.5, p.y - 1.5, 3, 3, 0.6), c: PEBBLE, k: 0, lw: 1 })
  }
}

/** Grakka: steam on its signature; sparks burst off the shoulders on a cheer. */
function lavaFx(ctx: Ctx, { look, f }: GolemPaint, r: Rig): void {
  const sig = sigOf(f)
  if (sig > 0) {
    puffs(ctx, apply(r.head, { x: -3, y: -50 }), clamp(f.fidget), 5, 3, '240 240 245')
    puffs(ctx, apply(r.torsoB, { x: -9, y: -31 }), clamp(f.fidget * 1.3), 3, 2, '240 240 245')
  }
  const fl = flourish(f)
  if (fl.k <= 0.05) return
  ctx.save()
  ctx.shadowColor = look.second
  ctx.shadowBlur = 6
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1
    const at = apply(r.torsoF, { x: side * 10, y: -30 })
    const a = -Math.PI / 2 + side * (0.3 + (i % 4) * 0.25)
    const d = 4 + fl.age * (30 + (i % 3) * 8)
    const y = at.y + Math.sin(a) * d + 40 * fl.age * fl.age
    ctx.fillStyle = i % 3 ? look.second : '#ffe066'
    ctx.globalAlpha = fl.k
    ctx.fillRect(at.x + Math.cos(a) * d - 0.8, y - 0.8, 1.6, 1.6)
  }
  ctx.restore()
}

const SHAPES: Record<Variant, Shape> = {
  brick: {
    neck: { x: 0, y: -31 },
    hy: HY,
    top: HEAD_TOP,
    topW: HEAD_W,
    head: { x: 0, y: HY + 1.5, rx: 13, ry: 11 },
    // The helmet sits on the head between the corner merlons, its brim just above the visor.
    hat: { x: 0, y: HY - 4.4, rx: 7.5, ry: 6 },
    torso: TORSO,
    socket: { x: 11.5, y: -26 },
    legs: [
      { x: -12, y: -10, w: 10, h: 10 },
      { x: 2, y: -10, w: 10, h: 10 },
    ],
    ko: 'crumble',
    torsoPath: brickTorso,
    torsoDetail: brickDetail,
    headPaint: castleHead,
    behind: scarfTail,
    neckPaint: scarfBand,
    fx: brickFx,
  },
  boulder: {
    neck: { x: 0, y: -26 },
    hy: -30,
    top: -44.5,
    topW: 6,
    head: { x: 0, y: -28, rx: 12, ry: 10 },
    hat: { x: 0, y: -40, rx: 11, ry: 7 },
    torso: { x: -BOULDER.rx, y: BOULDER.y - BOULDER.ry, w: BOULDER.rx * 2, h: BOULDER.ry * 2 },
    socket: { x: 17, y: -23 },
    legs: [
      { x: -13, y: -7, w: 10, h: 7 },
      { x: 3, y: -7, w: 10, h: 7 },
    ],
    ko: 'roll',
    torsoPath: boulderTorso,
    torsoDetail: boulderDetail,
    headPaint: boulderFace,
    emblem: { x: 9, y: -14, size: 6 },
    fx: boulderFx,
  },
  mountain: {
    neck: { x: 0, y: -33 },
    hy: -37.5,
    top: -56.5,
    topW: 2,
    head: { x: 0, y: -42, rx: 13, ry: 12 },
    hat: { x: 1, y: -50, rx: 6.5, ry: 5 },
    torso: { x: -16, y: -34, w: 32, h: 25 },
    socket: { x: 13, y: -28 },
    legs: [
      { x: -14, y: -10, w: 12, h: 10 },
      { x: 2, y: -10, w: 12, h: 10 },
    ],
    ko: 'crumble',
    torsoPath: mountainTorso,
    torsoDetail: mountainDetail,
    headPaint: peakHead,
    emblem: { x: 4, y: -21, size: 7 },
    fx: mountainFx,
  },
  lava: {
    neck: { x: 0, y: -30 },
    hy: -40,
    top: -53,
    topW: 6,
    head: { x: 0, y: -40, rx: 12.5, ry: 11 },
    hat: { x: 0.5, y: -45, rx: 9.5, ry: 6.5 },
    torso: LAVA,
    socket: { x: 11, y: -25 },
    legs: [
      { x: -11, y: -9.5, w: 9, h: 9.5 },
      { x: 2, y: -9.5, w: 9, h: 9.5 },
    ],
    ko: 'crumble',
    torsoPath: lavaTorso,
    torsoDetail: lavaDetail,
    headPaint: impHead,
    emblem: { x: 3, y: -15, size: 6 },
    fx: lavaFx,
  },
}
const shapeOf = (look: CreatureLook): Shape =>
  SHAPES[Object.hasOwn(SHAPES, look.variant) ? (look.variant as Variant) : 'brick']

function draw(ctx: Ctx, look: CreatureLook, f: Frame, k: DrawKit): void {
  const s = shapeOf(look)
  const r = rigOf(f, s)
  const m = k.metrics
  const t = f.still ? 0 : f.t
  // A dark flash on the hurt flinch.
  const flash = !f.still && f.mood === 'hurt' && f.moodAge < 0.25 ? 0.5 * (1 - f.moodAge / 0.25) : 0
  const stone = flash ? mix(look.main, '#2a1e2e', flash) : look.main
  const p: GolemPaint = { look, f, k, t, stone, s, heat: look.variant === 'lava' ? heatOf(f) : 0 }

  stompDust(ctx, f)
  if (s.behind) {
    ctx.save()
    along(ctx, r.neck)
    s.behind(ctx, p)
    ctx.restore()
  }

  // Back arm and fist behind everything.
  blockArm(ctx, m.socketB, k.hands.back, darkOf(stone))
  k.backHand()

  // Legs: stone blocks (the back one in shade).
  for (const [mat, leg, c] of [
    [r.legB, s.legs[0], darkOf(stone)],
    [r.legF, s.legs[1], stone],
  ] as const) {
    ctx.save()
    along(ctx, mat)
    group(ctx, [{ p: box(leg.x, leg.y, leg.w, leg.h, Math.min(leg.h / 2, 3.5)), c }])
    ctx.restore()
  }

  // Torso: one piece standing (or rolling), two halves once it crumbles.
  const halves: Array<[Mat, Path2D]> =
    r.crumble > 0 && s.ko === 'crumble'
      ? [
          [r.torsoB, s.torsoPath(-1)],
          [r.torsoF, s.torsoPath(1)],
        ]
      : [[r.torsoF, s.torsoPath(0)]]
  for (const [mat, path] of halves) {
    ctx.save()
    along(ctx, mat)
    group(ctx, [{ p: path, c: stone }])
    ctx.save()
    ctx.clip(path)
    s.torsoDetail(ctx, p)
    ctx.restore()
    gloss(ctx, s.torso.x + 4.5, s.torso.y + 3.5, 2.2, 1.1, -0.3)
    if (s.emblem && path === halves[halves.length - 1][1]) k.emblem(s.emblem.x, s.emblem.y, s.emblem.size)
    ctx.restore()
  }

  ctx.save()
  along(ctx, r.head)
  s.headPaint(ctx, p)
  ctx.restore()
  if (s.neckPaint) {
    ctx.save()
    along(ctx, r.neck)
    s.neckPaint(ctx, p)
    ctx.restore()
  }

  // Front arm and fist (with the held ball) in front.
  blockArm(ctx, m.socketF, k.hands.front, stone)
  k.frontHand()
  chips(ctx, look, f, m.socketF, look.variant === 'lava')
  s.fx(ctx, p, r)
  if (happy(f)) ticks(ctx, 17, m.headTop - 8, f.moodAge)
}

export const golem: BodyType = { metrics, draw, drawHand, offsetX, pose }
