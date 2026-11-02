// Where things go on a brick of any shape (square, triangle, orb): its top and
// bottom edges at a given x, and a spot for its corner glyph.
import { brickRect, brickShape } from './sim/rows'
import type { Brick } from './sim/types'

type Body = Pick<Brick, 'col' | 'row' | 'shape'>

/** The y of the shape's top or bottom edge at `x`, or null when `x` misses the shape. */
export function shapeEdgeY(b: Body, x: number, side: 'top' | 'bottom'): number | null {
  const shape = brickShape(b)
  if ('circle' in shape) {
    const { x: cx, y: cy, r } = shape.circle
    const dx = x - cx
    if (Math.abs(dx) > r) return null
    const h = Math.sqrt(r * r - dx * dx)
    return side === 'top' ? cy - h : cy + h
  }
  if ('poly' in shape) {
    const ys: number[] = []
    const p = shape.poly
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i]
      const [x1, y1] = p[(i + 1) % p.length]
      if (x < Math.min(x0, x1) - 1e-9 || x > Math.max(x0, x1) + 1e-9) continue
      if (x0 === x1) ys.push(y0, y1)
      else ys.push(y0 + ((x - x0) / (x1 - x0)) * (y1 - y0))
    }
    if (!ys.length) return null
    return side === 'top' ? Math.min(...ys) : Math.max(...ys)
  }
  if (x < shape.x || x > shape.x + shape.w) return null
  return side === 'top' ? shape.y : shape.y + shape.h
}

/** Centre of the small glyph (bomb, bolt, ?) a special brick wears, inside its shape. */
export function glyphAnchor(b: Body): { x: number; y: number } {
  const r = brickRect(b)
  if (!b.shape) return { x: r.x + r.w - 10, y: r.y + 11 }
  if (b.shape === 'orb') return { x: r.x + r.w / 2 + r.w * 0.25, y: r.y + r.h / 2 - r.h * 0.25 }
  // Along the flat horizontal leg, away from the right angle (the number sits by the right angle).
  const left = b.shape === 'tri-tl' || b.shape === 'tri-bl'
  const top = b.shape === 'tri-tl' || b.shape === 'tri-tr'
  // A bottom triangle's slant cuts in from above, so its glyph sits lower and nearer the corner.
  const across = top ? 0.62 : 0.6
  return {
    x: left ? r.x + r.w * across : r.x + r.w * (1 - across),
    y: top ? r.y + 10 : r.y + r.h - 8,
  }
}
