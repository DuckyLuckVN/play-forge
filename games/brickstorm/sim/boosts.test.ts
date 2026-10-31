import { describe, expect, it } from 'vitest'
import { BOOSTS, modsOf, pickBoost, reroll, rollChoices, xpToNext } from './boosts'
import { drainEvents, fire, step } from './run'
import { brick, empty, runVolley } from './testing'
import type { BoostId } from './types'

describe('boost stats', () => {
  it('maps boost counts to modifiers', () => {
    expect(modsOf({ damage: 2, crit: 1, bouncy: 1 })).toEqual({
      damageMult: 1.5,
      coinMult: 1,
      speedMult: 1,
      pierce: 0,
      critChance: 0.1,
      bouncy: true,
    })
  })

  it('needs more xp each level', () => {
    expect([0, 1, 5].map(xpToNext)).toEqual([8, 14, 38])
  })
})

describe('rollChoices', () => {
  it('gives 3 distinct eligible boosts', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = empty(seed)
      s.boosts = { pierce: 1 }
      const choices = rollChoices(s)
      expect(choices).toHaveLength(3)
      expect(new Set(choices).size).toBe(3)
      expect(choices).not.toContain('pierce')
    }
  })

  it('makes epic boosts rare', () => {
    const s = empty(5)
    let epic = 0
    let total = 0
    for (let i = 0; i < 1000; i++) {
      for (const id of rollChoices(s)) {
        total++
        if (BOOSTS[id].rarity === 'epic') epic++
      }
    }
    expect(epic / total).toBeGreaterThanOrEqual(0.06)
    expect(epic / total).toBeLessThanOrEqual(0.16)
  })

  it('returns fewer when few are eligible', () => {
    const s = empty()
    const maxed = Object.fromEntries(Object.entries(BOOSTS).map(([id, b]) => [id, b.max]))
    s.boosts = { ...maxed, damage: 0 }
    expect(rollChoices(s)).toEqual(['damage'])
  })
})

describe('picking', () => {
  const picking = (choices: BoostId[], pendingPicks = 1) => {
    const s = empty()
    s.phase = 'pick'
    s.choices = choices
    s.pendingPicks = pendingPicks
    return s
  }

  it('applies the pick and returns to aiming', () => {
    const s = picking(['balls', 'damage', 'coins'])
    pickBoost(s, 'balls')
    expect(s.ballCount).toBe(3)
    expect(s.boosts.balls).toBe(1)
    expect(s.phase).toBe('aim')
  })

  it('ignores a boost that was not offered', () => {
    const s = picking(['balls', 'damage', 'coins'])
    pickBoost(s, 'crit')
    expect(s.boosts.crit).toBeUndefined()
    expect(s.phase).toBe('pick')
  })

  it('chains pending picks', () => {
    const s = picking(['balls', 'damage', 'coins'], 2)
    pickBoost(s, 'damage')
    expect(s.phase).toBe('pick')
    expect(s.choices).toHaveLength(3)
  })

  it('limits rerolls', () => {
    const s = picking(['balls', 'damage', 'coins'])
    s.rerolls = 1
    reroll(s)
    const after = s.choices
    expect(after).not.toEqual(['balls', 'damage', 'coins'])
    expect(s.rerolls).toBe(0)
    reroll(s)
    expect(s.choices).toBe(after)
  })
})

describe('xp in a run', () => {
  it('levels up from kills and opens a pick after the volley', () => {
    const s = empty()
    s.xp = 7
    brick(s, 3, 5, 1)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.level).toBe(1)
    expect(s.pendingPicks).toBe(1)
    expect(drainEvents(s).filter((e) => e.type === 'levelUp')).toHaveLength(1)
    expect(s.phase).toBe('pick')
    expect(s.choices).toHaveLength(3)
  })

  it('doubles the volley for 3 turns', () => {
    const s = empty()
    s.ballCount = 2
    s.doubleVolleys = 3
    for (let i = 0; i < 3; i++) {
      fire(s, Math.PI / 2)
      expect(s.balls).toHaveLength(4)
      runVolley(s)
      s.bricks = []
      s.pickups = []
    }
    fire(s, Math.PI / 2)
    expect(s.balls).toHaveLength(2)
  })

  it('pierces the first brick', () => {
    const s = empty()
    s.boosts = { pierce: 1 }
    const first = brick(s, 3, 6, 100)
    const second = brick(s, 3, 3, 100)
    fire(s, Math.PI / 2)
    while (second.hp === 100) step(s)
    expect(first.hp).toBe(99)
  })
})
