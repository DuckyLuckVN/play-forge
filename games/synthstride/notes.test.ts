import { describe, expect, it } from 'vitest'
import { neighbours } from './grid'
import { chainPath, isNext, type Note } from './notes'

describe('note chains', () => {
  it('walks adjacent, distinct, unblocked tiles', () => {
    for (let seed = 1; seed < 50; seed++) {
      const blocked = new Set([5, 6])
      const path = chainPath({ seed }, 4, 5, blocked)!
      expect(path.length).toBeGreaterThanOrEqual(2)
      expect(new Set(path).size).toBe(path.length)
      for (const t of path) expect(blocked.has(t)).toBe(false)
      for (let i = 1; i < path.length; i++) expect(neighbours(path[i - 1], 4)).toContain(path[i])
    }
  })

  it('has no path on a full board', () => {
    expect(chainPath({ seed: 1 }, 4, 3, new Set(Array.from({ length: 16 }, (_, i) => i)))).toBeNull()
  })

  it('only the lowest remaining index of a chain is next', () => {
    const notes: Note[] = [0, 1, 2].map((index) => ({
      id: index,
      tile: index,
      chain: 1,
      index,
      length: 3,
      until: 9,
    }))
    expect(notes.map((n) => isNext(n, notes))).toEqual([true, false, false])
    expect(isNext(notes[1], notes.slice(1))).toBe(true)
  })
})
