// Isometric projection for tutorial clips: a tiny pure helper that maps a court-like world onto an
// SVG viewBox, plus path helpers for ball arcs. No DOM; game-agnostic.

export interface Vec2 {
  x: number
  y: number
}

/** World to screen. World: x = right, z = forward (away from the viewer's player), y = up. */
export interface Projection {
  (x: number, z: number, y?: number): Vec2
  /** Screen units per world unit (also the height of one world unit of `y`). */
  scale: number
}

const COS30 = Math.cos(Math.PI / 6)

/** yaw -45: forward points up-right; +45 mirrors it (forward points up-left). */
export function isoProjection(o: { yawDeg: 45 | -45; scale: number; origin: Vec2 }): Projection {
  const k = o.scale
  const s = o.yawDeg === -45 ? 1 : -1
  const p = ((x: number, z: number, y = 0): Vec2 => ({
    x: o.origin.x + (s === 1 ? x + z : x - z) * COS30 * k,
    y: o.origin.y + (s === 1 ? x - z : -(x + z)) * 0.5 * k - y * k,
  })) as Projection
  p.scale = k
  return p
}

/**
 * Screen to world on the plane at height `y`: the (x, z) that `p` draws at `at`. Works for any affine
 * projection (solves from three sample points), e.g. where a racket drawn on screen meets the ball.
 */
export function unproject(p: Projection, at: Vec2, y = 0): { x: number; z: number } {
  const o = p(0, 0, y)
  const ex = p(1, 0, y)
  const ez = p(0, 1, y)
  const a = ex.x - o.x
  const b = ez.x - o.x
  const c = ex.y - o.y
  const d = ez.y - o.y
  const det = a * d - b * c
  const dx = at.x - o.x
  const dy = at.y - o.y
  return { x: (d * dx - b * dy) / det + 0, z: (a * dy - c * dx) / det + 0 }
}

/** SVG path data "M x,y L x,y ..." with 1 decimal. */
export function pathD(points: readonly Vec2[]): string {
  return 'M' + points.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' L')
}

/**
 * Flight of a ball: `air` follows the height curve (quadratic through start, peak at the midpoint,
 * end), `ground` is its shadow. Both have steps + 1 points.
 */
export function arc(
  p: Projection,
  from: { x: number; z: number },
  to: { x: number; z: number },
  h: { start: number; peak: number; end: number },
  steps = 30,
): { air: Vec2[]; ground: Vec2[] } {
  const air: Vec2[] = []
  const ground: Vec2[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = from.x + (to.x - from.x) * t
    const z = from.z + (to.z - from.z) * t
    const y = (1 - t) * (1 - 2 * t) * h.start + 4 * t * (1 - t) * h.peak + t * (2 * t - 1) * h.end
    air.push(p(x, z, y))
    ground.push(p(x, z))
  }
  return { air, ground }
}
