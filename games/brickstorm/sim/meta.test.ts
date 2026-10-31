import { describe, expect, it } from 'vitest'
import { reroll, rerollCost } from './boosts'
import { DANGER_ROW } from './config'
import { applyHelpers, revive, reviveCost } from './meta'
import { brick, empty } from './testing'

describe('reroll', () => {
  it('doubles in cost with each use in a run', () => {
    const s = empty()
    s.phase = 'pick'
    s.choices = ['balls', 'damage', 'coins']
    expect(rerollCost(s)).toBe(25)
    reroll(s)
    expect(rerollCost(s)).toBe(50)
    reroll(s)
    expect(rerollCost(s)).toBe(100)
    expect(s.rerollsUsed).toBe(2)
  })
})

describe('revive', () => {
  it('clears the 3 lowest rows and continues', () => {
    const s = empty()
    const kept = brick(s, 1, DANGER_ROW - 3, 5)
    brick(s, 0, DANGER_ROW, 5)
    brick(s, 2, DANGER_ROW - 1, 5)
    brick(s, 3, DANGER_ROW - 2, 5)
    s.phase = 'over'
    revive(s)
    expect(s.phase).toBe('aim')
    expect(s.bricks).toEqual([kept])
    expect(s.revivesUsed).toBe(1)
  })

  it('only works after game over', () => {
    const s = empty()
    brick(s, 0, DANGER_ROW - 1, 5)
    revive(s)
    expect(s.bricks).toHaveLength(1)
    expect(s.revivesUsed).toBe(0)
  })

  it('costs more each time', () => {
    const s = empty()
    expect(reviveCost(s)).toBe(100)
    s.revivesUsed = 2
    expect(reviveCost(s)).toBe(300)
  })
})

describe('applyHelpers', () => {
  it('adds balls and opens a free pick', () => {
    const s = empty()
    applyHelpers(s, { headStart: true, luckyStart: true })
    expect(s.ballCount).toBe(6)
    expect(s.phase).toBe('pick')
    expect(s.pendingPicks).toBe(1)
    expect(s.choices).toHaveLength(3)
  })

  it('does nothing without helpers', () => {
    const s = empty()
    applyHelpers(s, { headStart: false, luckyStart: false })
    expect(s.ballCount).toBe(1)
    expect(s.phase).toBe('aim')
  })
})
