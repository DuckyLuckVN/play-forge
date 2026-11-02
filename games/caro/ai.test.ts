import { describe, expect, it } from 'vitest'
import { chooseMove, type Level } from './ai'
import { emptyBoard, findWin, isFull, opponent, type Mark, type Side } from './rules'

const SIZE = 15
const at = (x: number, y: number) => y * SIZE + x
function board(stones: [number, number, Mark][]): Mark[] {
  const b = emptyBoard(SIZE)
  for (const [x, y, m] of stones) b[at(x, y)] = m
  return b
}

describe('chooseMove', () => {
  it('opens in the centre', () => {
    expect(chooseMove(emptyBoard(SIZE), SIZE, 1, 'free', 'normal', { seed: 1 })).toBe(at(7, 7))
  })

  it('always takes a win, at every level', () => {
    for (const level of ['easy', 'normal', 'hard'] as Level[])
      for (let seed = 0; seed < 20; seed++) {
        // O has four in a row; X threatens too, but O moves and should just win.
        const b = board([
          [3, 3, 2],
          [4, 3, 2],
          [5, 3, 2],
          [6, 3, 2],
          [2, 3, 1],
          [3, 8, 1],
          [4, 8, 1],
          [5, 8, 1],
          [6, 8, 1],
        ])
        expect(chooseMove(b, SIZE, 2, 'free', level, { seed })).toBe(at(7, 3))
      }
  })

  it('normal and hard always block a four', () => {
    for (const level of ['normal', 'hard'] as Level[])
      for (let seed = 0; seed < 20; seed++) {
        const b = board([
          [3, 8, 1],
          [4, 8, 1],
          [5, 8, 1],
          [6, 8, 1],
          [2, 8, 2],
          [9, 2, 2],
        ])
        expect(chooseMove(b, SIZE, 2, 'free', level, { seed })).toBe(at(7, 8))
      }
  })

  it('easy sometimes misses a block, but not most of the time', () => {
    let blocked = 0
    for (let seed = 0; seed < 200; seed++) {
      const b = board([
        [3, 8, 1],
        [4, 8, 1],
        [5, 8, 1],
        [6, 8, 1],
        [2, 8, 2],
        [9, 2, 2],
      ])
      if (chooseMove(b, SIZE, 2, 'free', 'easy', { seed }) === at(7, 8)) blocked++
    }
    expect(blocked).toBeGreaterThan(100)
    expect(blocked).toBeLessThan(200)
  })

  it('hard blocks an open three', () => {
    // X: _XXX_ on row 7; O must take one end or lose to an open four.
    const b = board([
      [5, 7, 1],
      [6, 7, 1],
      [7, 7, 1],
      [6, 6, 2],
      [7, 6, 2],
    ])
    const move = chooseMove(b, SIZE, 2, 'free', 'hard', { seed: 3 })
    expect([at(4, 7), at(8, 7), at(3, 7), at(9, 7)]).toContain(move)
  })

  it('only plays empty cells and restores the board', () => {
    const b = board([
      [7, 7, 1],
      [8, 8, 2],
      [6, 6, 1],
    ])
    const copy = [...b]
    for (const level of ['easy', 'normal', 'hard'] as Level[]) {
      const move = chooseMove(b, SIZE, 2, 'free', level, { seed: 9 })
      expect(b[move]).toBe(0)
    }
    expect(b).toEqual(copy)
  })

  it('is deterministic for a seed', () => {
    const b = board([
      [7, 7, 1],
      [8, 8, 2],
    ])
    expect(chooseMove([...b], SIZE, 1, 'free', 'easy', { seed: 5 })).toBe(
      chooseMove([...b], SIZE, 1, 'free', 'easy', { seed: 5 }),
    )
  })
})

/** Plays a whole game; returns the winning side (0 = draw). */
function playOut(x: Level, o: Level, seed: number): Mark {
  const b = emptyBoard(SIZE)
  const rng = { seed }
  // A varied opening move by X so games differ; then O answers.
  b[at(5 + (seed % 5), 5 + ((seed >> 2) % 5))] = 1
  let side: Side = 2
  while (!isFull(b)) {
    const c = chooseMove(b, SIZE, side, 'free', side === 1 ? x : o, rng)
    b[c] = side
    if (findWin(b, SIZE, c, 'free')) return side
    side = opponent(side)
  }
  return 0
}

describe('balance', () => {
  // Stronger levels should win clearly more often against weaker ones,
  // playing either colour.
  const record = (strong: Level, weak: Level, games = 12) => {
    let wins = 0
    for (let i = 0; i < games; i++) {
      const strongIsX = i % 2 === 0
      const w = strongIsX ? playOut(strong, weak, i * 7 + 1) : playOut(weak, strong, i * 7 + 1)
      if (w === (strongIsX ? 1 : 2)) wins++
    }
    return wins / games
  }

  it('normal beats easy most of the time', () => {
    expect(record('normal', 'easy')).toBeGreaterThanOrEqual(0.7)
  })

  it('hard beats easy almost always', () => {
    expect(record('hard', 'easy')).toBeGreaterThanOrEqual(0.8)
  })

  it('hard beats normal more often than not', () => {
    expect(record('hard', 'normal')).toBeGreaterThan(0.5)
  })
})
