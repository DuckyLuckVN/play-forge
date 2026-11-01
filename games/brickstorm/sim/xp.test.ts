import { describe, expect, it } from 'vitest'
import { levelPower, xpToNext, xpTotal } from './boosts'
import { BOSS_XP_PER_TURN, KILL_XP, LEVEL_POWER, XP_PER_BRICK } from './config'
import { damageBrick, xpComboMultiplier } from './damage'
import { BOSS_EVERY, bigHit, bossParts, bossXp, spawnBoss } from './boss'
import { fire } from './run'
import { brick, empty, runVolley } from './testing'

describe('xp from damage, breaks and combo', () => {
  it('pays for damage as a share of the brick, even when it survives', () => {
    const s = empty()
    const b = brick(s, 0, 0, 10)
    damageBrick(s, b, 4, 'ball')
    expect(s.xp).toBeCloseTo(XP_PER_BRICK * 0.4)
  })

  it('adds a kill bonus and ignores overkill', () => {
    const s = empty()
    const b = brick(s, 0, 0, 2)
    damageBrick(s, b, 50, 'ball')
    expect(s.xp).toBeCloseTo(XP_PER_BRICK + KILL_XP)
  })

  it('armour caps the damage that counts', () => {
    const s = empty()
    const b = Object.assign(brick(s, 0, 0, 10), { kind: 'armored' as const })
    damageBrick(s, b, 5, 'ball')
    expect(s.xp).toBeCloseTo(XP_PER_BRICK * 0.1)
  })

  it('a high combo multiplies xp', () => {
    const xpAt = (combo: number) => {
      const s = empty()
      s.combo = combo
      damageBrick(s, brick(s, 0, 0, 10), 5, 'ball')
      return s.xp
    }
    expect(xpAt(25) / xpAt(0)).toBeCloseTo(xpComboMultiplier(25))
    expect(xpAt(100) / xpAt(0)).toBeCloseTo(xpComboMultiplier(100))
    expect(xpComboMultiplier(0)).toBe(1)
    expect(xpComboMultiplier(24)).toBe(1)
    expect(xpComboMultiplier(100)).toBeGreaterThan(xpComboMultiplier(50))
    expect(xpComboMultiplier(50)).toBeGreaterThan(xpComboMultiplier(25))
  })

  it('brain stacks on top', () => {
    const s = empty()
    s.boosts = { brain: 1 }
    damageBrick(s, brick(s, 0, 0, 10), 5, 'ball')
    expect(s.xp).toBeCloseTo(XP_PER_BRICK * 0.5 * 1.3)
  })

  it('hitting a boss earns no xp', () => {
    const s = empty()
    s.turn = BOSS_EVERY
    s.ballCount = 20
    spawnBoss(s, [], 'block')
    damageBrick(s, bossParts(s)[0], 5, 'ball')
    expect(s.boss).not.toBeNull()
    expect(s.xp).toBe(0)
    expect(s.level).toBe(0)
  })

  const killBossAt = (turn: number, level: number) => {
    const s = empty()
    s.turn = turn
    s.ballCount = 20
    s.level = level
    s.combo = 120 // the combo doesn't multiply it
    spawnBoss(s, [], 'block')
    damageBrick(s, bossParts(s)[0], 1e9, 'ball')
    expect(s.boss).toBeNull()
    return xpTotal(s.level, s.xp) - xpTotal(level, 0)
  }

  it('killing a boss pays xp that grows with the turn', () => {
    expect(bossXp(BOSS_EVERY, 9)).toBe(BOSS_XP_PER_TURN * BOSS_EVERY)
    expect(killBossAt(BOSS_EVERY, 9)).toBeCloseTo(BOSS_XP_PER_TURN * BOSS_EVERY)
    expect(bossXp(2 * BOSS_EVERY, 20)).toBeGreaterThan(bossXp(BOSS_EVERY, 20))
  })

  it('but never more than one level', () => {
    expect(bossXp(300, 2)).toBe(xpToNext(2))
    expect(killBossAt(300, 2)).toBeCloseTo(xpToNext(2))
  })

  it('a boss finished off by a big hit (Row Bomb) pays its xp too', () => {
    const s = empty()
    s.turn = BOSS_EVERY
    s.ballCount = 20
    spawnBoss(s, [], 'block')
    s.boss!.hp = 1
    bigHit(s)
    expect(s.boss).toBeNull()
    expect(s.level).toBe(1)
  })

  it('crossing the line levels up', () => {
    const s = empty()
    s.xp = xpToNext(0) - 0.01
    damageBrick(s, brick(s, 0, 0, 10), 1, 'ball')
    expect(s.level).toBe(1)
  })
  it('every level makes balls hit a little harder', () => {
    expect(levelPower(0)).toBe(1)
    expect(levelPower(5)).toBeCloseTo(1 + 5 * LEVEL_POWER)
    const dealt = (level: number) => {
      const s = empty()
      s.level = level
      const b = brick(s, 3, 5, 1000)
      fire(s, Math.PI / 2)
      runVolley(s)
      return 1000 - b.hp
    }
    expect(dealt(5) / dealt(0)).toBeCloseTo(levelPower(5))
  })

  it('a real volley earns xp from hits on a brick that survives', () => {
    const s = empty()
    const b = brick(s, 3, 5, 1000)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(b.hp).toBeLessThan(1000)
    expect(s.bricks).toContain(b)
    expect(s.xp).toBeGreaterThan(0)
  })
})
