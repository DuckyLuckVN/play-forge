// Doubles gauges, computer-only: AI pairs and rally length (harness: balance.harness.ts).
import { describe, expect, it } from 'vitest'
import { bots1v1Of, dubsOf, LEVELS } from './balance.harness'

// Sanity bars, not tuning bands (measured at Task 5, N_DUBS = 40, COVER.depth 0.9): AI pairs 40 / 47.5 /
// 50% for side 0; skilled + AI wins 100 / 95 / 67.5% vs easy / normal / hard pairs (1v1: 100 / 96 /
// 62.5%), casual + AI 90% vs easy, tap + AI 57.5% vs normal. The human hits ~50% of its team's shots.
// Bonk ruling: friendly fire stays on, but accidental teammate bonks must be rare: ≤ 0.03 a point (the
// 1v1 accidental bar); measured ≤ 0.017 with the cover rule and STUN.reach 1.2 m, so the reach is kept.
describe('doubles gauges', () => {
  it('AI pairs are even: side 0 wins 30–70% at every level', () => {
    for (const l of LEVELS) {
      const r = dubsOf('bots', l)
      expect(r.win, l).toBeGreaterThanOrEqual(0.3)
      expect(r.win, l).toBeLessThanOrEqual(0.7)
    }
  })

  it('doubles rallies run at least as long as 1v1 (two defenders)', () => {
    for (const l of ['normal', 'hard'] as const) {
      const one = bots1v1Of(l)
      if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ [`1v1 bots v ${l}`]: one }))
      expect(dubsOf('bots', l).shots, l).toBeGreaterThanOrEqual(one.shots)
    }
  })
})
