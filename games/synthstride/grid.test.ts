import { describe, expect, it } from 'vitest'
import { neighbours, remap, stepFrom, stepToward, tileAt } from './grid'

describe('grid', () => {
  it('finds neighbours at corners and in the middle, for any size', () => {
    expect(neighbours(0, 4).sort((a, b) => a - b)).toEqual([0, 1, 4])
    expect(neighbours(tileAt(2, 2, 5), 5).length).toBe(5)
  })

  it('keeps (col, row) when the board grows', () => {
    expect(remap(tileAt(3, 2, 4), 4, 5)).toBe(tileAt(3, 2, 5))
  })

  it('steps, stopping at edges', () => {
    expect(stepFrom(0, 'left', 4)).toBe(0)
    expect(stepFrom(0, 'down', 4)).toBe(4)
    expect(stepFrom(tileAt(4, 4, 5), 'right', 5)).toBe(tileAt(4, 4, 5))
  })

  it('steps toward a tapped tile along the longer axis', () => {
    expect(stepToward(tileAt(1, 1, 4), tileAt(3, 2, 4), 4)).toBe('right')
    expect(stepToward(tileAt(1, 1, 4), tileAt(1, 0, 4), 4)).toBe('up')
    expect(stepToward(5, 5, 4)).toBeNull()
  })
})
