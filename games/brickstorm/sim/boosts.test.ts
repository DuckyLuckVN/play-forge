import { describe, expect, it } from 'vitest'
import { BOOSTS, modsOf, pickBoost, reroll, rollChoices, xpToNext, xpTotal } from './boosts'
import { drainEvents, fire, step } from './run'
import { brick, empty, runVolley } from './testing'
import type { BoostId } from './types'

describe('boost stats', () => {
  it('maps boost counts to modifiers', () => {
    expect(modsOf({ damage: 2, crit: 1, bouncy: 1 })).toMatchObject({
      damageMult: 1.4,
      coinMult: 1,
      speedMult: 1,
      pierceChance: 0,
      critChance: 0.05,
      bounceStep: 0.5,
    })
  })

  it('needs more xp each level', () => {
    expect([0, 1, 5].map(xpToNext)).toEqual([40, 100, 340])
  })
})

describe('rollChoices', () => {
  it('gives 3 distinct eligible boosts', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = empty(seed)
      s.boosts = { pierce: 3 } // maxed out
      const choices = rollChoices(s)
      expect(choices).toHaveLength(3)
      expect(new Set(choices).size).toBe(3)
      expect(choices).not.toContain('pierce')
    }
  })

  it('rolls each card tier first: mostly common, some rare, epic rare', () => {
    const cards = { common: 0, rare: 0, epic: 0 }
    let total = 0
    for (let seed = 1; seed <= 3000; seed++) {
      const s = empty(seed)
      for (const id of rollChoices(s)) {
        total++
        cards[BOOSTS[id].rarity]++
      }
    }
    expect(cards.common / total).toBeGreaterThan(0.72)
    expect(cards.rare / total).toBeGreaterThan(0.13)
    expect(cards.rare / total).toBeLessThan(0.22)
    expect(cards.epic / total).toBeGreaterThan(0.015)
    expect(cards.epic / total).toBeLessThan(0.06)
  })

  it('makes an epic more likely after every screen without one, then resets', () => {
    const s = empty(7)
    s.epicDry = 1000
    expect(rollChoices(s).some((id) => BOOSTS[id].rarity === 'epic')).toBe(true)
    expect(s.epicDry).toBe(0)
    const dry = empty(8)
    let shown = false
    for (let i = 0; i < 60 && !shown; i++) shown = rollChoices(dry).some((id) => BOOSTS[id].rarity === 'epic')
    expect(shown).toBe(true)
  })

  it('falls back to another tier when one has nothing left', () => {
    const s = empty()
    const maxed = Object.fromEntries(
      Object.entries(BOOSTS)
        .filter(([, b]) => b.rarity === 'common')
        .map(([id, b]) => [id, b.max]),
    )
    s.boosts = maxed
    const choices = rollChoices(s)
    expect(choices).toHaveLength(3)
    expect(choices.every((id) => BOOSTS[id].rarity !== 'common')).toBe(true)
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

  it('rerolls offer new boosts', () => {
    const s = picking(['balls', 'damage', 'coins'])
    reroll(s)
    expect(s.choices).not.toEqual(['balls', 'damage', 'coins'])
    expect(s.rerollsUsed).toBe(1)
  })
})

describe('xp in a run', () => {
  it('levels up from kills and opens a pick after the volley', () => {
    const s = empty()
    s.xp = xpToNext(0) - 1
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

  it('pierces the first brick (level 3: every ball)', () => {
    const s = empty()
    s.boosts = { pierce: 3 }
    const first = brick(s, 3, 6, 100)
    const second = brick(s, 3, 3, 100)
    fire(s, Math.PI / 2)
    while (second.hp === 100) step(s)
    expect(first.hp).toBe(99)
  })

  it('does not trap a piercing ball between stacked bricks', () => {
    const s = empty()
    s.boosts = { pierce: 3 }
    brick(s, 3, 4, 1000)
    brick(s, 3, 3, 1000)
    fire(s, Math.PI / 2)
    let hits = 0
    runVolley(s, (x) => {
      hits += drainEvents(x).filter((e) => e.type === 'hit').length
    })
    expect(hits).toBeLessThanOrEqual(3)
  })
})

describe('xpTotal', () => {
  it('counts all XP earned across levels', () => {
    expect(xpTotal(0, 5)).toBe(5)
    expect(xpTotal(1, 0)).toBe(xpToNext(0))
    expect(xpTotal(3, 2)).toBe(xpToNext(0) + xpToNext(1) + xpToNext(2) + 2)
  })
})
