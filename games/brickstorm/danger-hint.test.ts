import { describe, expect, it } from 'vitest'
import { dangerHint } from './danger-hint'
import { dims } from './sim/dims'
import { brick, empty } from './sim/testing'

const none = { pushBack: 0, freeze: 0, megaBomb: 0, rowBomb: 0 }

function near(rowsAbove: number) {
  const s = empty()
  brick(s, 2, dims(s).dangerRow - rowsAbove, 5)
  return s
}

describe('dangerHint', () => {
  it('says nothing while bricks are far from the line', () => {
    expect(dangerHint(near(4), none)).toBeNull()
  })

  it('offers an owned rescue helper when bricks are 2 rows from the line', () => {
    expect(dangerHint(near(2), { ...none, rowBomb: 1 })).toEqual({ use: 'rowBomb' })
    expect(dangerHint(near(1), { ...none, freeze: 2, pushBack: 1 })).toEqual({ use: 'pushBack' })
  })

  it('points to the shop when no rescue helper is owned', () => {
    expect(dangerHint(near(1), none)).toEqual({ shop: true })
  })

  it('only while aiming', () => {
    const s = near(1)
    s.phase = 'volley'
    expect(dangerHint(s, none)).toBeNull()
  })
})
