import { describe, expect, it } from 'vitest'
import { killBrick } from './damage'
import { hpScale, spawnRow } from './rows'
import { drainEvents, fire } from './run'
import { brick, empty, runVolley } from './testing'
import type { RunState } from './types'

function rowAt(seed: number, turn: number): RunState {
  const s = empty(seed)
  s.turn = turn
  spawnRow(s)
  return s
}

describe('difficulty', () => {
  it('scales brick hp faster than the turn', () => {
    expect(hpScale(10)).toBeCloseTo(12.5)
    expect(hpScale(40)).toBeCloseTo(80)
  })

  it('spawns 2..7 bricks, at least 3 from turn 10', () => {
    for (let seed = 1; seed <= 500; seed++) {
      for (const turn of [1, 9, 11, 55, 199]) {
        const n = rowAt(seed, turn).bricks.length
        expect(n).toBeGreaterThanOrEqual(turn >= 10 ? 3 : 2)
        expect(n).toBeLessThanOrEqual(7)
      }
    }
  })

  it('offers a ball pickup in about 65% of rows', () => {
    let rows = 0
    for (let seed = 1; seed <= 1000; seed++) if (rowAt(seed, 3).pickups.some((p) => p.kind === 'ball')) rows++
    expect(rows / 1000).toBeGreaterThan(0.58)
    expect(rows / 1000).toBeLessThan(0.72)
  })
})

describe('coins', () => {
  it('drops a coin from about 30% of kills', () => {
    const s = empty()
    for (let i = 0; i < 2000; i++) killBrick(s, brick(s, 0, 0, 1), 0)
    expect(s.coins / 2000).toBeGreaterThan(0.25)
    expect(s.coins / 2000).toBeLessThan(0.35)
  })

  it('always pays gold, 3×', () => {
    const s = empty()
    killBrick(s, Object.assign(brick(s, 0, 0, 1), { kind: 'gold' as const }), 0)
    expect(s.coins).toBe(3)
  })

  it('pays turn × 3 for a board wipe', () => {
    const s = empty()
    s.turn = 7
    brick(s, 3, 5, 1)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(drainEvents(s).find((e) => e.type === 'allClear')).toEqual({ type: 'allClear', coins: 21 })
  })
})
