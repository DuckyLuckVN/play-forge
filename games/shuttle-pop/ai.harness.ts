// Test-only helpers for the bot tests (ai.test.ts and ai.simulation.test.ts).
import { setupBots, shuttlePopGame as game, TICK_RATE, type Level, type SpEvent, type SpState } from './sim'

/** 9 minutes of sim time. */
export const MATCH_CAP = 9 * 60 * TICK_RATE
/** Hard v hard: 10 minutes. */
export const HARD_CAP = 10 * 60 * TICK_RATE

export interface MatchStats {
  winner: -1 | 0 | 1
  ticks: number
  points: number
  points0: number
  hits: number
  serveTick: number[]
  /** Swings per side: hit grades + whiffs. */
  swings: [Record<string, number>, Record<string, number>]
}

/** Bot vs bot to the end (or MATCH_CAP). Events are read once each by id. */
export function play(a: Level, b: Level, seed: number, cap = MATCH_CAP): MatchStats {
  const s: SpState = setupBots(a, b, seed)
  const st: MatchStats = {
    winner: -1,
    ticks: 0,
    points: 0,
    points0: 0,
    hits: 0,
    serveTick: [],
    swings: [{}, {}],
  }
  let lastId = 0
  const count = (e: SpEvent) => {
    if (e.k === 'hit') {
      st.hits++
      st.swings[e.side][e.grade] = (st.swings[e.side][e.grade] ?? 0) + 1
    } else if (e.k === 'whiff') st.swings[e.side].whiff = (st.swings[e.side].whiff ?? 0) + 1
    else if (e.k === 'point') {
      st.points++
      if (e.side === 0) st.points0++
    }
  }
  while (s.phase !== 'over' && s.tick < cap) {
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

/** Bot-vs-bot runs take ~5 s each unloaded; generous timeout so a busy machine does not flake. */
export const SLOW = 60_000
