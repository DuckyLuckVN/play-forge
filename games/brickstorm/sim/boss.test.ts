import { describe, expect, it } from 'vitest'
import { BOSS_EVERY, bossHp, bossParts, bossTier, rollTraits, spawnBoss } from './boss'
import { BOSS_SHAPES, shapeOf } from './boss-shapes'
import { SKILL_IDS } from './boss-skills'
import { damageBrick } from './damage'
import { dims } from './dims'
import { revive, useHelper } from './meta'
import { hpScale } from './rows'
import { BRICK_INSET, CELL, TOP } from './config'
import { drainEvents, startNextTurn, step } from './run'
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
  spawnBoss(s, traits, 'block')
  return s
}

describe('boss', () => {
  it('arrives every 30 turns instead of a row, as a small body at the top', () => {
    const s = beforeBoss()
    startNextTurn(s)
    expect(s.turn).toBe(30)
    expect(s.boss).toBeTruthy()
    const parts = bossParts(s)
    expect(BOSS_SHAPES[s.boss!.shape!].tier).toBe(1)
    expect(parts).toHaveLength(BOSS_SHAPES[s.boss!.shape!].cells.length)
    expect(Math.min(...parts.map((b) => b.row))).toBe(0)
    expect(s.bricks.filter((b) => b.kind !== 'boss')).toHaveLength(0)
    expect(drainEvents(s).some((e) => e.type === 'boss')).toBe(true)
  })

  it('grows with each boss: bigger bodies and 2, 3, then 4 skills', () => {
    for (const [turn, tier] of [
      [30, 1],
      [60, 2],
      [90, 3],
      [150, 3],
    ] as const) {
      expect(bossTier(turn)).toBe(tier)
      for (let seed = 1; seed <= 20; seed++) {
        const s = beforeBoss(seed)
        s.turn = turn
        spawnBoss(s)
        expect(s.boss!.tier).toBe(tier)
        expect(BOSS_SHAPES[s.boss!.shape!].tier).toBe(tier)
        expect(s.boss!.traits.length).toBe(Math.min(tier + 1, SKILL_IDS.length))
        expect(new Set(s.boss!.traits).size).toBe(s.boss!.traits.length)
      }
    }
  })

  it('fits every shape on the smallest board and crushes bricks in its way', () => {
    for (const shape of Object.keys(BOSS_SHAPES)) {
      const s = beforeBoss()
      for (let c = 0; c < s.cols; c++)
        for (let r = 0; r < 3; r++)
          s.bricks.push({ id: s.nextId++, col: c, row: r, hp: 5, maxHp: 5, kind: 'normal', split: false })
      spawnBoss(s, [], shape)
      const parts = bossParts(s)
      for (const p of parts) {
        expect(p.col).toBeGreaterThanOrEqual(0)
        expect(p.col).toBeLessThan(s.cols)
        expect(s.bricks.filter((b) => b.col === p.col && b.row === p.row)).toHaveLength(1)
      }
    }
  })

  it('reads a saved boss from before shapes as the 3×2 block', () => {
    const s = withBoss()
    delete s.boss!.shape
    expect(shapeOf(s.boss!.shape).cells).toHaveLength(6)
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
      expect(bossHp(s)).toBeGreaterThanOrEqual(hpScale(s.turn) * 3)
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

  it('rolls its skills from the seed', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = beforeBoss(seed)
      const traits = rollTraits(s)
      expect(traits.length).toBe(2)
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

describe('boss hitbox', () => {
  /** One ball flying straight up under the boss's middle column; returns its highest point. */
  function shootUp(kind: 'normal' | 'fire', pierceLeft: number, x = 3.5 * CELL, shape = 'block'): number {
    const s = beforeBoss()
    s.turn = BOSS_EVERY
    spawnBoss(s, [], shape)
    s.phase = 'volley'
    s.balls = [
      {
        x,
        y: TOP + 6 * CELL,
        vx: 0,
        vy: -600,
        status: 'flying',
        kind,
        r: 7,
        split: false,
        inside: [],
        pierceLeft,
        bounceBonus: 0,
        lastBrick: -1,
      },
    ]
    let top = Infinity
    for (let i = 0; i < 120 && s.balls[0].vy < 0; i++) {
      step(s)
      top = Math.min(top, s.balls[0].y)
    }
    return top
  }
  const bottom = TOP + 2 * CELL - BRICK_INSET

  it('stops a normal ball at the bottom of the body', () => {
    expect(shootUp('normal', 0)).toBeGreaterThanOrEqual(bottom + 7 - 1)
  })

  it('is solid to piercing balls: they bounce off its outside instead of entering it', () => {
    expect(shootUp('normal', 2)).toBeGreaterThanOrEqual(bottom + 7 - 1)
  })

  it('is solid to fire balls', () => {
    expect(shootUp('fire', 0)).toBeGreaterThanOrEqual(bottom + 7 - 1)
  })

  it('has no gaps on the seam between two parts', () => {
    expect(shootUp('normal', 0, 3 * CELL)).toBeGreaterThanOrEqual(bottom + 7 - 0.1)
  })

  it('follows the shape: a notch in the body is open', () => {
    // The fortress has towers at both ends and an open gap under its middle.
    const notchBottom = TOP + 2 * CELL - BRICK_INSET
    expect(shootUp('normal', 0, 3.5 * CELL, 'fortress')).toBeGreaterThanOrEqual(notchBottom + 7 - 1)
    expect(shootUp('normal', 0, 3.5 * CELL, 'fortress')).toBeLessThan(notchBottom + 7 + 2)
  })
})
