import { describe, expect, it } from 'vitest'
import { BOARD_H, BOARD_W } from './sim/config'
import { toBoard } from './input'

describe('toBoard', () => {
  const rect = { left: 100, top: 50, width: 196, height: 400 }

  it('maps a point on the canvas to board units', () => {
    expect(toBoard(rect, 100 + 98, 50 + 200)).toEqual([BOARD_W / 2, BOARD_H / 2])
  })

  it('maps points outside the canvas without clamping', () => {
    const [x, y] = toBoard(rect, 50, 450)
    expect(x).toBeCloseTo((-50 / 196) * BOARD_W)
    expect(y).toBeCloseTo(BOARD_H)
  })
})
