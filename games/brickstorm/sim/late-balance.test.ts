// Late-game balance: your damage and ball skills must still pay off at the hp
// cap, and a single crash must not one-shot the hero late in a run.
import { describe, expect, it } from 'vitest'
import { DANGER_ROW } from './config'
import { BREACH_CAP, brickBreach, breachUnit } from './health'
import { CAP_KNEE, hpCap } from './rows'
import { createRun } from './run'
import { brick, empty } from './testing'

const capFor = (ballCount: number, boosts: Record<string, number>, turn = 164) => {
  const s = empty()
  s.turn = turn
  s.ballCount = ballCount
  s.boosts = boosts
  return hpCap(s)
}

describe('hp cap and your build', () => {
  it('a weak build keeps the cap it always had (balls × damage, so a short run stays playable)', () => {
    // 20 balls, no skills: well under the knee.
    const one = capFor(10, {})
    expect(capFor(20, {})).toBeCloseTo(2 * one, -1)
  })

  it('above the knee, damage skills raise brick hp by less than they raise your damage', () => {
    // A strong late build: 149 balls; Heavy Hitter ×6 and Glass Cannon (×4.4 damage).
    const base = capFor(149, {})
    const strong = capFor(149, { damage: 6, glass: 1 })
    expect(149 * 4.4).toBeGreaterThan(CAP_KNEE) // firepower well past the knee
    // Bricks get tougher, but by clearly less than ×4.4: the skills pay off.
    expect(strong / base).toBeGreaterThan(1.5)
    expect(strong / base).toBeLessThan(4.4 * 0.75)
  })

  it('more balls still help a strong build: the cap grows slower than the ball count', () => {
    expect(capFor(300, {}) / capFor(150, {})).toBeLessThan(1.8)
  })
})

describe('crash damage late in a run', () => {
  it('one crashing brick takes at most BREACH_CAP, so the Rookie survives a late crash', () => {
    const s = createRun(1)
    s.bricks = []
    s.turn = 164
    expect(breachUnit(164)).toBeGreaterThan(BREACH_CAP) // the raw curve would one-shot
    const b = brick(s, 0, DANGER_ROW, 1000)
    expect(brickBreach(s, b)).toBeLessThanOrEqual(BREACH_CAP)
    expect(brickBreach(s, b)).toBeLessThan(s.maxHp)
  })

  it('early crashes are unchanged (below the cap)', () => {
    const s = empty()
    s.turn = 30
    const b = brick(s, 0, DANGER_ROW, 10)
    expect(brickBreach(s, b)).toBeCloseTo(breachUnit(30))
  })

  it('missiles and glass heroes still hurt more on top of the cap', () => {
    const s = createRun(1, 'sorcerer')
    s.bricks = []
    s.turn = 164
    const b = brick(s, 0, DANGER_ROW, 10)
    expect(brickBreach(s, b)).toBeCloseTo(BREACH_CAP * 1.4)
    const m = brick(s, 1, DANGER_ROW, 10)
    m.role = 'missile'
    expect(brickBreach(s, m)).toBeCloseTo(BREACH_CAP * 1.4 * 2)
  })
})
