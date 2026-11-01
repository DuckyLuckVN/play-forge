import { describe, expect, it } from 'vitest'
import { BrickTween } from './brick-tween'
import { CELL } from './sim/config'

describe('brick tween', () => {
  it('glides a brick that moved down a row instead of jumping', () => {
    const tw = new BrickTween()
    tw.update([{ id: 1, row: 3 }], 1 / 60)
    expect(tw.dy(1)).toBe(0)
    tw.update([{ id: 1, row: 4 }], 1 / 60)
    // Drawn still close to its old row, then catching up.
    expect(tw.dy(1)).toBeLessThan(0)
    expect(tw.dy(1)).toBeGreaterThan(-CELL)
    for (let i = 0; i < 60; i++) tw.update([{ id: 1, row: 4 }], 1 / 60)
    expect(tw.dy(1)).toBe(0)
  })

  it('slides new bricks in from above, but not on the first frame of a run', () => {
    const tw = new BrickTween()
    tw.update([{ id: 1, row: 0 }], 1 / 60)
    expect(tw.dy(1)).toBe(0)
    tw.update(
      [
        { id: 1, row: 0 },
        { id: 2, row: 0 },
      ],
      1 / 60,
    )
    expect(tw.dy(2)).toBeLessThan(0)
  })

  it('forgets bricks that are gone', () => {
    const tw = new BrickTween()
    tw.update([{ id: 1, row: 2 }], 1 / 60)
    tw.update([], 1 / 60)
    expect(tw.dy(1)).toBe(0)
  })
})
