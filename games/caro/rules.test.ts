import { describe, expect, it } from 'vitest'
import { candidates, emptyBoard, findWin, isFull, makesFour, type Mark } from './rules'

const SIZE = 15
const at = (x: number, y: number) => y * SIZE + x

/** Board with `mark` at each [x, y]. */
function board(stones: [number, number, Mark][]): Mark[] {
  const b = emptyBoard(SIZE)
  for (const [x, y, m] of stones) b[at(x, y)] = m
  return b
}
const row = (x0: number, y: number, n: number, m: Mark, dx = 1, dy = 0) =>
  Array.from({ length: n }, (_, i): [number, number, Mark] => [x0 + i * dx, y + i * dy, m])

describe('findWin', () => {
  it('finds five in a row in every direction', () => {
    for (const [dx, dy, x0, y0] of [
      [1, 0, 2, 7],
      [0, 1, 7, 2],
      [1, 1, 2, 2],
      [1, -1, 2, 10],
    ]) {
      const b = board(row(x0, y0, 5, 1, dx, dy))
      const last = at(x0 + 2 * dx, y0 + 2 * dy) // the middle stone was played last
      expect(findWin(b, SIZE, last, 'free')).toHaveLength(5)
    }
  })

  it('needs five, not four', () => {
    expect(findWin(board(row(2, 7, 4, 1)), SIZE, at(2, 7), 'free')).toBeNull()
  })

  it('counts an overline (six) as a win', () => {
    expect(findWin(board(row(2, 7, 6, 2)), SIZE, at(4, 7), 'free')).toHaveLength(6)
  })

  it('returns the line in order, ending at the board edge', () => {
    const line = findWin(board(row(10, 0, 5, 1)), SIZE, at(14, 0), 'free')
    expect(line).toEqual([at(10, 0), at(11, 0), at(12, 0), at(13, 0), at(14, 0)])
  })

  it('does not wrap around the board edge', () => {
    // Three at the end of row 0 and two at the start of row 1 are adjacent in memory.
    const b = board([...row(12, 0, 3, 1), ...row(0, 1, 2, 1)])
    expect(findWin(b, SIZE, at(14, 0), 'free')).toBeNull()
  })

  it('blocked rule: five blocked at both ends does not win', () => {
    const b = board([[1, 7, 2], ...row(2, 7, 5, 1), [7, 7, 2]])
    expect(findWin(b, SIZE, at(4, 7), 'free')).toHaveLength(5)
    expect(findWin(b, SIZE, at(4, 7), 'blocked')).toBeNull()
  })

  it('blocked rule: one open end still wins, and the board edge is not a block', () => {
    expect(findWin(board([[1, 7, 2], ...row(2, 7, 5, 1)]), SIZE, at(4, 7), 'blocked')).toHaveLength(5)
    expect(findWin(board([...row(0, 7, 5, 1), [5, 7, 2]]), SIZE, at(2, 7), 'blocked')).toHaveLength(5)
  })

  it('ignores an empty cell', () => {
    expect(findWin(emptyBoard(SIZE), SIZE, at(3, 3), 'free')).toBeNull()
  })
})

describe('makesFour', () => {
  it('is true when one more stone in the line would win', () => {
    const b = board(row(2, 7, 4, 1))
    expect(makesFour(b, SIZE, at(5, 7), 'free')).toBe(true)
  })

  it('handles a split four (XX_XX)', () => {
    const b = board([...row(2, 7, 2, 1), ...row(5, 7, 2, 1)])
    expect(makesFour(b, SIZE, at(6, 7), 'free')).toBe(true)
  })

  it('is false for a four closed at both ends', () => {
    const b = board([[1, 7, 2], ...row(2, 7, 4, 1), [6, 7, 2]])
    expect(makesFour(b, SIZE, at(3, 7), 'free')).toBe(false)
  })

  it('is false for three', () => {
    expect(makesFour(board(row(2, 7, 3, 1)), SIZE, at(4, 7), 'free')).toBe(false)
  })
})

describe('candidates', () => {
  it('is the centre on an empty board', () => {
    expect(candidates(emptyBoard(SIZE), SIZE)).toEqual([at(7, 7)])
  })

  it('lists empty cells within two of a stone', () => {
    const c = candidates(board([[7, 7, 1]]), SIZE)
    expect(c).toHaveLength(24)
    expect(c).not.toContain(at(7, 7))
    expect(c).toContain(at(5, 5))
    expect(c).not.toContain(at(4, 7))
  })
})

it('isFull', () => {
  expect(isFull(emptyBoard(3))).toBe(false)
  expect(isFull(Array(9).fill(1))).toBe(true)
})
