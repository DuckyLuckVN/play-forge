// Crash damage: a crowd of bricks crashing together hurts less per brick, a
// worn-down brick barely hurts, and plain bricks can't take a full hero down in
// one turn.
import { describe, expect, it } from 'vitest'
import { DANGER_ROW } from './config'
import { BREACH_TURN_CAP, breachDamage, brickBreach, resolveBreaches } from './health'
import { brick, empty } from './testing'

describe('crash damage', () => {
  it('each extra brick in the same crash hurts less than the one before', () => {
    const s = empty()
    s.turn = 20
    const one = breachDamage(s, [brick(s, 0, DANGER_ROW, 10)])
    const row = [0, 1, 2, 3].map((c) => brick(s, c, DANGER_ROW, 10))
    const four = breachDamage(s, row)
    expect(four).toBeGreaterThan(one * 2)
    expect(four).toBeLessThan(one * 3)
  })

  it('the hardest-hitting bricks count first (order on the board does not matter)', () => {
    const s = empty()
    s.turn = 20
    const worn = brick(s, 0, DANGER_ROW, 10)
    worn.hp = 1
    const fresh = brick(s, 1, DANGER_ROW, 10)
    expect(breachDamage(s, [worn, fresh])).toBe(breachDamage(s, [fresh, worn]))
  })

  it('a nearly broken brick hurts about a quarter of a fresh one', () => {
    const s = empty()
    s.turn = 20
    const fresh = brick(s, 0, DANGER_ROW, 100)
    const worn = brick(s, 1, DANGER_ROW, 100)
    worn.hp = 1
    expect(brickBreach(s, worn) / brickBreach(s, fresh)).toBeLessThan(0.3)
  })

  it('plain bricks take at most BREACH_TURN_CAP of max health in one turn', () => {
    const s = empty()
    s.turn = 200
    for (let c = 0; c < s.cols; c++) brick(s, c, DANGER_ROW, 1000)
    expect(resolveBreaches(s)).toBe(false)
    expect(s.hp).toBeCloseTo(s.maxHp * (1 - BREACH_TURN_CAP), 0)
  })

  it('missiles still go past the one-turn ceiling', () => {
    const s = empty()
    s.turn = 200
    for (let c = 0; c < s.cols; c++) {
      const b = brick(s, c, DANGER_ROW, 1000)
      b.role = 'missile'
    }
    expect(breachDamage(s, s.bricks)).toBeGreaterThan(s.maxHp * BREACH_TURN_CAP)
  })
})
