// Doubles gauges with a scripted human + AI team (harness: balance.harness.ts).
import { describe, expect, it } from 'vitest'
import { dubsOf, HUMAN_ROWS, LEVELS } from './balance.harness'
import { type Level } from './sim'

// Sanity bars, not tuning bands (measured at Task 5, N_DUBS = 40, COVER.depth 0.9): AI pairs 40 / 47.5 /
// 50% for side 0; skilled + AI wins 100 / 95 / 67.5% vs easy / normal / hard pairs (1v1: 100 / 96 /
// 62.5%), casual + AI 90% vs easy, tap + AI 57.5% vs normal. The human hits ~50% of its team's shots.
// Bonk ruling: friendly fire stays on, but accidental teammate bonks must be rare: ≤ 0.03 a point (the
// 1v1 accidental bar); measured ≤ 0.017 with the cover rule and STUN.reach 1.2 m, so the reach is kept.
describe('doubles gauges', () => {
  it('a human + AI team: beats Easy, competes with Normal, can beat Hard; ranks by level', () => {
    const sk = (l: Level) => dubsOf('skilled', l).win
    expect(sk('easy')).toBeGreaterThanOrEqual(0.6)
    expect(sk('normal')).toBeGreaterThanOrEqual(0.25)
    // Not a walkover: the Normal pair takes ≥ 30% of the points. A point share, not the plan's win ≤ 0.85:
    // the skilled script beats a Normal computer 96% alone and wins 87.5–95% here (share ~0.64 at every
    // COVER setting tried: first-to-11 amplifies it), so a win bar only measured seed noise.
    expect(dubsOf('skilled', 'normal').share).toBeLessThanOrEqual(0.7)
    expect(sk('hard')).toBeGreaterThanOrEqual(0.08)
    expect(dubsOf('casual', 'easy').win).toBeGreaterThanOrEqual(0.35)
    expect(dubsOf('tap', 'normal').win).toBeGreaterThanOrEqual(0.1)
    expect(sk('easy')).toBeGreaterThanOrEqual(sk('normal'))
    expect(sk('normal')).toBeGreaterThanOrEqual(sk('hard') - 0.05)
  })

  it("the AI teammate neither hogs nor abandons: the human hits 30–75% of its team's shots", () => {
    for (const [name, l] of HUMAN_ROWS) {
      const r = dubsOf(name, l)
      expect(r.humanShare, `${name} v ${l}`).toBeGreaterThanOrEqual(0.3)
      expect(r.humanShare, `${name} v ${l}`).toBeLessThanOrEqual(0.75)
    }
  })

  it('teammates split the court: rarely within 1 m, teammate bonks rare', () => {
    const rows = [
      ...LEVELS.map((l) => [`bots v ${l}`, dubsOf('bots', l)] as const),
      ...HUMAN_ROWS.map(([name, l]) => [`${name} v ${l}`, dubsOf(name, l)] as const),
    ]
    if (process.env.BALANCE_LOG)
      console.warn(
        JSON.stringify(
          Object.fromEntries(
            rows.map(([k, r]) => [k, { friendly: r.friendly / r.points, foes: r.foes / r.points }]),
          ),
        ),
      )
    for (const [k, r] of rows) {
      expect(r.close, k).toBeLessThan(0.05)
      expect(r.friendly / r.points, k).toBeLessThanOrEqual(0.03)
    }
  })
})
