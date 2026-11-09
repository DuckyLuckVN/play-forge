// Small, pure animation maths for the ghost, shared by the 3D and 2D views
// and the character picker: a springy lean, idle bob with squash and stretch,
// and eye blinks on a random timer.

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
export function bob(time: number, amount = 1): { y: number; sx: number; sy: number } {
  const phase = time * 3
  const y = Math.sin(phase) * 0.1 * amount
  const sy = 1 + Math.sin(phase) * 0.045 * amount
  return { y, sx: 1 / Math.sqrt(sy), sy }
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
