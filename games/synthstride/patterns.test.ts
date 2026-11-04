import { describe, expect, it } from 'vitest'
import { dangerBeats, makePattern, pickKind, survivable, type StrikePlan } from './patterns'

const plan = (tiles: number[], beat: number, hold = 0): StrikePlan => ({
  kind: 'tiles',
  tiles,
  warnBeat: 0,
  beat,
  hold,
})

describe('patterns', () => {
  it('off-beats are unsafe on both neighbouring beats; holes for their whole bar', () => {
    expect(dangerBeats({ beat: 5, hold: 0 })).toEqual([5])
    expect(dangerBeats({ beat: 5.5, hold: 0 })).toEqual([5, 6])
    expect(dangerBeats({ beat: 5, hold: 3 })).toEqual([5, 6, 7, 8])
  })

  it('a sweep is one full line per beat, walking across the board', () => {
    for (let seed = 1; seed < 20; seed++) {
      const sweep = makePattern('sweep', { seed }, 4, 0, 2, false)
      expect(sweep.map((s) => s.beat)).toEqual([2, 3, 4, 5])
      for (const s of sweep) expect(s.tiles.length).toBe(4)
      expect(new Set(sweep.flatMap((s) => s.tiles)).size).toBe(16)
    }
  })

  it('only small patterns go off-beat', () => {
    expect(makePattern('bomb', { seed: 3 }, 4, 0, 2, true)[0].beat).toBe(2.5)
    expect(makePattern('row', { seed: 3 }, 4, 0, 2, true)[0].beat).toBe(2)
  })

  it('unlocks patterns with level', () => {
    const kinds = (level: number) => {
      const set = new Set<string>()
      for (let seed = 1; seed < 400; seed++) set.add(pickKind(level, { seed }))
      return set
    }
    expect([...kinds(0)]).toEqual(['tiles'])
    expect(kinds(2).has('bomb')).toBe(true)
    expect(kinds(2).has('sweep')).toBe(false)
    expect(kinds(5).has('hole')).toBe(true)
  })

  it('survivable() respects an already-used step', () => {
    // Standing on 0, which is struck next beat: fine if you can still move, not if you can't.
    expect(survivable(0, 0, [plan([0], 1)], 4)).toBe(true)
    expect(survivable(0, 0, [plan([0], 1)], 4, true)).toBe(false)
  })
})
