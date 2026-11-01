import { AIM_MIN, BALL_R, BOARD_W, FLOOR_Y, MIN_VY_RATIO, TOP } from './config'
import type { Rect } from './types'

export interface Contact {
  /** Unit normal pointing out of the rect, towards the ball. */
  nx: number
  ny: number
  depth: number
}

/** Overlap between a circle and a rect, or null if they don't touch. */
export function circleRect(x: number, y: number, r: number, rect: Rect): Contact | null {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w))
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h))
  const dx = x - cx
  const dy = y - cy
  const d2 = dx * dx + dy * dy
  if (d2 > 0) {
    if (d2 >= r * r) return null
    const d = Math.sqrt(d2)
    return { nx: dx / d, ny: dy / d, depth: r - d }
  }
  // Centre inside the rect: push out along the shortest way.
  const exits = [
    { nx: -1, ny: 0, depth: x - rect.x + r },
    { nx: 1, ny: 0, depth: rect.x + rect.w - x + r },
    { nx: 0, ny: -1, depth: y - rect.y + r },
    { nx: 0, ny: 1, depth: rect.y + rect.h - y + r },
  ]
  return exits.reduce((a, b) => (b.depth < a.depth ? b : a))
}

/** Reflects a velocity off a surface, unless it is already moving away from it. */
export function reflect(vx: number, vy: number, nx: number, ny: number): [number, number] {
  const dot = vx * nx + vy * ny
  if (dot >= 0) return [vx, vy]
  return [vx - 2 * dot * nx, vy - 2 * dot * ny]
}

/** Keeps a ball from looping almost horizontally forever. */
export function antiStall(vx: number, vy: number): [number, number] {
  const speed = Math.hypot(vx, vy)
  const min = MIN_VY_RATIO * speed
  if (Math.abs(vy) >= min) return [vx, vy]
  const sy = vy < 0 ? -1 : 1
  const sx = vx < 0 ? -1 : 1
  return [sx * Math.sqrt(speed * speed - min * min), sy * min]
}

/** Aim angle (direction = cos a, -sin a) from the launch point to a pointer. */
export function aimFromPointer(launchX: number, px: number, py: number, floorY = FLOOR_Y): number {
  const dy = floorY - py
  if (dy <= 0) return px >= launchX ? AIM_MIN : Math.PI - AIM_MIN
  const a = Math.atan2(dy, px - launchX)
  return Math.max(AIM_MIN, Math.min(Math.PI - AIM_MIN, a))
}

/** Moves a ball one small step against the walls and rects; returns true if it bounced. */
export function bounceWalls(
  b: { x: number; y: number; vx: number; vy: number },
  r = BALL_R,
  width = BOARD_W,
): boolean {
  let hit = false
  if (b.x < r && b.vx < 0) {
    b.x = r
    b.vx = -b.vx
    hit = true
  } else if (b.x > width - r && b.vx > 0) {
    b.x = width - r
    b.vx = -b.vx
    hit = true
  }
  if (b.y < TOP + r && b.vy < 0) {
    b.y = TOP + r
    b.vy = -b.vy
    hit = true
  }
  return hit
}

/** Something a ball can bounce off: a rect, a convex polygon (triangle bricks) or a circle (orb bricks). */
export type HitShape =
  Rect | { poly: ReadonlyArray<readonly [number, number]> } | { circle: { x: number; y: number; r: number } }

/** Overlap between a circle and a circle, or null. */
export function circleCircle(
  x: number,
  y: number,
  r: number,
  c: { x: number; y: number; r: number },
): Contact | null {
  const dx = x - c.x
  const dy = y - c.y
  const d = Math.hypot(dx, dy)
  if (d >= r + c.r) return null
  if (d === 0) return { nx: 0, ny: -1, depth: r + c.r }
  return { nx: dx / d, ny: dy / d, depth: r + c.r - d }
}

/** Overlap between a circle and a convex polygon, or null. The normal points out of the polygon. */
export function circlePoly(
  x: number,
  y: number,
  r: number,
  pts: ReadonlyArray<readonly [number, number]>,
): Contact | null {
  const n = pts.length
  const cx = pts.reduce((a, p) => a + p[0], 0) / n
  const cy = pts.reduce((a, p) => a + p[1], 0) / n
  let inside = true
  let near = { d2: Infinity, qx: 0, qy: 0 }
  // Inside: push out across the edge whose line is closest.
  let exit = { depth: Infinity, nx: 0, ny: -1 }
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % n]
    const ex = bx - ax
    const ey = by - ay
    const len = Math.hypot(ex, ey)
    // Outward normal: perpendicular to the edge, away from the centre.
    let nx = ey / len
    let ny = -ex / len
    if ((cx - ax) * nx + (cy - ay) * ny > 0) {
      nx = -nx
      ny = -ny
    }
    const side = (x - ax) * nx + (y - ay) * ny
    if (side > 0) inside = false
    if (-side + r < exit.depth) exit = { depth: -side + r, nx, ny }
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (len * len)))
    const qx = ax + t * ex
    const qy = ay + t * ey
    const d2 = (x - qx) ** 2 + (y - qy) ** 2
    if (d2 < near.d2) near = { d2, qx, qy }
  }
  if (inside) return exit
  if (near.d2 >= r * r) return null
  const d = Math.sqrt(near.d2)
  return { nx: (x - near.qx) / d, ny: (y - near.qy) / d, depth: r - d }
}

/** Overlap between a circle and any hit shape. */
export function circleShape(x: number, y: number, r: number, shape: HitShape): Contact | null {
  if ('poly' in shape) return circlePoly(x, y, r, shape.poly)
  if ('circle' in shape) return circleCircle(x, y, r, shape.circle)
  return circleRect(x, y, r, shape)
}

/** The deepest contact between a ball and any shape, with the shape's index. */
export function deepestContact(
  x: number,
  y: number,
  shapes: HitShape[],
  r = BALL_R,
): (Contact & { index: number }) | null {
  let best: (Contact & { index: number }) | null = null
  shapes.forEach((shape, index) => {
    const c = circleShape(x, y, r, shape)
    if (c && (!best || c.depth > best.depth)) best = { ...c, index }
  })
  return best
}

/** Path of a ghost ball for the aim guide: start point, then every bounce, then the end. */
export function traceGuide(
  x: number,
  y: number,
  angle: number,
  length: number,
  rects: HitShape[],
  width = BOARD_W,
  floorY = FLOOR_Y,
  r = BALL_R,
): Array<[number, number]> {
  const step = BALL_R / 2
  const b = { x, y, vx: Math.cos(angle) * step, vy: -Math.sin(angle) * step }
  const pts: Array<[number, number]> = [[x, y]]
  for (let travelled = 0; travelled < length; travelled += step) {
    b.x += b.vx
    b.y += b.vy
    let bounced = bounceWalls(b, r, width)
    const c = deepestContact(b.x, b.y, rects, r)
    if (c) {
      b.x += c.nx * c.depth
      b.y += c.ny * c.depth
      ;[b.vx, b.vy] = reflect(b.vx, b.vy, c.nx, c.ny)
      bounced = true
    }
    if (b.y >= floorY - r && b.vy > 0) break
    if (bounced) pts.push([b.x, b.y])
  }
  pts.push([b.x, b.y])
  return pts
}
