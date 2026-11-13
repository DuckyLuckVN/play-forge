import { describe, expect, it } from 'vitest'
import type { PlayerInfo } from '@forge/net/session'
import { AI_ID, createState, step, TICK_RATE } from './sim'

// How long the computer takes to clear a jar (it races alone: the player just waits
// with an empty input stream, so the human jar is parked out of the way).
function clearTime(rival: string, level: string, seed: number, speed = 'medium') {
  const s = createState([{ id: 'me', name: 'me', slot: 0, ready: true } as PlayerInfo], seed, {
    rival,
    level,
    speed,
  })
  // Park the player's jar: no capsules for them.
  s.boards[0].phase = 'clear'
  s.boards[0].timer = 1e9
  const ai = s.boards.find((b) => b.id === AI_ID)!
  for (let i = 0; i < 20 * 60 * TICK_RATE && !s.over; i++) step(s, [])
  return { won: ai.phase === 'won', seconds: s.tick / TICK_RATE, pieces: ai.pieces }
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]

// Slow (seconds): runs with BALANCE=1 (`BALANCE=1 npx vitest run games/gloop-pop/balance.test.ts`).
// Last tuned (median clear time, 8 seeds, medium speed, 18-row bottle): hard L1 27 s / L5 104 s / L10 244 s;
// normal L1 68 s / L5 189 s / L10 317 s; easy L1 112 s, never clears L5.
describe.runIf(process.env.BALANCE)('computer pacing', () => {
  it.each([
    ['easy', '1'],
    ['normal', '1'],
    ['hard', '1'],
    ['easy', '5'],
    ['normal', '5'],
    ['hard', '5'],
    ['normal', '10'],
    ['hard', '10'],
  ])('%s, level %s', (rival, level) => {
    const runs = SEEDS.map((seed) => clearTime(rival, level, seed))
    const wins = runs.filter((r) => r.won).length
    const t = median(runs.map((r) => (r.won ? r.seconds : Infinity)))
    process.stderr.write(`${rival} L${level}: wins ${wins}/${SEEDS.length}, median ${t.toFixed(1)} s\n`)
    expect(wins).toBeGreaterThan(rival === 'easy' && level !== '1' ? -1 : 0)
  })
})
