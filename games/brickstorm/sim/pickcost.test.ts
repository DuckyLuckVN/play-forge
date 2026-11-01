import { describe, expect, it } from 'vitest'
import { holdBoost, holdCost, pickBoost, pickCost, rollChoices, skipPick } from './boosts'
import { spawnBoss } from './boss'
import { damageBrick } from './damage'
import { openPickOrAim } from './run'
import { empty } from './testing'
import type { BoostId, RunState } from './types'

function picking(
  level: number,
  boosts: RunState['boosts'] = {},
  choices: BoostId[] = ['damage', 'twin', 'big'],
): RunState {
  const s = empty()
  s.level = level
  s.boosts = boosts
  s.phase = 'pick'
  s.pendingPicks = 1
  s.choices = choices
  return s
}

describe('pick prices', () => {
  it('the first level-up of a run is free; later ones cost more each level', () => {
    expect(pickCost(picking(2), 'twin')).toBe(0)
    const a = pickCost(picking(3), 'twin')
    const b = pickCost(picking(6), 'twin')
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
  })

  it('upgrading a boost you own costs more than a new one, more per level', () => {
    const fresh = pickCost(picking(5), 'damage')
    const up1 = pickCost(picking(5, { damage: 1 }), 'damage')
    const up3 = pickCost(picking(5, { damage: 3 }), 'damage')
    expect(up1).toBeGreaterThan(fresh)
    expect(up3).toBeGreaterThan(up1)
  })

  it('a boss reward pick is free', () => {
    const s = empty()
    s.turn = 30
    s.ballCount = 10
    s.level = 9
    spawnBoss(s, [], 'block')
    damageBrick(s, s.bricks[0], 1e9, 'blast')
    openPickOrAim(s)
    expect(s.phase).toBe('pick')
    expect(pickCost(s, s.choices[0])).toBe(0)
    pickBoost(s, s.choices[0])
    expect(s.freePicks).toBe(0)
  })
})

describe('holding a boost', () => {
  it('keeps a card for the next level-up, as an extra card', () => {
    const s = picking(4)
    holdBoost(s, 'twin')
    expect(s.held).toBe('twin')
    expect(s.choices).not.toContain('twin')
    pickBoost(s, 'damage')
    s.pendingPicks = 1
    s.phase = 'pick'
    s.choices = rollChoices(s)
    expect(s.choices).toContain('twin')
    expect(s.choices.filter((id) => id === 'twin')).toHaveLength(1)
  })

  it('lasts one level-up: taken or not, it is gone after', () => {
    const s = picking(4)
    holdBoost(s, 'twin')
    pickBoost(s, 'damage')
    s.pendingPicks = 1
    s.phase = 'pick'
    s.choices = rollChoices(s)
    pickBoost(
      s,
      s.choices.find((id) => id !== 'twin')!,
    )
    expect(s.held ?? null).toBeNull()
  })

  it('one at a time, and each hold costs more', () => {
    const s = picking(4)
    const first = holdCost(s)
    holdBoost(s, 'twin')
    holdBoost(s, 'big')
    expect(s.held).toBe('twin')
    expect(s.choices).toContain('big')
    expect(holdCost(s)).toBeGreaterThan(first)
  })
})

describe('skipping a pick', () => {
  it('uses up the pick and moves on without a boost', () => {
    const s = picking(4)
    skipPick(s)
    expect(s.boosts).toEqual({})
    expect(s.pendingPicks).toBe(0)
    expect(s.phase).toBe('aim')
  })
})
