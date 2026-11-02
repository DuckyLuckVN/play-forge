/**
 * Bastion the brick golem: stone blocks with seams on stubby block legs, a crenellated castle head with a dark visor
 * (white slit eyes that glance around), a blue scarf whose tail flaps in waves, and a badge on the scarf knot that
 * pulses gold. Chunky block arms run from the shoulder sockets to fist hands. It breathes heavily, the head a beat
 * behind the shoulders; on cheer it throws its fists up and stomps (shake, dust, pebbles), chips fly off the shoulder
 * when hurt, and on KO it crumbles into five blocks that settle in a pile.
 */
import type { Pose } from '../../hero-avatar'
import {
  OUTLINE,
  box,
  clamp,
  darkOf,
  easeOut,
  gloss,
  group,
  happy,
  happyEye,
  lightOf,
  look as wander,
  mix,
  paint,
  smooth,
  ticks,
} from '../paint'
import type { BodyMetrics, BodyType, CreatureLook, DrawKit, Frame, HandPose, HeadBox } from '../types'

type Ctx = CanvasRenderingContext2D
interface Pt {
  x: number
  y: number
}

const GOLD = '#ffc531'
const VISOR = '#16182a'
const PEBBLE = '#9aa0ad'

/** Body geometry, local units (feet at 0, facing +x, up is −y). */
const HIP_Y = -10
const NECK = { x: 0, y: -31 }
/** The visor line: the head runs from HY − 7 to HY + 11, its merlons up to HY − 11.5. */
const HY = -41
const HEAD_TOP = HY - 11.5
const HEAD_W = 12
const SOCKET = { x: 11.5, y: -26 }
/** Clearance box for the hand solver: the head and its merlons. */
const HEAD: HeadBox = { x: 0, y: HY + 1.5, rx: 13, ry: 11 }
/** The helmet sits on the head between the corner merlons, its brim just above the visor. */
const HAT_BOX: HeadBox = { x: 0, y: HY - 4.4, rx: 7.5, ry: 6 }
const TORSO = { x: -13, y: -31, w: 26, h: 22 }
const ARM_W = 7
/** Breathing: rate (rad/s), shoulder rise, and how far behind the head follows (rad). */
const BREATH = 1.6
const BREATH_AMP = 1.1
const HEAD_LAG = 0.9

/** A 2D affine [a b c d e f]: (x, y) → (a·x + c·y + e, b·x + d·y + f). Pure, so the metrics match the drawing. */
type Mat = readonly [number, number, number, number, number, number]
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
]
const move = (x: number, y: number): Mat => [1, 0, 0, 1, x, y]
const turnAbout = (o: Pt, a: number): Mat =>
  mul(move(o.x, o.y), mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0], move(-o.x, -o.y)))
const apply = (m: Mat, p: Pt): Pt => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
})
const along = (ctx: Ctx, m: Mat) => ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5])

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

/** The five blocks a KO crumbles into: their standing centre, where they settle, their spin and how high they tumble. */
interface Block {
  from: Pt
  to: Pt
  spin: number
  lift: number
}
// The pile: back leg and back torso half on the ground behind, the front leg tumbled onto it, the front half leaning
// on it, and the head rolled off in front onto its back, its scarf draped over the pile, so every block shows.
const LEG_B: Block = { from: { x: -7, y: -5 }, to: { x: -22, y: -5 }, spin: -Math.PI / 2, lift: 6 }
const LEG_F: Block = { from: { x: 7, y: -5 }, to: { x: -9, y: -18 }, spin: 0.5, lift: 10 }
const TORSO_B: Block = { from: { x: -6.5, y: -20 }, to: { x: -10, y: -6.5 }, spin: -Math.PI / 2, lift: 9 }
const TORSO_F: Block = { from: { x: 6.5, y: -20 }, to: { x: 4, y: -12.5 }, spin: 0.35, lift: 8 }
const HEAD_B: Block = { from: { x: 0, y: -39 }, to: { x: 13, y: -12 }, spin: Math.PI / 2, lift: 14 }

/** Every part's transform for this frame (local units → the kit's frame). */
interface Rig {
  legB: Mat
  legF: Mat
  torsoB: Mat
  torsoF: Mat
  /** The neck (scarf band and badge): follows the breath a beat late, without the head's tilt. */
  neck: Mat
  head: Mat
  /** 0..1 how far the KO crumble has gone. */
  crumble: number
}

const breathOf = (f: Frame, lag = 0) => (f.still ? 0 : -Math.sin(f.t * BREATH - lag) * BREATH_AMP)

/** Head tilt on the neck: a heavy head turns only part of the pose's tilt, plus a slow sway (a happy wobble on cheer). */
const tiltOf = (f: Frame) =>
  f.pose.tilt * 0.6 + (f.still ? 0 : happy(f) ? Math.sin(f.t * 12) * 0.08 : Math.sin(f.t * 0.9) * 0.04)

function rigOf(f: Frame): Rig {
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
  const head = mul(neck, turnAbout(NECK, tiltOf(f)))
  const c = smooth(clamp(f.pose.fall))
  // Settling: a little rock as the blocks land.
  const ko = f.mood === 'ko' && !f.still ? f.moodAge - 0.45 : -1
  const rock = ko > 0 && ko < 0.5 ? Math.sin(ko * 30) * 0.08 * (1 - ko / 0.5) : 0
  const fall = (b: Block, m: Mat): Mat =>
    c <= 0
      ? m
      : mul(
          move(c * (b.to.x - b.from.x), c * (b.to.y - b.from.y) - Math.sin(Math.PI * c) * b.lift),
          mul(turnAbout(b.from, c * b.spin + rock), m),
        )
  return {
    legB: fall(LEG_B, squash),
    legF: fall(LEG_F, squash),
    torsoB: fall(TORSO_B, upper),
    torsoF: fall(TORSO_F, upper),
    neck: fall(HEAD_B, neck),
    head: fall(HEAD_B, head),
    crumble: c,
  }
}

const corners = (m: Mat, x: number, y: number, w: number, h: number) =>
  [
    { x, y },
    { x: x + w, y },
    { x, y: y + h },
    { x: x + w, y: y + h },
  ].map((p) => apply(m, p))

function metrics(_look: CreatureLook, f: Frame): BodyMetrics {
  const r = rigOf(f)
  const pts = [
    ...corners(r.legB, -12, -10, 10, 10),
    ...corners(r.legF, 2, -10, 10, 10),
    ...corners(r.torsoB, TORSO.x, TORSO.y, TORSO.w / 2, TORSO.h),
    ...corners(r.torsoF, 0, TORSO.y, TORSO.w / 2, TORSO.h),
  ]
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const head = apply(r.head, HEAD)
  return {
    headTop: Math.min(...[-HEAD_W, HEAD_W].map((x) => apply(r.head, { x, y: HEAD_TOP }).y)),
    head: { x: head.x, y: head.y, rx: HEAD.rx, ry: HEAD.ry },
    socketF: apply(r.torsoF, SOCKET),
    socketB: apply(r.torsoB, { x: -SOCKET.x, y: SOCKET.y }),
    bodyBox: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    },
    upper: 7.5,
    fore: 7.5,
    armed: true,
    handR: 4.6,
  }
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

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

/** Stomp sideways shake, in local forward units (the avatar applies facing). */
function offsetX(_look: CreatureLook, f: Frame): number {
  const after = afterOf(f)
  // Only the cheer stomp shakes: pumps come often in play and kick up dust alone.
  if (f.still || f.mood !== 'cheer' || after <= 0 || after >= 0.35) return 0
  return Math.sin(after * 90) * 2.4 * (1 - after / 0.35)
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

/** Hurt: stone chips fly up off the front shoulder and tumble. */
function chips(ctx: Ctx, look: CreatureLook, f: Frame, at: Pt): void {
  const a = f.moodAge
  if (f.still || f.mood !== 'hurt' || a >= 0.6) return
  ctx.save()
  ctx.globalAlpha = clamp(1.5 - a * 2.5)
  for (let i = 0; i < 4; i++) {
    const ang = -2.3 + i * 0.5
    const v = 40 + (i % 2) * 14
    const x = at.x + Math.cos(ang) * v * a
    const y = at.y - 4 + Math.sin(ang) * v * a + 110 * a * a
    const s = 2.6 - (i % 2) * 0.8
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a * (8 + i * 3))
    paint(ctx, { p: box(-s / 2, -s / 2, s, s, 0.5), c: i % 2 ? darkOf(look.main) : look.main, k: 0, lw: 1 })
    ctx.restore()
  }
  ctx.restore()
}

/** The scarf tail: flaps in waves behind the neck, harder after a stomp, whipping on the signature gust. */
function scarfTail(ctx: Ctx, look: CreatureLook, f: Frame, t: number): void {
  const after = afterOf(f)
  const gust =
    (!f.still && after > 0 && after < 0.6 ? 1 - after / 0.6 : 0) + 1.6 * Math.sin(Math.PI * clamp(f.fidget))
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
function head(ctx: Ctx, look: CreatureLook, f: Frame, k: DrawKit, stone: string, t: number): void {
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
  k.hat(HAT_BOX)

  const visor = box(-6.5, HY - 2, 14.5, 8.5, 3.2)
  paint(ctx, { p: visor, c: VISOR, k: 0, inner: true, lw: 1.5 })
  ctx.save()
  ctx.clip(visor)
  eyes(ctx, look, f, t)
  ctx.restore()
}

/** The scarf band round the neck, the knot's flap hanging on the chest, and the badge pulsing gold on it. */
function scarfBand(ctx: Ctx, look: CreatureLook, k: DrawKit, t: number): void {
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

/** White slit eyes in the visor: glance around, arcs when happy, x's on KO, chevrons on a flinch. */
function eyes(ctx: Ctx, look: CreatureLook, f: Frame, t: number): void {
  const c = f.mood === 'hurt' && f.moodAge < 0.2 ? '#ff6b6b' : look.eye
  const ex = [-2.4, 4.2]
  const y = HY + 2.2
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

function draw(ctx: Ctx, look: CreatureLook, f: Frame, k: DrawKit): void {
  const r = rigOf(f)
  const m = k.metrics
  const t = f.still ? 0 : f.t
  // A dark flash on the hurt flinch.
  const flash = f.mood === 'hurt' && f.moodAge < 0.25 ? 0.5 * (1 - f.moodAge / 0.25) : 0
  const stone = flash ? mix(look.main, '#2a1e2e', flash) : look.main
  const scarf = look.signature === 'scarf'

  stompDust(ctx, f)
  if (scarf) {
    ctx.save()
    along(ctx, r.neck)
    scarfTail(ctx, look, f, t)
    ctx.restore()
  }

  // Back arm and fist behind everything.
  blockArm(ctx, m.socketB, k.hands.back, darkOf(stone))
  k.backHand()

  // Legs: stone blocks (the back one in shade).
  for (const [mat, x, c] of [
    [r.legB, -12, darkOf(stone)],
    [r.legF, 2, stone],
  ] as const) {
    ctx.save()
    along(ctx, mat)
    group(ctx, [{ p: box(x, -10, 10, 10, 2.5), c }])
    ctx.restore()
  }

  // Torso: one block standing, two halves once it crumbles. Seams mark the stones.
  const halves: Array<[Mat, Path2D]> =
    r.crumble > 0
      ? [
          [r.torsoB, box(TORSO.x, TORSO.y, TORSO.w / 2, TORSO.h, [4.5, 1, 1, 4.5])],
          [r.torsoF, box(0, TORSO.y, TORSO.w / 2, TORSO.h, [1, 4.5, 4.5, 1])],
        ]
      : [[r.torsoF, box(TORSO.x, TORSO.y, TORSO.w, TORSO.h, 4.5)]]
  for (const [mat, p] of halves) {
    ctx.save()
    along(ctx, mat)
    group(ctx, [{ p, c: stone }])
    ctx.clip(p)
    seam(ctx, stone, [
      [TORSO.x, -20, -TORSO.x, -20],
      [0, TORSO.y, 0, -20],
      [-6.5, -20, -6.5, -9],
      [6.5, -20, 6.5, -9],
    ])
    gloss(ctx, -8.5, -27.5, 2.2, 1.1, -0.3)
    ctx.restore()
  }

  ctx.save()
  along(ctx, r.head)
  head(ctx, look, f, k, stone, t)
  ctx.restore()
  ctx.save()
  along(ctx, r.neck)
  scarfBand(ctx, look, k, t)
  ctx.restore()

  // Front arm and fist (with the held ball) in front.
  blockArm(ctx, m.socketF, k.hands.front, stone)
  k.frontHand()
  chips(ctx, look, f, m.socketF)
  if (happy(f)) ticks(ctx, 17, m.headTop - 8, f.moodAge)
}

export const golem: BodyType = { metrics, draw, drawHand, offsetX, pose }
