import { describe, expect, it } from 'vitest'
import { ROWS, TOP } from './config'
import { brickRect, spawnRow } from './rows'
import type { RunState } from './types'

/** Just the fields spawnRow reads and writes. */
function blank(seed: number, turn: number): RunState {
  return { rng: { seed }, turn, bricks: [], pickups: [], nextId: 1 } as unknown as RunState
}

const spawned = (seed: number, turn: number) => {
  const s = blank(seed, turn)
  spawnRow(s)
  return s
}

describe('spawnRow', () => {
  it('is deterministic for a seed', () => {
    const a = spawned(7, 5)
    const b = spawned(7, 5)
    expect(a.bricks).toEqual(b.bricks)
    expect(a.pickups).toEqual(b.pickups)
  })

  it('keeps brick count in 2..6 and leaves a free column', () => {
    for (const turn of [1, 20, 200]) {
      for (let seed = 1; seed <= 500; seed++) {
        const s = spawned(seed, turn)
        expect(s.bricks.length).toBeGreaterThanOrEqual(2)
        expect(s.bricks.length).toBeLessThanOrEqual(6)
        const cols = [...s.bricks, ...s.pickups].map((x) => x.col)
        expect(new Set(cols).size).toBe(cols.length)
        expect(s.bricks.every((b) => b.row === 0)).toBe(true)
      }
    }
  })

  it('scales hp with the turn', () => {
    let doubled = false
    for (let seed = 1; seed <= 500; seed++) {
      for (const b of spawned(seed, 50).bricks) {
        expect(b.hp).toBeGreaterThanOrEqual(40)
        expect(b.hp).toBeLessThanOrEqual(120)
        expect(b.maxHp).toBe(b.hp)
        if (b.hp > 60) doubled = true
      }
    }
    expect(doubled).toBe(true)
  })

  it('places a ball pickup about 90% of the time', () => {
    let rows = 0
    for (let seed = 1; seed <= 1000; seed++) {
      if (spawned(seed, 3).pickups.some((p) => p.kind === 'ball')) rows++
    }
    expect(rows).toBeGreaterThanOrEqual(850)
    expect(rows).toBeLessThanOrEqual(950)
  })

  it('gives every brick and pickup a unique id', () => {
    const s = spawned(3, 4)
    const ids = [...s.bricks, ...s.pickups].map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('board size', () => {
  it('has 12 rows', () => {
    expect(ROWS).toBe(12)
  })
})

describe('brickRect', () => {
  it('insets by 2', () => {
    expect(brickRect({ col: 0, row: 0 })).toEqual({ x: 2, y: TOP + 2, w: 52, h: 52 })
  })
})
