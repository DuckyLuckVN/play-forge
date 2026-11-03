// Heavy Hitter and Fireballs are rarer; heroes built for them still find them.
import { describe, expect, it } from 'vitest'
import { BOOSTS, rollChoices } from './boosts'
import { HEROES, type HeroId } from './heroes'
import { createRun } from './run'
import type { BoostId } from './types'

function offers(hero: HeroId, id: BoostId, rolls = 600): number {
  const s = createRun(7)
  s.hero = hero
  let seen = 0
  for (let i = 0; i < rolls; i++) {
    s.boosts = {}
    if (rollChoices(s).includes(id)) seen++
  }
  return seen / rolls
}

describe('skill rarity', () => {
  it('Heavy Hitter is rare, Fireballs epic', () => {
    expect(BOOSTS.damage.rarity).toBe('rare')
    expect(BOOSTS.fireball.rarity).toBe('epic')
  })
})

describe('hero affinity', () => {
  it('damage heroes favour Heavy Hitter; fire heroes favour Fireballs', () => {
    expect(HEROES.berserker.affinity).toContain('damage')
    expect(HEROES.sorcerer.affinity).toContain('damage')
    expect(HEROES.pyro.affinity).toContain('fireball')
    expect(HEROES.dragon.affinity).toContain('fireball')
  })

  it('a fire hero is offered Fireballs far more often than the Rookie', () => {
    const rookie = offers('rookie', 'fireball')
    const pyro = offers('pyro', 'fireball')
    expect(pyro).toBeGreaterThan(rookie * 3)
    expect(pyro).toBeLessThan(0.6) // still not every screen
  })

  it('a damage hero is offered Heavy Hitter more often than the Rookie', () => {
    expect(offers('berserker', 'damage')).toBeGreaterThan(offers('rookie', 'damage') * 1.5)
  })
})
