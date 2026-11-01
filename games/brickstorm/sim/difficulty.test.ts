import { describe, expect, it } from 'vitest'
import { killBrick } from './damage'
import { hpCap, hpScale, hpStepStart, maxBricksFor, spawnRow } from './rows'
import { drainEvents, fire, startNextTurn } from './run'
import { brick, empty, runVolley } from './testing'
import type { RunState } from './types'

/** A row for `turn`, for a run with `balls` balls (plenty by default, so no ball limits apply). */
function rowAt(seed: number, turn: number, balls = 999): RunState {
  const s = empty(seed)
  s.turn = turn
  s.ballCount = balls
  spawnRow(s)
  return s
}

describe('difficulty', () => {
  it('scales brick hp faster than the turn', () => {
    expect(hpScale(10)).toBeCloseTo(9.6) // turns 6–10 use turn 8
    expect(hpScale(40)).toBeCloseTo(81.506) // turns 39–42 use turn 40.5
  })

  it('holds hp flat for 5 turns early, shrinking to 2 late', () => {
    const lengths: number[] = []
    let start = 1
    for (let turn = 2; turn <= 200; turn++) {
      if (hpStepStart(turn) !== start) {
        lengths.push(turn - start)
        start = turn
      }
      expect(hpStepStart(turn)).toBeLessThanOrEqual(turn)
    }
    expect(lengths[0]).toBe(5)
    expect(lengths.at(-1)).toBe(2)
    for (let i = 1; i < lengths.length; i++) expect(lengths[i]).toBeLessThanOrEqual(lengths[i - 1])
    expect(new Set(lengths)).toEqual(new Set([5, 4, 3, 2]))
  })

  it('keeps hp the same within a stretch and steps it up between them', () => {
    expect(hpScale(1)).toBe(hpScale(5))
    expect(hpScale(6)).toBeGreaterThan(hpScale(5))
    expect(hpScale(6) / hpScale(5)).toBeLessThan(3)
    for (let turn = 2; turn <= 200; turn++) {
      if (hpStepStart(turn) === turn) expect(hpScale(turn)).toBeGreaterThan(hpScale(turn - 1))
      else expect(hpScale(turn)).toBe(hpScale(turn - 1))
    }
  })

  it('compounds hp late in a run so long runs end', () => {
    // More than the turn × (1 + turn/40) curve alone would give.
    expect(hpScale(120) / hpScale(60)).toBeGreaterThan((120 * 4) / (60 * 2.5) + 1)
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

describe('tougher bricks', () => {
  it('announces the turn a new hp stretch starts', () => {
    const s = empty()
    s.turn = 5
    startNextTurn(s, false)
    expect(drainEvents(s)).toContainEqual({ type: 'tougher' })
    startNextTurn(s, false)
    expect(drainEvents(s)).not.toContainEqual({ type: 'tougher' })
  })
})

describe('bricks follow the balls you have', () => {
  it('keeps rows small while the run has few balls', () => {
    for (let seed = 1; seed <= 300; seed++) {
      expect(rowAt(seed, 31, 1).bricks.length).toBeLessThanOrEqual(1)
      expect(rowAt(seed, 31, 4).bricks.length).toBeLessThanOrEqual(3)
      expect(maxBricksFor(6)).toBe(4)
    }
  })

  it('caps brick hp at what the balls can deal', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = rowAt(seed, 40, 3)
      for (const b of s.bricks) expect(b.hp).toBeLessThanOrEqual(hpCap(s))
    }
    const s = empty()
    s.ballCount = 4
    const before = hpCap(s)
    s.boosts = { damage: 4 }
    expect(hpCap(s)).toBeCloseTo(before * 2)
  })

  it('leaves a run with plenty of balls alone', () => {
    const s = rowAt(1, 40)
    expect(s.bricks.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...s.bricks.map((b) => b.hp))).toBeGreaterThan(hpScale(40) * 0.85)
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
