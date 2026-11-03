import { describe, expect, it } from 'vitest'
import { roundRect } from './render'

/** Records roundRect radii and throws on a negative one, like a real canvas. */
function ctx() {
  const radii: number[] = []
  const c = {
    beginPath() {},
    roundRect(_x: number, _y: number, _w: number, _h: number, r: number) {
      if (r < 0) throw new RangeError('negative radius')
      radii.push(r)
    },
  }
  return { c: c as unknown as CanvasRenderingContext2D, radii }
}

describe('roundRect', () => {
  it('never passes a negative radius, even for tiny or inverted boxes (a tile popping in)', () => {
    const { c, radii } = ctx()
    expect(() => roundRect(c, 0, 0, 3, -1.2, 4)).not.toThrow()
    expect(() => roundRect(c, 0, 0, -2, 5, 4)).not.toThrow()
    roundRect(c, 0, 0, 40, 40, 6)
    expect(radii.at(-1)).toBe(6)
    expect(radii.every((r) => r >= 0)).toBe(true)
  })
})
