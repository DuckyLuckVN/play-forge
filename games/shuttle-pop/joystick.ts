// Floating thumb-stick math, DOM-free. Screen px in, view-relative direction out (x = screen right,
// z = screen up = forward toward the net). input.ts feeds the result into the same held direction the
// keys use, so swings, send-on-change and resync work the same for touch.

type Px = { x: number; y: number }

/** Stick base radius in px (the knob stops at the rim; full speed there). */
export const STICK_RADIUS = 48
/** Dead zone as a share of the radius: a resting thumb doesn't drift. */
export const STICK_DEAD = 0.15
/** Steps the stick is snapped to before send-on-change (fewer inputs on the wire). */
export const STICK_STEP = 0.05

/**
 * Direction from the stick origin to the finger: 0 inside the dead zone, then ramps linearly to
 * length 1 at `radius` (and stays 1 beyond it). Length is never over 1.
 */
export function joystickVector(
  origin: Px,
  p: Px,
  radius: number,
  dead = STICK_DEAD,
): { x: number; z: number } {
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  const dist = Math.hypot(dx, dy)
  const r = radius > 0 ? dist / radius : 0
  if (r <= dead || dist === 0) return { x: 0, z: 0 }
  const mag = Math.min(1, (r - dead) / (1 - dead))
  return { x: (dx / dist) * mag, z: (-dy / dist) * mag }
}

/** Snap each axis to `step`, toward zero (so a snapped vector is never longer than the input). */
export function quantise(v: { x: number; z: number }, step = STICK_STEP): { x: number; z: number } {
  // The epsilon keeps 0.15 / 0.05 = 2.9999… from truncating a step short.
  const snap = (n: number) => {
    const q = Math.sign(n) * Math.floor(Math.abs(n) / step + 1e-9) * step || 0
    return Math.round(q * 1e6) / 1e6
  }
  return { x: snap(v.x), z: snap(v.z) }
}

/** Knob position relative to the origin in px, clamped to the base's radius. */
export function knobOffset(origin: Px, p: Px, radius: number): Px {
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  const dist = Math.hypot(dx, dy)
  if (dist <= radius) return { x: dx, y: dy }
  return { x: (dx / dist) * radius, y: (dy / dist) * radius }
}

/**
 * Which pointer owns the stick. The first touch in the stick zone becomes the origin; other fingers
 * (the swing thumb) never steal or move it.
 */
export class StickTracker {
  private pointer: number | null = null
  readonly origin: Px = { x: 0, y: 0 }

  constructor(readonly radius: number) {}

  get active(): boolean {
    return this.pointer !== null
  }

  /** True when this pointer took the stick (it was free). */
  down(id: number, x: number, y: number): boolean {
    if (this.pointer !== null) return false
    this.pointer = id
    this.origin.x = x
    this.origin.y = y
    return true
  }

  /** The new direction, or null when this pointer isn't the stick's. */
  move(id: number, x: number, y: number): { x: number; z: number } | null {
    if (id !== this.pointer) return null
    return joystickVector(this.origin, { x, y }, this.radius)
  }

  /** True when the stick's pointer let go (the caller recentres). */
  up(id: number): boolean {
    if (id !== this.pointer) return false
    this.pointer = null
    return true
  }

  cancel(): void {
    this.pointer = null
  }
}
