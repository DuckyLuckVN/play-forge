import { describe, expect, it } from 'vitest'
import { xpToNext } from './boosts'
import { DANGER_ROW } from './config'
import { damageBrick, killBrick } from './damage'
import { spawnRow } from './rows'
import { drainEvents, fire, step } from './run'
import { brick, empty, runVolley } from './testing'
import type { BrickKind, RunState } from './types'

function rowAt(seed: number, turn: number): RunState {
  const s = empty(seed)
  s.turn = turn
  s.ballCount = 999
  spawnRow(s)
  return s
}

const special = (k: BrickKind) => k !== 'normal'

describe('special brick spawning', () => {
  it('has none before turn 3', () => {
    for (let seed = 1; seed <= 300; seed++)
      expect(rowAt(seed, 1).bricks.some((b) => special(b.kind))).toBe(false)
  })

  it('makes about 15–25% of bricks special by turn 31', () => {
    let all = 0
    let specials = 0
    for (let seed = 1; seed <= 2000; seed++) {
      const s = rowAt(seed, 31)
      all += s.bricks.length
      specials += s.bricks.filter((b) => special(b.kind)).length
    }
    expect(specials / all).toBeGreaterThan(0.15)
    expect(specials / all).toBeLessThan(0.25)
  })

  it('puts at most 2 specials in a row', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      expect(rowAt(seed, 99).bricks.filter((b) => special(b.kind)).length).toBeLessThanOrEqual(2)
    }
  })

  it('only spawns unlocked kinds', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      for (const b of rowAt(seed, 4).bricks) expect(['normal', 'gold']).toContain(b.kind)
    }
  })

  it('spawns a jackpot row of gold every 10th turn', () => {
    const s = rowAt(5, 10)
    expect(s.bricks.filter((b) => b.kind === 'gold')).toHaveLength(4)
    expect(drainEvents(s).some((e) => e.type === 'jackpot')).toBe(true)
  })
})

describe('special bricks', () => {
  it('bombs chain into each other', () => {
    const s = empty()
    const bombs = [2, 3, 4].map((col) =>
      Object.assign(brick(s, col, 5, 10), { kind: 'bomb' as const, hp: 2 }),
    )
    const far = brick(s, 0, 0, 5)
    killBrick(s, bombs[0], 0)
    expect(s.bricks).toEqual([far])
    expect(
      drainEvents(s)
        .filter((e) => e.type === 'explode')
        .map((e) => e.type === 'explode' && e.depth),
    ).toEqual([0, 1, 2])
  })

  it('never kills a brick twice in a chain, and xp matches kills', () => {
    const s = empty()
    const kinds: BrickKind[] = ['bomb', 'lightning', 'splitter', 'normal', 'gold']
    for (let c = 0; c < 5; c++)
      for (let r = 2; r < 7; r++) {
        Object.assign(brick(s, c, r, 6), { kind: kinds[(c + r) % kinds.length] })
      }
    s.turn = 40
    killBrick(s, s.bricks[12], 0)
    const kills = drainEvents(s).filter((e) => e.type === 'kill')
    const ids = kills.map((e) => e.type === 'kill' && e.id)
    expect(new Set(ids).size).toBe(ids.length)
    let xp = s.xp
    for (let l = 0; l < s.level; l++) xp += xpToNext(l)
    expect(xp).toBeCloseTo(kills.length)
  })

  it('armored bricks take at most 1 per ball hit, but full blast damage', () => {
    const s = empty()
    const b = Object.assign(brick(s, 0, 0, 100), { kind: 'armored' as const })
    damageBrick(s, b, 10, 'ball')
    expect(b.hp).toBe(99)
    damageBrick(s, b, 10, 'blast')
    expect(b.hp).toBe(89)
  })

  it('lightning bricks zap their row', () => {
    const s = empty()
    s.turn = 20
    const bolt = Object.assign(brick(s, 0, 4, 1), { kind: 'lightning' as const })
    const same = [brick(s, 3, 4, 100), brick(s, 6, 4, 100)]
    const other = brick(s, 3, 5, 100)
    killBrick(s, bolt, 0)
    expect(same.map((b) => b.hp)).toEqual([95, 95])
    expect(other.hp).toBe(100)
  })

  it('mystery bricks give exactly one reward', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = empty(seed)
      killBrick(s, Object.assign(brick(s, 3, 3, 1), { kind: 'mystery' as const }), 0)
      const gained =
        Number(s.pendingBalls === 3) +
        Number(s.pendingPicks === 1) +
        Number(s.coins > 40) +
        Number(s.fireCharges === 3)
      expect(gained).toBe(1)
      expect(drainEvents(s).some((e) => e.type === 'mystery')).toBe(true)
    }
  })

  it('splitters split once into two halves', () => {
    const s = empty()
    killBrick(s, Object.assign(brick(s, 3, 3, 9), { kind: 'splitter' as const }), 0)
    expect(s.bricks).toHaveLength(2)
    for (const b of s.bricks) expect(b).toMatchObject({ hp: 5, maxHp: 5, kind: 'normal', split: true })
    const before = s.bricks.length
    killBrick(s, s.bricks[0], 0)
    expect(s.bricks).toHaveLength(before - 1)
  })

  it('splitter halves stay above the danger row', () => {
    const s = empty()
    killBrick(s, Object.assign(brick(s, 0, DANGER_ROW - 1, 4), { kind: 'splitter' as const }), 0)
    for (const b of s.bricks) expect(b.row).toBeLessThan(DANGER_ROW)
  })
})

describe('new pickups', () => {
  it('a laser pickup stays all volley and fires 2× ball damage across its row on every pass', () => {
    const s = empty()
    s.turn = 7
    s.ballCount = 3
    s.pickups.push({ id: s.nextId++, col: 3, row: 6, kind: 'laser' })
    const row = [brick(s, 0, 6, 100), brick(s, 6, 6, 100)]
    fire(s, Math.PI / 2)
    let most = 0
    runVolley(s, (s) => (most = Math.max(most, s.pickups.length)))
    // 3 balls straight up and back down: 6 passes, 2 damage each.
    expect(most).toBe(1)
    expect(row.map((b) => b.hp)).toEqual([88, 88])
    expect(drainEvents(s).filter((e) => e.type === 'laser')).toHaveLength(6)
  })

  it('a used laser is gone after the volley; an untouched one stays', () => {
    const s = empty()
    const used = { id: s.nextId++, col: 3, row: 6, kind: 'laser' as const }
    const untouched = { id: s.nextId++, col: 0, row: 2, kind: 'laser' as const }
    s.pickups.push(used, untouched)
    fire(s, Math.PI / 2)
    runVolley(s)
    const ids = s.pickups.map((p) => p.id)
    expect(ids).not.toContain(used.id)
    expect(ids).toContain(untouched.id)
  })

  it('a fire pickup arms 3 fireballs for the next volley', () => {
    const s = empty()
    s.ballCount = 4
    s.pickups.push({ id: s.nextId++, col: 3, row: 6, kind: 'fire' })
    fire(s, Math.PI / 2)
    runVolley(s)
    fire(s, Math.PI / 2)
    step(s)
    expect(s.balls.map((b) => b.kind)).toEqual(['fire', 'fire', 'fire', 'normal'])
  })
})
