import { describe, expect, it } from 'vitest'
import { LEVELS } from './ai'
import { setupBots, shuttlePopGame as game, TICK_RATE, type Level, type SpEvent, type SpState } from './sim'

/** 9 minutes of sim time. */
const MATCH_CAP = 9 * 60 * TICK_RATE

interface MatchStats {
  winner: -1 | 0 | 1
  ticks: number
  points: number
  hits: number
  serveTick: number[]
  /** Swings per side: hit grades + whiffs. */
  swings: [Record<string, number>, Record<string, number>]
}

/** Bot vs bot to the end (or MATCH_CAP). Events are read once each by id. */
function play(a: Level, b: Level, seed: number): MatchStats {
  const s: SpState = setupBots(a, b, seed)
  const st: MatchStats = { winner: -1, ticks: 0, points: 0, hits: 0, serveTick: [], swings: [{}, {}] }
  let lastId = 0
  const count = (e: SpEvent) => {
    if (e.k === 'hit') {
      st.hits++
      st.swings[e.side][e.grade] = (st.swings[e.side][e.grade] ?? 0) + 1
    } else if (e.k === 'whiff') st.swings[e.side].whiff = (st.swings[e.side].whiff ?? 0) + 1
    else if (e.k === 'point') st.points++
  }
  while (s.phase !== 'over' && s.tick < MATCH_CAP) {
    const serving = s.phase === 'serve'
    const phaseT = s.phaseT
    game.tick(s, [])
    if (serving && s.phase === 'rally') st.serveTick.push(phaseT + 1)
    for (const e of s.events) if (e.id > lastId) count(e)
    lastId = s.nextEventId - 1
  }
  st.winner = s.winner
  st.ticks = s.tick
  return st
}

const seeds = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i)

/** Bot-vs-bot matches take a few seconds; keep CI headroom over the 5 s default. */
const SLOW = 20_000

describe('computer opponent', () => {
  it('every level can miss (never perfect)', () => {
    for (const l of Object.values(LEVELS)) {
      expect(l.grade.whiff).toBeGreaterThan(0)
      expect(l.grade.perfect).toBeLessThan(1)
    }
  })

  it('bot memory stays JSON (state round-trips mid-match)', () => {
    const s = setupBots('normal', 'normal', 3)
    for (let i = 0; i < 400; i++) game.tick(s, [])
    expect(s.players[0].bot).toBeDefined()
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })

  it('serves within ~1 s (well before the serve timeout)', () => {
    const m = play('normal', 'easy', 7)
    expect(m.serveTick.length).toBeGreaterThan(5)
    for (const t of m.serveTick) expect(t).toBeLessThanOrEqual(TICK_RATE)
  })

  it(
    'hard is never perfect-only',
    () => {
      const tally: Record<string, number> = {}
      let total = 0
      for (let seed = 1; total < 500 && seed < 40; seed++) {
        const m = play('hard', 'hard', seed)
        for (const sw of m.swings)
          for (const [k, n] of Object.entries(sw)) {
            tally[k] = (tally[k] ?? 0) + n
            total += n
          }
      }
      expect(total).toBeGreaterThanOrEqual(500)
      expect((total - (tally.perfect ?? 0)) / total).toBeGreaterThanOrEqual(0.03)
    },
    SLOW,
  )

  it(
    'rallies are sane and normal vs normal is even',
    () => {
      let hits = 0
      let points = 0
      let wins0 = 0
      const n = 40
      for (const seed of seeds(n, 100)) {
        const m = play('normal', 'normal', seed)
        expect(m.winner, `seed ${seed} ended`).not.toBe(-1)
        expect(m.ticks).toBeLessThanOrEqual(MATCH_CAP)
        hits += m.hits
        points += m.points
        if (m.winner === 0) wins0++
      }
      const mean = hits / points
      expect(mean).toBeGreaterThanOrEqual(4)
      expect(mean).toBeLessThanOrEqual(10)
      expect(wins0 / n).toBeGreaterThanOrEqual(0.35)
      expect(wins0 / n).toBeLessThanOrEqual(0.65)
    },
    SLOW,
  )

  it(
    'levels rank: hard beats easy',
    () => {
      let hardWins = 0
      const n = 30
      for (const seed of seeds(n, 200)) {
        // alternate seats so side doesn't matter
        const hardSide = seed % 2 === 0 ? 0 : 1
        const m = seed % 2 === 0 ? play('hard', 'easy', seed) : play('easy', 'hard', seed)
        if (m.winner === hardSide) hardWins++
      }
      expect(hardWins / n).toBeGreaterThanOrEqual(0.8)
    },
    SLOW,
  )
})
