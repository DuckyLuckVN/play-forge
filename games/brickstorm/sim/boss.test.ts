import { describe, expect, it } from 'vitest'
import { BOSS_EVERY, bossHp, bossParts, rollTraits, spawnBoss } from './boss'
import { damageBrick } from './damage'
import { dims } from './dims'
import { revive, useHelper } from './meta'
import { hpScale } from './rows'
import { drainEvents, startNextTurn } from './run'
import { empty } from './testing'
import type { BossTrait, RunState } from './types'

/** A run at turn 29 with some firepower, about to meet its first boss. */
function beforeBoss(seed = 1, balls = 20): RunState {
  const s = empty(seed)
  s.turn = BOSS_EVERY - 1
  s.ballCount = balls
  return s
}

function withBoss(traits: BossTrait[] = [], seed = 1): RunState {
  const s = beforeBoss(seed)
  s.turn = BOSS_EVERY
  spawnBoss(s, traits)
  return s
}

describe('boss', () => {
  it('arrives every 30 turns instead of a row, as a 3×2 block at the top', () => {
    const s = beforeBoss()
    startNextTurn(s)
    expect(s.turn).toBe(30)
    expect(s.boss).toBeTruthy()
    const parts = bossParts(s)
    expect(parts).toHaveLength(6)
    expect(s.bricks.filter((b) => b.kind !== 'boss')).toHaveLength(0)
    expect(new Set(parts.map((b) => b.row))).toEqual(new Set([0, 1]))
    const cols = [...new Set(parts.map((b) => b.col))].sort((a, b) => a - b)
    expect(cols).toEqual([2, 3, 4])
    expect(drainEvents(s).some((e) => e.type === 'boss')).toBe(true)
  })

  it('stops new rows while it is alive', () => {
    const s = withBoss()
    startNextTurn(s)
    expect(s.bricks.filter((b) => b.kind !== 'boss')).toHaveLength(0)
  })

  it('has hp in line with the run: its turn and its firepower', () => {
    const weak = beforeBoss(1, 5)
    const strong = beforeBoss(1, 60)
    weak.turn = strong.turn = BOSS_EVERY
    expect(bossHp(strong)).toBeGreaterThan(bossHp(weak))
    for (const s of [weak, strong]) {
      expect(bossHp(s)).toBeGreaterThanOrEqual(hpScale(s.turn) * 4)
      expect(bossHp(s)).toBeLessThanOrEqual(hpScale(s.turn) * 14)
    }
  })

  it('shares one hp pool across its parts', () => {
    const s = withBoss()
    const start = s.boss!.hp
    const [a, b] = bossParts(s)
    damageBrick(s, a, 10, 'ball')
    damageBrick(s, b, 15, 'ball')
    expect(s.boss!.hp).toBe(start - 25)
    for (const p of bossParts(s)) expect(p.hp).toBe(s.boss!.hp)
  })

  it('pays out and clears away when beaten', () => {
    const s = withBoss()
    drainEvents(s)
    const coins = s.coins
    damageBrick(s, bossParts(s)[0], 1e9, 'ball')
    expect(s.boss).toBeNull()
    expect(bossParts(s)).toHaveLength(0)
    expect(s.coins).toBeGreaterThan(coins)
    expect(s.pendingPicks).toBe(1)
    expect(drainEvents(s).find((e) => e.type === 'bossDown')).toBeTruthy()
  })

  it('rolls 1 or 2 traits from the seed', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = beforeBoss(seed)
      const traits = rollTraits(s)
      expect(traits.length).toBeGreaterThanOrEqual(1)
      expect(traits.length).toBeLessThanOrEqual(2)
      expect(new Set(traits).size).toBe(traits.length)
      expect(rollTraits(beforeBoss(seed))).toEqual(traits)
    }
  })

  it('armored: plain balls do half damage, fire does full', () => {
    const s = withBoss(['armored'])
    const start = s.boss!.hp
    damageBrick(s, bossParts(s)[0], 10, 'ball')
    expect(s.boss!.hp).toBe(start - 5)
    damageBrick(s, bossParts(s)[0], 10, 'fire')
    expect(s.boss!.hp).toBe(start - 15)
  })

  it('shield: heals a little each turn, never past full', () => {
    const s = withBoss(['shield'])
    const max = s.boss!.maxHp
    s.boss!.hp = max / 2
    startNextTurn(s)
    expect(s.boss!.hp).toBeGreaterThan(max / 2)
    s.boss!.hp = max
    startNextTurn(s)
    expect(s.boss!.hp).toBe(max)
  })

  it('minions: summons small bricks each turn', () => {
    const s = withBoss(['minions'])
    startNextTurn(s)
    const minions = s.bricks.filter((b) => b.kind !== 'boss')
    expect(minions.length).toBe(2)
    for (const m of minions) expect(m.hp).toBeLessThan(s.boss!.maxHp / 4)
  })

  it('drifter: slides a column each turn and turns at the walls', () => {
    const s = withBoss(['drifter'])
    const left = () => Math.min(...bossParts(s).map((b) => b.col))
    const seen: number[] = [left()]
    for (let i = 0; i < 8; i++) {
      startNextTurn(s)
      seen.push(left())
    }
    for (let i = 1; i < seen.length; i++) expect(Math.abs(seen[i] - seen[i - 1])).toBe(1)
    expect(Math.min(...seen)).toBe(0)
    expect(Math.max(...seen)).toBe(s.cols - 3)
  })

  it('enrage: below half hp it drops an extra row each turn', () => {
    const s = withBoss(['enrage'])
    const top = () => Math.min(...bossParts(s).map((b) => b.row))
    startNextTurn(s)
    expect(top()).toBe(0)
    s.boss!.hp = s.boss!.maxHp / 3
    startNextTurn(s)
    expect(top()).toBe(1)
  })

  it('takes a big hit from Row Bomb instead of losing a piece', () => {
    const s = withBoss()
    s.phase = 'aim'
    const start = s.boss!.hp
    useHelper(s, 'rowBomb')
    expect(bossParts(s)).toHaveLength(6)
    expect(s.boss!.hp).toBeLessThan(start)
  })

  it('stays whole through Push Back and a revive', () => {
    const s = withBoss()
    s.phase = 'aim'
    useHelper(s, 'pushBack')
    expect(bossParts(s)).toHaveLength(6)
    for (const p of bossParts(s)) p.row += dims(s).dangerRow - 2
    s.phase = 'over'
    revive(s)
    expect(bossParts(s)).toHaveLength(6)
    expect(Math.min(...bossParts(s).map((b) => b.row))).toBe(0)
  })

  it('leaves older saved runs (no boss field) working', () => {
    const s = beforeBoss()
    s.turn = 12
    delete (s as Partial<RunState>).boss
    startNextTurn(s)
    expect(s.bricks.length).toBeGreaterThan(0)
  })
})
