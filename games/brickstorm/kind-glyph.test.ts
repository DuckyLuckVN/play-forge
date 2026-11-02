import { describe, expect, it } from 'vitest'
import { drawKindGlyph } from './render'
import { brickRect } from './sim/rows'
import type { BrickKind, BrickShape } from './sim/types'
import { fakeCanvas } from './test-canvas'

function draw(kind: BrickKind, shape?: BrickShape) {
  const ctx = fakeCanvas()
  const body = { col: 1, row: 1, shape }
  drawKindGlyph(ctx, kind, brickRect(body), 0, body)
  return ctx.calls
}

describe('special brick outlines follow the brick shape', () => {
  for (const kind of ['gold', 'armored'] as const) {
    it(`${kind}: a square keeps its rounded frame`, () => {
      expect(draw(kind)).toContain('roundRect')
    })
    it(`${kind}: a triangle is outlined as a triangle, not a square`, () => {
      const calls = draw(kind, 'tri-bl')
      expect(calls).not.toContain('roundRect')
      expect(calls).toContain('arcTo')
    })
    it(`${kind}: an orb is outlined as a circle`, () => {
      const calls = draw(kind, 'orb')
      expect(calls).not.toContain('roundRect')
      expect(calls).toContain('arc')
    })
  }
  for (const kind of ['water', 'void', 'splitter', 'gold', 'armored'] as const)
    it(`${kind}: effects on an orb are clipped to it`, () => {
      expect(draw(kind, 'orb')).toContain('clip')
    })
})
