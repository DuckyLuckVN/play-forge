/** Creature hands: pure arm solver (FK, two-bone IK onto the held ball, head clearance), hand springs, mitt + grip drawing. */
import type { Pose } from '../hero-avatar'
import { OUTLINE, group, lightOf } from './paint'
import type { BodyMetrics, HandPose } from './types'

type Ctx = CanvasRenderingContext2D
interface Pt {
  x: number
  y: number
}
interface Ball extends Pt {
  r: number
}

const HEAD_STEP = 0.08
/** 40 × 0.08 > π: the search covers every shoulder angle. */
const HEAD_STEPS = 40
/** Spring stiffness; damping 2·√k makes it critically damped (no overshoot). */
const SPRING_K = 260
const SPRING_C = 2 * Math.sqrt(SPRING_K)
/** Sub-step size so long frames stay stable. */
const SPRING_DT = 1 / 120

/** Elbow and hand for shoulder angle `s` and elbow bend `e` (0 = hanging down, + = forward). */
function limb(m: BodyMetrics, o: Pt, s: number, e: number): { elbow: Pt; hand: Pt } {
  const ex = o.x + Math.sin(s) * m.upper
  const ey = o.y + Math.cos(s) * m.upper
  return {
    elbow: { x: ex, y: ey },
    hand: { x: ex + Math.sin(s + e) * m.fore, y: ey + Math.cos(s + e) * m.fore },
  }
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Nearest shoulder angle to `s` (searching ±k·0.08, k ≤ 40, i.e. past ±π) where the hand is at least
 * max(rx,ry)+handR+1 and the elbow at least max(rx,ry) from the head centre, so the pose's intent is kept.
 * When no angle clears, returns the one with the best clearance margin.
 */
export function clearHead(m: BodyMetrics, socket: Pt, s: number, e: number): number {
  const head = m.head
  const r = Math.max(head.rx, head.ry)
  /** ≥ 0 when both hand and elbow clear the head. */
  const margin = (a: number) => {
    const { elbow, hand } = limb(m, socket, a, e)
    return Math.min(dist(hand, head) - (r + m.handR + 1), dist(elbow, head) - r)
  }
  if (margin(s) >= 0) return s
  let best = s
  let bestM = margin(s)
  for (let k = 1; k <= HEAD_STEPS; k++) {
    const up = s + k * HEAD_STEP
    const down = s - k * HEAD_STEP
    const mu = margin(up)
    const md = margin(down)
    if (mu >= 0 || md >= 0) return mu >= md ? up : down
    if (mu > bestM) [best, bestM] = [up, mu]
    if (md > bestM) [best, bestM] = [down, md]
  }
  return best
}

/** Elbow for a hand placed exactly on `target` (two-bone IK; straight arm toward it when out of reach). */
function reach(m: BodyMetrics, o: Pt, target: Pt): Pt {
  const dx = target.x - o.x
  const dy = target.y - o.y
  const d = Math.max(1e-6, Math.hypot(dx, dy))
  const to = Math.atan2(dx, dy)
  // Law of cosines: angle at the shoulder between the socket→target line and the upper arm.
  const cos = (m.upper * m.upper + d * d - m.fore * m.fore) / (2 * m.upper * d)
  const s = to + Math.acos(Math.max(-1, Math.min(1, cos)))
  return { x: o.x + Math.sin(s) * m.upper, y: o.y + Math.cos(s) * m.upper }
}

const handPose = (elbow: Pt, hand: Pt, front: boolean): HandPose => ({
  x: hand.x,
  y: hand.y,
  ex: elbow.x,
  ey: elbow.y,
  open: 0,
  front,
})

function posed(m: BodyMetrics, o: Pt, s: number, e: number, front: boolean): HandPose {
  const { elbow, hand } = limb(m, o, clearHead(m, o, s, e), e)
  return handPose(elbow, hand, front)
}

/** Both hands for a pose. While holding, the front hand sits exactly on the hold point. Pure. */
export function solveHands(
  m: BodyMetrics,
  pose: Pose,
  hold: Ball | null,
  holding: boolean,
): { front: HandPose; back: HandPose } {
  const front =
    holding && hold
      ? handPose(reach(m, m.socketF, hold), { x: hold.x, y: hold.y }, true)
      : posed(m, m.socketF, pose.sF, pose.eF, true)
  return { front, back: posed(m, m.socketB, pose.sB, pose.eB, false) }
}

/** Critically damped spring that drags a hand toward its target; snaps when locked (on the ball) or still (reduced motion). */
export class HandFollower {
  x = 0
  y = 0
  private vx = 0
  private vy = 0

  snap(p: Pt): void {
    this.x = p.x
    this.y = p.y
    this.vx = 0
    this.vy = 0
  }

  update(dt: number, target: Pt, locked: boolean, still: boolean): void {
    if (locked || still) {
      this.snap(target)
      return
    }
    const n = Math.max(1, Math.ceil(dt / SPRING_DT))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      this.vx += (SPRING_K * (target.x - this.x) - SPRING_C * this.vx) * h
      this.vy += (SPRING_K * (target.y - this.y) - SPRING_C * this.vy) * h
      this.x += this.vx * h
      this.y += this.vy * h
    }
  }
}

/** Unit forearm direction (elbow → hand); straight down when the forearm has no length. */
function forearm(h: HandPose): Pt {
  const dx = h.x - h.ex
  const dy = h.y - h.ey
  const l = Math.hypot(dx, dy)
  return l > 1e-6 ? { x: dx / l, y: dy / l } : { x: 0, y: 1 }
}

/** Default mitt: an ellipse along the forearm with a thumb nub on its leading side; flattens as `open` grows. */
export function drawHand(ctx: Ctx, h: HandPose, color: string, r: number): void {
  const d = forearm(h)
  // Leading side: forward when the arm hangs, up when it points forward.
  const n = { x: d.y, y: -d.x }
  const rot = Math.atan2(d.y, d.x)
  const mitt = new Path2D()
  mitt.ellipse(h.x, h.y, r * (1 + 0.15 * h.open), r * 0.85 * (1 - 0.35 * h.open), rot, 0, Math.PI * 2)
  const thumb = new Path2D()
  const tx = h.x - d.x * r * 0.15 + n.x * r * 0.75
  const ty = h.y - d.y * r * 0.15 + n.y * r * 0.75
  thumb.ellipse(tx, ty, r * 0.42, r * 0.34, rot, 0, Math.PI * 2)
  group(ctx, [
    { p: thumb, c: color, k: 0.3, lw: 0 },
    { p: mitt, c: color, k: 0.5 },
  ])
}

/** A rounded arm segment (capsule) from `a` to `b`, as a path in the current frame (no transforms needed). */
function capsule(a: Pt, b: Pt, r: number): Path2D {
  const ang = Math.atan2(b.y - a.y, b.x - a.x)
  const p = new Path2D()
  p.arc(b.x, b.y, r, ang - Math.PI / 2, ang + Math.PI / 2)
  p.arc(a.x, a.y, r, ang + Math.PI / 2, ang + Math.PI * 1.5)
  p.closePath()
  return p
}

/** Upper and fore arm from the socket through the elbow to the hand, under one outline (armed bodies). */
export function drawArm(ctx: Ctx, socket: Pt, h: HandPose, width: number, color: string): void {
  const elbow = { x: h.ex, y: h.ey }
  group(ctx, [
    { p: capsule(socket, elbow, width / 2), c: color, k: 0.5 },
    { p: capsule(elbow, h, width / 2), c: color, k: 0.5 },
  ])
}

/** Thumb wrapped over the held ball's front edge, so the ball reads as gripped. */
export function drawGrip(ctx: Ctx, h: HandPose, ball: Ball, color: string): void {
  const x = ball.x + ball.r * 0.55
  const y = ball.y + ball.r * 0.35
  const r = ball.r * 0.42
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.8, Math.atan2(y - h.y, x - h.x), 0, Math.PI * 2)
  ctx.strokeStyle = OUTLINE
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = color
  ctx.fill()
  ctx.fillStyle = lightOf(color)
  ctx.beginPath()
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
