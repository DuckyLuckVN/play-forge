import { describe, expect, it } from 'vitest'
import { award, serveBox, winner } from './rules'

describe('award', () => {
  it('adds a point to the side without mutating', () => {
    const s: [number, number] = [3, 4]
    expect(award(s, 0)).toEqual([4, 4])
    expect(award(s, 1)).toEqual([3, 5])
    expect(s).toEqual([3, 4])
  })
})

describe('winner', () => {
  it('11 with a 2-point lead wins', () => {
    expect(winner([11, 5])).toBe(0)
    expect(winner([3, 11])).toBe(1)
  })
  it('10-10 needs a 2-point lead', () => {
    expect(winner([11, 10])).toBeNull()
    expect(winner([12, 10])).toBe(0)
    expect(winner([12, 11])).toBeNull()
  })
  it('15 is the cap: 15-14 wins', () => {
    expect(winner([14, 14])).toBeNull()
    expect(winner([15, 14])).toBe(0)
    expect(winner([14, 15])).toBe(1)
  })
  it('no winner early', () => {
    expect(winner([0, 0])).toBeNull()
    expect(winner([10, 9])).toBeNull()
  })
})

describe('serveBox', () => {
  it('even own score → right box, odd → left', () => {
    expect(serveBox(0, 0).xSign).toBe(1)
    expect(serveBox(1, 4).xSign).toBe(1)
    expect(serveBox(0, 3).xSign).toBe(-1)
    expect(serveBox(1, 11).xSign).toBe(-1)
  })
})
