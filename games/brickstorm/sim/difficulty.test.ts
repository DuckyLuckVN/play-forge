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

  it('holds hp for 3 turns, then steps up a little', () => {
    expect(hpScale(5)).toBe(hpScale(4))
    expect(hpScale(6)).toBe(hpScale(4))
    expect(hpScale(7)).toBeGreaterThan(hpScale(6))
    expect(hpScale(7) / hpScale(6)).toBeLessThan(2)
  })

  it('compounds hp late in a run so long runs end', () => {
    expect(hpScale(61)).toBeCloseTo(61 * (1 + 61 / 40) * 1.025)
    expect(hpScale(100) / hpScale(52)).toBeGreaterThan(5)
  })

  it('spawns 2..6 bricks on 7 columns, at least 3 from turn 20', () => {
    for (let seed = 1; seed <= 500; seed++) {
      for (const turn of [1, 9, 11, 21, 55, 199]) {
        const n = rowAt(seed, turn).bricks.length
        expect(n).toBeGreaterThanOrEqual(turn >= 20 ? 3 : 2)
        expect(n).toBeLessThanOrEqual(6) // a column stays free on a 7-wide board
      }
    }
  })

  it('offers a ball pickup in every row', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const turn of [1, 3, 9, 30, 99]) {
        expect(
          rowAt(seed, turn).pickups.some((p) => p.kind === 'ball'),
          `${seed}@${turn}`,
        ).toBe(true)
      }
    }
  })
})

describe('coins', () => {
  it('drops a coin from about 22% of kills', () => {
    const s = empty()
    for (let i = 0; i < 2000; i++) killBrick(s, brick(s, 0, 0, 1), 0)
    expect(s.coins / 2000).toBeGreaterThan(0.18)
    expect(s.coins / 2000).toBeLessThan(0.26)
  })

  it('always pays gold, 2×', () => {
    const s = empty()
    killBrick(s, Object.assign(brick(s, 0, 0, 1), { kind: 'gold' as const }), 0)
    expect(s.coins).toBe(2)
  })

  it('pays turn × 1 for a board wipe', () => {
    const s = empty()
    s.turn = 7
    brick(s, 3, 5, 1)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(drainEvents(s).find((e) => e.type === 'allClear')).toEqual({ type: 'allClear', coins: 7 })
  })
})
