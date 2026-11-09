// Small, pure animation maths for the ghost, shared by the 3D and 2D views
// and the character picker: a springy lean, idle bob with squash and stretch,
// and eye blinks on a random timer.

import { RESTING, type GhostPose } from './ghost2d'

/** A damped spring on one value: overshoots a little, then settles. */
export interface Spring {
  value: number
  velocity: number
}

export const spring = (value = 0): Spring => ({ value, velocity: 0 })

/**
 * Move `s` towards `target`. `stiffness` pulls, `damping` brakes (about
 * 2·√stiffness is critical). Long frames are cut into small steps so a hitch
 * never makes it explode.
 */
export function springTo(s: Spring, target: number, dt: number, stiffness = 140, damping = 14): Spring {
  let left = Math.min(dt, 0.25)
  while (left > 0) {
    const h = Math.min(left, 1 / 120)
    s.velocity += ((target - s.value) * stiffness - s.velocity * damping) * h
    s.value += s.velocity * h
    left -= h
  }
  return s
}

/** Idle float: a gentle bob, squashed at the bottom and stretched at the top (volume kept). */
export function bob(
  time: number,
  amount = 1,
  out = { y: 0, sx: 1, sy: 1 },
): { y: number; sx: number; sy: number } {
  const phase = time * 3
  out.y = Math.sin(phase) * 0.1 * amount
  out.sy = 1 + Math.sin(phase) * 0.045 * amount
  out.sx = 1 / Math.sqrt(out.sy)
  return out
}

const BLINK_TIME = 0.16

/** Blinks every 2–5 s. Seeded, so two ghosts with different seeds blink apart. */
export class Blinker {
  private wait: number
  private closing = -1

  constructor(private seed = 1) {
    this.wait = this.next()
  }

  /** Pseudo-random 0..1 (no Math.random: tests can count on it). */
  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647 || 1
    return this.seed / 2147483647
  }

  private next(): number {
    return 2 + this.rand() * 3
  }

  /** Advance by `dt` seconds; returns the eye height, 1 open … ~0.1 shut. */
  update(dt: number): number {
    if (this.closing >= 0) {
      this.closing += dt
      if (this.closing >= BLINK_TIME) {
        this.closing = -1
        this.wait = this.next()
        return 1
      }
      const k = this.closing / BLINK_TIME
      return 0.1 + 0.9 * Math.abs(1 - 2 * k)
    }
    this.wait -= dt
    if (this.wait <= 0) this.closing = 0
    return 1
  }
}

/** Forward tip (radians) for a rift speed of 0…1: a slight lean when slow, a real dash at top speed. */
export function forwardPitch(speed: number): number {
  return 0.08 + 0.32 * Math.min(1, Math.max(0, speed))
}

/** Springs a running ghost keeps between frames (one set per view). */
export interface GhostRig {
  lean: Spring
  peek: Spring
}

export const ghostRig = (): GhostRig => ({ lean: spring(), peek: spring() })

export interface RunInput {
  time: number
  dt: number
  /** Lanes still to go to the target lane (target − x): + right, − left. */
  slide: number
  /** Rift speed 0…1. */
  speed: number
  /** Eye height from a {@link Blinker} (1 = open). */
  eyes: number
  /** Glow blur in px. */
  glow: number
  reduced: boolean
}

/** A pose for a ghost on the run, plus how high its bob lifts it (−0.1…0.1). */
export interface RunPose extends GhostPose {
  lift: number
}

export const runPoseOut = (): RunPose => ({ ...RESTING, back: true, peek: 0, lift: 0 })

const clampTo = (v: number, max: number) => Math.max(-max, Math.min(max, v))
const bobbed = { y: 0, sx: 1, sy: 1 }

/**
 * The running ghost, shared by the 3D and 2D views: seen from behind, bobbing,
 * leaning into a slide on a spring, its face peeking round towards the lane it
 * is moving into (fast in, slow out, so even a quick hop shows it), and a little
 * shorter at speed (tipped forward, seen from behind). Writes into `out`.
 */
export function runPose(rig: GhostRig, i: RunInput, out: RunPose): RunPose {
  const motion = i.reduced ? 0 : 1
  const b = bob(i.time, motion, bobbed)
  springTo(rig.lean, clampTo(i.slide * 0.35, 0.3) * motion, i.dt)
  const p = rig.peek
  // A lane hop takes ~80 ms: turn fully towards it while moving at all.
  const want = Math.abs(i.slide) > 0.01 ? Math.sign(i.slide) * motion : 0
  const rising = Math.abs(want) > Math.abs(p.value) || want * p.value < 0
  // Turning in: stiff, critically damped. Turning back: soft, so the face lingers.
  springTo(p, want, i.dt, rising ? 900 : 40, rising ? 60 : 13)
  // Reduced motion: no turning head, just the back.
  if (i.reduced) p.value = p.velocity = 0
  out.time = i.reduced ? 0 : i.time
  out.tilt = rig.lean.value
  out.eyes = i.reduced ? 1 : i.eyes
  out.look = clampTo(i.slide * 2, 1) * motion
  out.sx = b.sx
  out.sy = b.sy * Math.cos(forwardPitch(i.speed))
  out.glow = i.reduced ? 0 : i.glow
  out.back = true
  out.peek = clampTo(p.value, 1)
  out.lift = b.y
  return out
}
