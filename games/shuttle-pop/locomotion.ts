// Locomotion for the chibis (pure, no three.js): stride from ground speed, damped facing (badminton:
// mostly toward the net, courtTurn), lean shares, foot plants and start / stop / sharp-turn signals.
// Everything is exponential damping or phase accumulation over `dt`, so it looks the same at any frame
// rate, and nothing allocates per frame.
//
// Angles are render yaw (rotation.y): 0 faces +z, π/2 faces +x. The renderer drives one Gait per
// player from the interpolated sim velocity, so the remote / bot player animates like the local one.
import { MOVE_SPEED } from './court'

export const GAIT = {
  /** Stride cycles per second at full run (2 foot plants per cycle). */
  freq: 3,
  /** Leg swing (rad) at full run. */
  amp: 0.85,
  /** Body bob (m) at full run; 2 bobs per cycle. */
  bob: 0.07,
  /** Speed share damping (1/s). */
  speedRate: 12,
  /** Lean share damping (1/s). */
  leanRate: 10,
  /** Turn damping (1/s): moving, and back to the net (idle / swinging). */
  turnRate: 9,
  netRate: 14,
  /**
   * Badminton facing while moving (courtTurn, rad): a side shuffle keeps facing the net, a straight
   * retreat turns the racket shoulder back this much, an advance turns the racket side forward a little.
   */
  turnBack: 0.6,
  turnFwd: 0.2,
  /** Below this speed share the body faces the net. */
  turnFrom: 0.2,
  /** Start / stop hysteresis on the raw speed share. */
  startAt: 0.35,
  stopAt: 0.12,
  /**
   * Sharp turn: angle (cos) between the velocity and its damped trail, min speed share, cooldown (s).
   * The sim eases velocity (full speed in 6 ticks), so a 90° cut peaks at ~50° here.
   */
  kickCos: Math.cos((40 * Math.PI) / 180),
  kickFrom: 0.4,
  kickCool: 0.4,
  /** Damped velocity trail rate (1/s) the sharp turn is measured against. */
  trailRate: 6,
} as const

export interface Stride {
  /** Cycles per second. */
  freq: number
  /** Leg swing (rad). */
  amp: number
  /** Body bob (m). */
  bob: number
}

/** Stride for a speed share 0..1 (clamped): 0 at rest, all three grow monotonically. Writes `out`. */
export function strideParams(speed: number, out: Stride): Stride {
  const s = Math.min(1, Math.max(0, speed))
  // sqrt: short quick steps when slow (chibi shuffle), long strides near full run.
  out.freq = GAIT.freq * Math.sqrt(s)
  out.amp = GAIT.amp * Math.min(1, s * 1.6)
  out.bob = GAIT.bob * s
  return out
}

/**
 * Legless locomotion (pure), driven by the same gait speed share and stride phase as legs. Hop (slime):
 * two hops per stride cycle (|sin|: lands at the step phases, so step puffs line up), squashing on each
 * landing and stretching in the air. Float (ghost): always hovering, a slow idle bob that hands over to a
 * stride-synced bob as it moves. Continuous in speed, phase and time.
 */
export const GLIDE = {
  hop: { h: 0.11, squash: 0.16, stretch: 0.05, land: 0.3 },
  float: { base: 0.1, idle: 0.025, idleW: 2.4, stride: 0.03 },
} as const

export interface Glide {
  /** Rig lift (m). */
  lift: number
  /** + squash / − stretch. */
  squash: number
}

export function glideParams(
  kind: 'hop' | 'float',
  speed: number,
  phase: number,
  t: number,
  out: Glide,
): Glide {
  const s = Math.min(1, Math.max(0, speed))
  if (kind === 'hop') {
    const H = GLIDE.hop
    const a = Math.abs(Math.sin(Math.PI * 2 * phase))
    const landing = Math.max(0, 1 - a / H.land)
    out.lift = H.h * s * a
    out.squash = s * (H.squash * landing * landing - H.stretch * a)
  } else {
    const F = GLIDE.float
    out.lift =
      F.base + F.idle * (1 - s) * Math.sin(t * F.idleW) + F.stride * s * Math.sin(Math.PI * 4 * phase)
    out.squash = 0
  }
  return out
}

/** Angle into (−π, π]. */
export function wrapAngle(a: number): number {
  const TAU = Math.PI * 2
  let r = (a + Math.PI) % TAU
  if (r < 0) r += TAU
  r -= Math.PI
  return r === -Math.PI ? Math.PI : r
}

/**
 * Facing turn (rad, added to the net-facing yaw) for a move `rel` rad off straight-at-the-net: none on a
 * side shuffle, the racket shoulder (right, −x) back = negative yaw on a retreat, a little forward on an
 * advance. Continuous all the way round.
 */
export function courtTurn(rel: number): number {
  const c = Math.cos(rel)
  return c < 0 ? GAIT.turnBack * c : GAIT.turnFwd * c
}

/** Exponential approach of `cur` to `target` at `rate` (1/s) over `dt` s. */
export function damp(cur: number, target: number, rate: number, dt: number): number {
  return target + (cur - target) * Math.exp(-rate * dt)
}

/** damp for angles, the short way round. The result is wrapped. */
export function dampAngle(cur: number, target: number, rate: number, dt: number): number {
  const d = wrapAngle(target - cur)
  return wrapAngle(cur + d * (1 - Math.exp(-rate * dt)))
}

/** Bit flags returned by Gait.update. */
export const GaitEvent = {
  StepL: 1,
  StepR: 2,
  /** Set off from (nearly) standing. */
  Start: 4,
  /** Came to a halt. */
  Stop: 8,
  /** Sharp change of direction while running. */
  Kick: 16,
} as const

export class Gait {
  /** Damped speed share 0..1. */
  speed = 0
  /** Stride phase in cycles (0..1); foot plants at 0 (left) and 0.5 (right). */
  phase = 0
  /** Facing (render yaw). */
  yaw = 0
  /** Damped velocity share along the facing (+ forward) and across it (+ toward local +x). */
  fwd = 0
  side = 0
  private moving = false
  private trailX = 0
  private trailZ = 0
  private cool = 0
  private stride: Stride = { freq: 0, amp: 0, bob: 0 }

  /** Stand still facing `yaw`. */
  reset(yaw: number) {
    this.speed = this.phase = this.fwd = this.side = this.trailX = this.trailZ = this.cool = 0
    this.moving = false
    this.yaw = wrapAngle(yaw)
  }

  /**
   * Advance by `dt` with render-space velocity (vx, vz) m/s. `netYaw` = the yaw that faces the net;
   * `faceNet` (swinging) turns back to it whatever the move. Returns GaitEvent flags.
   */
  update(vx: number, vz: number, netYaw: number, faceNet: boolean, dt: number): number {
    let flags = 0
    const v = Math.hypot(vx, vz)
    const raw = Math.min(1, v / MOVE_SPEED)
    this.speed = damp(this.speed, raw, GAIT.speedRate, dt)
    if (this.speed < 1e-4 && raw === 0) this.speed = 0

    // Facing: the net, with a slight badminton turn while moving (courtTurn).
    let target = netYaw
    let rate: number = GAIT.netRate
    if (!faceNet && raw > GAIT.turnFrom) {
      target = netYaw + courtTurn(Math.atan2(vx, vz) - netYaw)
      rate = GAIT.turnRate
    }
    this.yaw = dampAngle(this.yaw, target, rate, dt)

    // Velocity in the body frame (model faces +z; local +x is (cos yaw, −sin yaw) in render space).
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    this.fwd = damp(this.fwd, (vx * sin + vz * cos) / MOVE_SPEED, GAIT.leanRate, dt)
    this.side = damp(this.side, (vx * cos - vz * sin) / MOVE_SPEED, GAIT.leanRate, dt)

    // Foot plants: phase crossings of 0 and 0.5 (at most one per foot per frame).
    const before = this.phase
    const after = before + strideParams(this.speed, this.stride).freq * dt
    if (Math.floor(after) > Math.floor(before)) flags |= GaitEvent.StepL
    if (Math.floor(after - 0.5) > Math.floor(before - 0.5)) flags |= GaitEvent.StepR
    this.phase = after % 1

    // Start / stop with hysteresis.
    if (!this.moving && raw > GAIT.startAt) {
      this.moving = true
      flags |= GaitEvent.Start
      this.cool = GAIT.kickCool
    } else if (this.moving && raw < GAIT.stopAt) {
      this.moving = false
      flags |= GaitEvent.Stop
    }

    // Sharp turn: the velocity points far from where it has been heading lately.
    const k = 1 - Math.exp(-GAIT.trailRate * dt)
    this.trailX += (vx - this.trailX) * k
    this.trailZ += (vz - this.trailZ) * k
    this.cool = Math.max(0, this.cool - dt)
    const tl = Math.hypot(this.trailX, this.trailZ)
    if (this.cool === 0 && raw > GAIT.kickFrom && tl > 0.2) {
      const cosA = (vx * this.trailX + vz * this.trailZ) / (v * tl)
      if (cosA < GAIT.kickCos) {
        flags |= GaitEvent.Kick
        this.cool = GAIT.kickCool
      }
    }
    return flags
  }
}
