import { describe, expect, it } from 'vitest'
import { bestTier, canSlide, lines, ROCK, rocksHit, slide, type Cells } from './board'

/** Builds a board from tiers (0 = empty, -1 = rock); ids are 1-based positions. */
const make = (tiers: number[]): Cells => tiers.map((v, i) => (v ? { id: i + 1, v } : null))
const tiersOf = (cells: Cells) => cells.map((c) => c?.v ?? 0)
const ids = () => {
  let n = 100
  return () => ++n
}

describe('lines', () => {
  it('orders cells from the side tiles slide to', () => {
    expect(lines(3, 'left')[0]).toEqual([0, 1, 2])
    expect(lines(3, 'right')[0]).toEqual([2, 1, 0])
    expect(lines(3, 'up')[1]).toEqual([1, 4, 7])
    expect(lines(3, 'down')[1]).toEqual([7, 4, 1])
  })
})

describe('slide', () => {
  it('packs tiles and merges each pair once', () => {
    // 1 1 1 1 → 2 2 0 0, not 3
    const r = slide(make([1, 1, 1, 1, ...Array(12).fill(0)]), 4, 'left', ids())
    expect(tiersOf(r.cells).slice(0, 4)).toEqual([2, 2, 0, 0])
    expect(r.merges).toEqual([
      { cell: 0, tier: 2, from: [1, 2] },
      { cell: 1, tier: 2, from: [3, 4] },
    ])
    expect(r.moved).toBe(true)
  })

  it('merges towards the slide direction', () => {
    const r = slide(make([0, 2, 2, 2, ...Array(12).fill(0)]), 4, 'right', ids())
    expect(tiersOf(r.cells).slice(0, 4)).toEqual([0, 0, 2, 3])
  })

  it('a merged tile does not merge again in the same move', () => {
    const r = slide(make([2, 1, 1, 0, ...Array(12).fill(0)]), 4, 'left', ids())
    expect(tiersOf(r.cells).slice(0, 4)).toEqual([2, 2, 0, 0])
  })

  it('rocks stay put and block tiles', () => {
    const r = slide(make([0, ROCK, 0, 1, ...Array(12).fill(0)]), 4, 'left', ids())
    expect(tiersOf(r.cells).slice(0, 4)).toEqual([0, ROCK, 1, 0])
    // Tiles on either side of a rock never fuse through it.
    const r2 = slide(make([1, ROCK, 1, 0, ...Array(12).fill(0)]), 4, 'left', ids())
    expect(r2.moved).toBe(false)
    expect(r2.merges).toEqual([])
  })

  it('works on columns', () => {
    const b = make([1, 0, 0, 1, 0, 0, 0, 0, 0])
    expect(tiersOf(slide(b, 3, 'down', ids()).cells)).toEqual([0, 0, 0, 0, 0, 0, 2, 0, 0])
  })

  it('reports no move when nothing changes, and leaves the input alone', () => {
    const b = make([1, 2, 0, 0, ...Array(12).fill(0)])
    const copy = structuredClone(b)
    expect(slide(b, 4, 'left', ids()).moved).toBe(false)
    expect(slide(b, 4, 'right', ids()).moved).toBe(true)
    expect(b).toEqual(copy)
  })
})

describe('canSlide', () => {
  it('is false only for a full board with no equal neighbours', () => {
    expect(canSlide(make([1, 1, 2, 3]), 2)).toBe(true)
    expect(canSlide(make([1, 2, 2, 1]), 2)).toBe(false)
    expect(canSlide(make([1, 2, 3, 4]), 2)).toBe(false)
    expect(canSlide(make([1, 2, 3, 0]), 2)).toBe(true)
  })

  it('a board of only rocks is stuck', () => {
    expect(canSlide(make([ROCK, ROCK, ROCK, ROCK]), 2)).toBe(false)
  })
})

describe('rocksHit', () => {
  it('finds rocks orthogonally next to merges', () => {
    const b = make([ROCK, 0, 0, 0, ROCK, 0, 0, 0, ROCK])
    expect(rocksHit(b, 3, [1]).sort()).toEqual([0, 4])
    expect(rocksHit(b, 3, [2])).toEqual([])
  })
})

it('bestTier ignores rocks', () => {
  expect(bestTier(make([ROCK, 3, 1, 0]))).toBe(3)
})
