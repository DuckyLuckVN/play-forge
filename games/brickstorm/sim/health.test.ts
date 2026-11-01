import { describe, expect, it } from 'vitest'
import { DANGER_ROW } from './config'
import { BOSS_HEAL, breachDamage, breachUnit, HEART_HEAL, heal, POTION_HEAL, resolveBreaches } from './health'
import { revive, useHelper } from './meta'
import { heartChance } from './rows'
import { applyPickup, createRun, drainEvents, fire } from './run'
import { isStormTurn, stormWave } from './storm'
import { brick, empty, runVolley } from './testing'

describe('hero health', () => {
  it('a new run starts at the hero’s full health', () => {
    const s = createRun(1)
    expect(s.hero).toBe('rookie')
    expect(s.hp).toBe(100)
    expect(s.maxHp).toBe(100)
    expect(createRun(1, 'titan').maxHp).toBe(220)
  })

  it('a brick reaching the line crashes: it is gone, the hero is hurt, the run goes on', () => {
    const s = empty()
    brick(s, 0, DANGER_ROW - 1, 999)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(s.phase).toBe('aim')
    expect(s.hp).toBeLessThan(100)
    expect(s.bricks.some((b) => b.row >= DANGER_ROW)).toBe(false)
    const e = drainEvents(s).find((e) => e.type === 'breach')
    expect(e).toMatchObject({ type: 'breach', boss: false })
    expect(e && 'at' in e && e.at).toHaveLength(1)
  })

  it('worn-down bricks hurt less than fresh ones, and late crashes hurt more', () => {
    const s = empty()
    const fresh = brick(s, 0, DANGER_ROW, 100)
    const worn = brick(s, 1, DANGER_ROW, 100)
    worn.hp = 1
    expect(breachDamage(s, [worn])).toBeLessThan(breachDamage(s, [fresh]))
    expect(breachUnit(150)).toBeGreaterThan(breachUnit(10))
  })

  it('tough heroes take less crash damage, glass ones more', () => {
    const rook = empty()
    const knight = createRun(1, 'knight')
    const nyx = createRun(1, 'sorcerer')
    for (const s of [rook, knight, nyx]) s.bricks = []
    const dmg = (s: typeof rook) => breachDamage(s, [brick(s, 0, DANGER_ROW, 10)])
    expect(dmg(knight)).toBeLessThan(dmg(rook))
    expect(dmg(nyx)).toBeGreaterThan(dmg(rook))
  })

  it('a crash that takes the last health ends the run', () => {
    const s = empty()
    s.hp = 1
    brick(s, 0, DANGER_ROW, 10)
    expect(resolveBreaches(s)).toBe(true)
    expect(s.hp).toBe(0)
  })

  it('healing never goes past max health and reports what it gave', () => {
    const s = empty()
    s.hp = 95
    expect(heal(s, 20, 'heart')).toBe(5)
    expect(s.hp).toBe(100)
    expect(heal(s, 20, 'heart')).toBe(0)
  })

  it('a heart pickup heals a share of max health', () => {
    const s = empty()
    s.hp = 10
    applyPickup(s, { id: 99, col: 0, row: 0, kind: 'heart' })
    expect(s.hp).toBeCloseTo(10 + 100 * HEART_HEAL)
  })

  it('hearts show up only when hurt, more often the more is missing', () => {
    expect(heartChance({ hp: 100, maxHp: 100 })).toBe(0)
    expect(heartChance({ hp: 20, maxHp: 100 })).toBeGreaterThan(heartChance({ hp: 80, maxHp: 100 }))
  })

  it('revive brings health back to at least half', () => {
    const s = empty()
    s.hp = 0
    s.phase = 'over'
    revive(s)
    expect(s.hp).toBe(50)
  })

  it('a potion heals, and is kept (not used) at full health', () => {
    const s = empty()
    expect(useHelper(s, 'potion')).toBe(false)
    s.hp = 20
    expect(useHelper(s, 'potion')).toBe(true)
    expect(s.hp).toBe(20 + 100 * POTION_HEAL)
  })

  it('beating a boss heals', () => {
    expect(BOSS_HEAL).toBeGreaterThan(0)
  })
})

describe('storm turns', () => {
  it('come every 30 turns from 45, then every 15 from 150, never on boss or jackpot turns', () => {
    const storms = Array.from({ length: 200 }, (_, i) => i + 1).filter(isStormTurn)
    expect(storms.slice(0, 4)).toEqual([45, 75, 105, 135])
    expect(storms).toContain(155)
    expect(storms).toContain(165)
    for (const t of storms) {
      expect(t % 30).not.toBe(0)
      expect(t % 10).not.toBe(0)
    }
  })

  it('a storm wave changes the new row and always brings a heart', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = createRun(seed)
      s.turn = 45
      s.ballCount = 20
      stormWave(s)
      const e = drainEvents(s).find((e) => e.type === 'storm')
      expect(e).toBeTruthy()
      expect(s.pickups.some((p) => p.kind === 'heart' && p.row === 0)).toBe(true)
    }
  })
})
