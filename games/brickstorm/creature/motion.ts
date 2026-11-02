/** Shared, pure motion and bounds helpers for body rigs: one-shot pulses, the cheer flourish, limb aiming, bounds. */
import { type Mat, type Pt, apply } from './affine'
import { clamp } from './paint'
import type { Frame, Rect } from './types'

export const TAU = Math.PI * 2

/**
 * `Pose.rear` while sitting up holding the ball. It lives here, not in hero-avatar.ts, so bodies can read it without a
 * runtime import cycle (hero-avatar → bodies → hero-avatar).
 */
export const REAR_HOLD = 0.55
/** How landed a flyer is from the blended `pose.rear`: 0 airborne (no ball) .. 1 landed (holding or above). */
export const landedOf = (rear: number) => clamp(rear / REAR_HOLD)

export interface Ellipse {
  x: number
  y: number
  rx: number
  ry: number
}

/** 0..1..0 over the first `dur` seconds. */
export const pulse = (age: number, dur: number) =>
  age > 0 && age < dur ? Math.sin((age / dur) * Math.PI) : 0

/** 0..1..0 while the signature plays; 0 when still. */
export const sigOf = (f: Frame) => (f.still ? 0 : Math.sin(Math.PI * clamp(f.fidget)))

export interface Flourish {
  /** Strength 0..1 (a pump plays a lighter, shorter one). */
  k: number
  age: number
  cheer: boolean
}

/** Cheer flourish strength (a pump plays a lighter, shorter one); 0 under reduced motion. */
export function flourish(f: Frame): Flourish {
  if (f.still || (f.mood !== 'cheer' && f.mood !== 'pump')) return { k: 0, age: 0, cheer: false }
  const cheer = f.mood === 'cheer'
  return { k: pulse(f.moodAge, cheer ? 1 : 0.4) * (cheer ? 1 : 0.4), age: f.moodAge, cheer }
}

/**
 * Shoulder and elbow angles (0 = hanging down, + = forward) that put the hand on `target` with the elbow bent back,
 * like a front leg planted on the ground; a straight limb toward it when out of reach.
 */
export function limbTo(socket: Pt, target: Pt, upper: number, fore: number): { s: number; e: number } {
  const dx = target.x - socket.x
  const dy = target.y - socket.y
  const d = Math.max(1e-6, Math.hypot(dx, dy))
  const cos = (upper * upper + d * d - fore * fore) / (2 * upper * d)
  const s = Math.atan2(dx, dy) - Math.acos(clamp(cos, -1, 1))
  const ex = socket.x + Math.sin(s) * upper
  const ey = socket.y + Math.cos(s) * upper
  return { s, e: Math.atan2(target.x - ex, target.y - ey) - s }
}

/** Points round an ellipse (in its own frame) mapped through `m`. */
export const ellPoints = (m: Mat, e: Ellipse, n = 12): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU
    return apply(m, { x: e.x + Math.cos(a) * e.rx, y: e.y + Math.sin(a) * e.ry })
  })

export function boundsOf(pts: Pt[]): Rect {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
