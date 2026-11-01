import { describe, expect, it } from 'vitest'
import { boostSlots, modsOf, runMods } from './boosts'
import { DANGER_ROW } from './config'
import { heroFreezes, heroHitMult } from './health'
import { HERO_IDS, HEROES, heroOf, heroPerks, isHeroId } from './heroes'
import { createRun, drainEvents, fire } from './run'
import { brick, runVolley } from './testing'
import { killBrick } from './damage'

describe('heroes', () => {
  it('has at least 20 heroes, unique, with the Rookie free', () => {
    expect(HERO_IDS.length).toBeGreaterThanOrEqual(20)
    expect(new Set(HERO_IDS).size).toBe(HERO_IDS.length)
    expect(HEROES.rookie.price).toBe(0)
    for (const id of HERO_IDS) {
      expect(HEROES[id].id).toBe(id)
      expect(HEROES[id].hp).toBeGreaterThan(0)
    }
  })

  it('every paid hero has a trade-off and a perk; the card lists them good first', () => {
    for (const id of HERO_IDS.filter((id) => id !== 'rookie')) {
      const perks = heroPerks(HEROES[id])
      expect(
        perks.some((p) => p.good),
        id,
      ).toBe(true)
      expect(
        perks.some((p) => !p.good),
        id,
      ).toBe(true)
      const firstBad = perks.findIndex((p) => !p.good)
      expect(perks.slice(firstBad).every((p) => !p.good)).toBe(true)
    }
  })

  it('runs from before heroes count as the Rookie', () => {
    expect(heroOf({}).id).toBe('rookie')
    expect(isHeroId('knight')).toBe(true)
    expect(isHeroId('nope')).toBe(false)
  })

  it('applies the hero’s multipliers and free skill levels on top of skills', () => {
    expect(modsOf({}, 'sorcerer').damageMult).toBeCloseTo(1.6)
    expect(modsOf({ damage: 1 }, 'sorcerer').damageMult).toBeCloseTo(1.2 * 1.6)
    expect(modsOf({}, 'pyro').fireChance).toBe(0.08)
    expect(modsOf({ fireball: 1 }, 'pyro').fireChance).toBe(0.125)
    expect(modsOf({}).fireChance).toBe(0)
    expect(runMods(createRun(1, 'baron')).coinMult).toBeCloseTo(1.6)
  })

  it('the Pirate starts with more balls, the Tinker with a skill slot', () => {
    expect(createRun(1, 'pirate').ballCount).toBe(4)
    expect(boostSlots(createRun(1, 'tinker'))).toBe(boostSlots(createRun(1)) + 1)
  })

  it('the Berserker hits harder as health runs low; the Paladin hits bosses harder', () => {
    const s = createRun(1, 'berserker')
    const full = heroHitMult(s, false)
    s.hp = 1
    expect(heroHitMult(s, false)).toBeGreaterThan(full)
    expect(heroHitMult(createRun(1, 'paladin'), true)).toBe(1.5)
    expect(heroHitMult(createRun(1, 'paladin'), false)).toBe(1)
  })

  it('the Cleric regenerates every turn', () => {
    const s = createRun(1, 'cleric')
    s.bricks = []
    s.pickups = []
    s.hp = 50
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.hp).toBe(52)
  })

  it('the Vampire heals from kills; the Necromancer gets a ball every few kills', () => {
    const v = createRun(1, 'vampire')
    v.hp = 50
    killBrick(v, brick(v, 3, 3, 1), 0)
    expect(v.hp).toBeCloseTo(50.3)
    const n = createRun(1, 'necro')
    for (let i = 0; i < 30; i++) killBrick(n, brick(n, i % 7, 5, 1), 0)
    expect(n.pendingBalls).toBe(1)
    expect(drainEvents(n).some((e) => e.type === 'heroSkill')).toBe(true)
  })

  it('the Frost Witch holds the bricks in place every few turns', () => {
    const s = createRun(1, 'frost')
    s.bricks = []
    s.pickups = []
    s.turn = HEROES.frost.frostEvery!
    expect(heroFreezes(s)).toBe(true)
    const b = brick(s, 0, DANGER_ROW - 1, 1e6)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(b.row).toBe(DANGER_ROW - 1)
    expect(s.hp).toBe(s.maxHp)
  })
})
