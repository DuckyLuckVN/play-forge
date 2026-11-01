import { describe, expect, it } from 'vitest'
import { boostSlots, needsReplace, pickBoost, rollChoices, slottedBoosts } from './boosts'
import { spawnBoss } from './boss'
import { damageBrick } from './damage'
import { empty } from './testing'
import type { BoostId, RunState } from './types'

function picking(boosts: RunState['boosts'], choices: BoostId[], seed = 1): RunState {
  const s = empty(seed)
  s.boosts = boosts
  s.phase = 'pick'
  s.pendingPicks = 1
  s.choices = choices
  return s
}

describe('boost slots', () => {
  it('start at 3 and grow by 1 for every boss beaten', () => {
    const s = empty()
    expect(boostSlots(s)).toBe(3)
    s.turn = 30
    s.ballCount = 10
    spawnBoss(s, [])
    damageBrick(
      s,
      s.bricks.find((b) => b.kind === 'boss')!,
      1e9,
      'laser',
    )
    expect(s.bossesBeaten).toBe(1)
    expect(boostSlots(s)).toBe(4)
  })

  it('treat old saved runs without the count as no bosses beaten', () => {
    const s = empty()
    delete (s as Partial<RunState>).bossesBeaten
    expect(boostSlots(s)).toBe(3)
  })

  it('count only lasting boosts: instant ones (+2 balls, Double Down) take no slot', () => {
    expect(slottedBoosts({ damage: 2, crit: 1, balls: 4, double: 1 })).toEqual(['damage', 'crit'])
  })

  it('level up an owned boost freely when full', () => {
    const s = picking({ damage: 1, crit: 1, speed: 1 }, ['damage', 'twin', 'big'])
    expect(needsReplace(s, 'damage')).toBe(false)
    pickBoost(s, 'damage')
    expect(s.boosts.damage).toBe(2)
  })

  it('need a boost to replace before taking a new one when full', () => {
    const s = picking({ damage: 1, crit: 1, speed: 1 }, ['twin', 'big', 'magnet'])
    expect(needsReplace(s, 'twin')).toBe(true)
    pickBoost(s, 'twin')
    expect(s.boosts.twin).toBeUndefined()
    expect(s.phase).toBe('pick')
    pickBoost(s, 'twin', 'twin')
    expect(s.boosts.twin).toBeUndefined()
    pickBoost(s, 'twin', 'crit')
    expect(s.boosts).toEqual({ damage: 1, speed: 1, twin: 1 })
    expect(s.phase).toBe('aim')
  })

  it('let instant boosts in even when full', () => {
    const s = picking({ damage: 1, crit: 1, speed: 1 }, ['balls', 'big', 'magnet'])
    expect(needsReplace(s, 'balls')).toBe(false)
    pickBoost(s, 'balls')
    expect(s.boosts.balls).toBe(1)
  })

  it('keep an old run with more boosts than slots, but ask to replace for a new one', () => {
    const s = picking({ damage: 1, crit: 1, speed: 1, big: 1, keeper: 1 }, ['twin', 'big', 'magnet'])
    expect(needsReplace(s, 'big')).toBe(false)
    expect(needsReplace(s, 'twin')).toBe(true)
  })

  it('lean about 30% of offers toward owned boosts when full, and not at all when not', () => {
    let owned = 0
    let total = 0
    let ownedFree = 0
    for (let seed = 1; seed <= 400; seed++) {
      const full = empty(seed)
      full.boosts = { crit: 1, speed: 1, keeper: 1 }
      for (const id of rollChoices(full)) {
        total++
        if (full.boosts[id]) owned++
      }
      const free = empty(seed)
      free.boosts = { crit: 1 }
      ownedFree += rollChoices(free).filter((id) => free.boosts[id]).length
    }
    expect(owned / total).toBeGreaterThan(0.22)
    expect(owned / total).toBeLessThan(0.4)
    expect(ownedFree / total).toBeLessThan(0.1)
  })
})
