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

/** The deepest contact between a ball and any rect, with the rect's index. */
export function deepestContact(
  x: number,
  y: number,
  rects: Rect[],
  r = BALL_R,
): (Contact & { index: number }) | null {
  let best: (Contact & { index: number }) | null = null
  rects.forEach((rect, index) => {
    const c = circleRect(x, y, r, rect)
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
  rects: Rect[],
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
