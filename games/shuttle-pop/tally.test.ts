import { describe, expect, it } from 'vitest'
import { noteBonk, noteHit, notePoint, noteServe, tallyOf, tallyScore, type TallyStats } from './tally'

const players = [
  { id: 'a', side: 0 as const },
  { id: 'b', side: 1 as const },
]

describe('tally', () => {
  it('counts perfect / smashes / dive saves per hitter; zeros for anyone unseen', () => {
    const s: TallyStats = {}
    expect(tallyOf(s, 'a')).toEqual({ winners: 0, perfect: 0, smashes: 0, saves: 0, bonks: 0 })
    expect(s.by).toBeUndefined()
    noteHit(s, 'a', 'perfect', 'smash')
    noteHit(s, 'a', 'good', 'clear', 'lunge')
    noteBonk(s, 'b')
    expect(tallyOf(s, 'a')).toMatchObject({ perfect: 1, smashes: 1, saves: 1 })
    expect(tallyOf(s, 'b').bonks).toBe(1)
  })

  it("a point is a winner for the last striker only when it went their side's way", () => {
    const s: TallyStats = {}
    noteServe(s, 'a')
    noteHit(s, 'b', 'good', 'drive')
    notePoint(s, players, 1) // b's drive won it
    expect(tallyOf(s, 'b').winners).toBe(1)
    noteHit(s, 'a', 'late', 'clear')
    notePoint(s, players, 1) // a hit it out: no winner for anyone
    expect(tallyOf(s, 'a').winners).toBe(0)
    expect(tallyOf(s, 'b').winners).toBe(1)
    notePoint(s, players, 0) // nobody struck since: nothing
    expect(tallyOf(s, 'a').winners).toBe(0)
  })

  it('score: winners weigh most', () => {
    expect(tallyScore({ winners: 1, perfect: 0, smashes: 0, saves: 0, bonks: 0 })).toBeGreaterThan(
      tallyScore({ winners: 0, perfect: 1, smashes: 1, saves: 0, bonks: 5 }),
    )
  })
})
