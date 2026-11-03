// Fairness: a bot that only reacts to what it has seen for 200 ms must never be
// hit and never fizzle a spark. If it is, the planner made an unfair pattern.
import { describe, expect, it } from 'vitest'
import { createState, isThreat, step, TICK_RATE, type Dir, type GuardInput, type GuardState } from './sim'

const me = [{ id: 'p0', name: 'P0', slot: 0, ready: true, connected: true }]
const REACT = 12
const NAMES: GuardInput[] = ['up', 'right', 'down', 'left']

function bot(s: GuardState, seen: Map<number, { at: number; dir: Dir }>): GuardInput | null {
  // What the bot believes: each projectile's lane as of REACT ticks ago.
  const known = s.projs
    .map((p) => ({ p, view: seen.get(p.id)! }))
    .filter(({ view }) => s.tick - view.at >= REACT)
    .sort((a, b) => a.p.arriveAt - b.p.arriveAt)
  const threat = known.find(({ p }) => isThreat(p.kind))
  const spark = known.find(({ p }) => !isThreat(p.kind))
  let want: Dir = threat ? threat.view.dir : s.shield
  if (spark && (!threat || spark.p.arriveAt < threat.p.arriveAt) && want === spark.view.dir)
    want = ((spark.view.dir + 2) % 4) as Dir
  return want !== s.shield ? NAMES[want] : null
}

function play(seed: number, seconds: number) {
  const s = createState(me, seed)
  const seen = new Map<number, { at: number; dir: Dir }>()
  let hits = 0
  let fizzles = 0
  for (let i = 0; i < seconds * TICK_RATE && !s.over; i++) {
    const input = bot(s, seen)
    step(s, input ? [{ player: 'p0', input }] : [])
    for (const p of s.projs) {
      const v = seen.get(p.id)
      if (!v || v.dir !== p.dir) seen.set(p.id, { at: s.tick, dir: p.dir })
    }
    hits += s.events.filter((e) => e.type === 'hit').length
    fizzles += s.events.filter((e) => e.type === 'fizzle').length
  }
  return { s, hits, fizzles }
}

describe('Halo Guard fairness', () => {
  it('a careful player can guard everything for 5 minutes', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { hits, fizzles, s } = play(seed, 300)
      expect({ seed, hits, fizzles }).toEqual({ seed, hits: 0, fizzles: 0 })
      expect(s.tier).toBe(9)
    }
  }, 30_000)

  it('keeps arrivals coming at a steady clip', () => {
    const { s } = play(7, 120)
    // ~2 minutes: well over 150 blocks (no lulls), and it all scores.
    expect(s.stats.blocks).toBeGreaterThan(150)
  })
})
