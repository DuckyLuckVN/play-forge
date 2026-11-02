import { describe, expect, it } from 'vitest'
import { glyphAnchor, shapeEdgeY } from './brick-geo'
import { brickRect } from './sim/rows'
import type { BrickShape } from './sim/types'

const at = (shape?: BrickShape) => ({ col: 0, row: 0, shape })

describe('shape edges', () => {
  const r = brickRect(at())
  it('a square spans its rect', () => {
    expect(shapeEdgeY(at(), r.x + 10, 'top')).toBeCloseTo(r.y)
    expect(shapeEdgeY(at(), r.x + 10, 'bottom')).toBeCloseTo(r.y + r.h)
  })
  it('a top-left triangle: flat top, bottom edge on the slant', () => {
    const x = r.x + r.w * 0.75
    expect(shapeEdgeY(at('tri-tl'), x, 'top')).toBeCloseTo(r.y)
    expect(shapeEdgeY(at('tri-tl'), x, 'bottom')).toBeCloseTo(r.y + r.h * 0.25)
  })
  it('a bottom-right triangle: top edge on the slant, flat bottom', () => {
    const x = r.x + r.w * 0.75
    expect(shapeEdgeY(at('tri-br'), x, 'top')).toBeCloseTo(r.y + r.h * 0.25)
    expect(shapeEdgeY(at('tri-br'), x, 'bottom')).toBeCloseTo(r.y + r.h)
  })
  it('an orb follows its circle, and is empty outside it', () => {
    const cx = r.x + r.w / 2
    expect(shapeEdgeY(at('orb'), cx, 'top')).toBeCloseTo(r.y)
    expect(shapeEdgeY(at('orb'), cx, 'bottom')).toBeCloseTo(r.y + r.h)
    expect(shapeEdgeY(at('orb'), r.x - 1, 'top')).toBeNull()
  })
})

describe('glyph anchor', () => {
  it('sits inside every shape with room for a 7 px glyph', () => {
    for (const shape of [undefined, 'tri-tl', 'tri-tr', 'tri-bl', 'tri-br', 'orb'] as const) {
      const g = glyphAnchor(at(shape))
      for (const [dx, dy] of [
        [-7, 0],
        [7, 0],
        [0, -7],
        [0, 7],
      ]) {
        const top = shapeEdgeY(at(shape), g.x + dx, 'top')
        const bottom = shapeEdgeY(at(shape), g.x + dx, 'bottom')
        expect(top, `${shape} ${dx},${dy}`).not.toBeNull()
        expect(g.y + dy).toBeGreaterThanOrEqual(top! - 1e-6)
        expect(g.y + dy).toBeLessThanOrEqual(bottom! + 1e-6)
      }
    }
  })
  it('a square keeps its old top-right corner spot', () => {
    const r = brickRect(at())
    expect(glyphAnchor(at())).toEqual({ x: r.x + r.w - 10, y: r.y + 11 })
  })
})
