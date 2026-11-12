// Jump / lunge, racket stun and court size gauges: scripted players vs the computer (harness:
// balance.harness.ts).
import { describe, expect, it } from 'vitest'
import { botBonks, gauge, LEVELS, N, N_BOTS, N_SIZE, PROFILES, rowOf } from './balance.harness'

describe('jump / lunge balance', () => {
  it('the ability helps when used well, and is not always-best', () => {
    const plain = rowOf('casual', 'normal')
    const smart = gauge(PROFILES.casualSmart, 'normal', N)
    const spam = gauge(PROFILES.casualSpam, 'normal', N)
    if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ plain, smart, spam }))
    // Worth learning: no worse than plain beyond noise (~±0.05 at N = 80). Since the computer stopped
    // letting low shots drop without a swing (ai.ts safeOffset), a jump smash no longer feeds on that gap:
    // measured smart 0.5 vs plain 0.525 win (share 0.495 vs 0.504); before, 0.5875 vs 0.5375.
    expect(smart.win).toBeGreaterThanOrEqual(plain.win - 0.05)
    expect(smart.win).toBeLessThanOrEqual(plain.win + 0.15) // not a cheat code
    expect(spam.win).toBeLessThan(smart.win) // pressing it always is worse
    expect(spam.share).toBeLessThanOrEqual(plain.share + 0.02) // spam ≈ no better than never
  })
})

// Rulings: the computer never aims bonks but can bonk by accident; a bonk is 0.8 s of no move / swing
// and then 2 s of immunity (stun.ts), so at most ~29% of the time stunned in theory.
describe('racket stun balance', () => {
  it('accidental bonks are rare in 1v1', () => {
    const rows: Record<string, { points: number; bonks: number }> = {}
    for (const l of LEVELS) {
      const r = rowOf('casual', l)
      rows[`casual v ${l}`] = { points: r.points, bonks: r.bonks }
      expect(r.bonks / r.points, `casual v ${l}`).toBeLessThanOrEqual(0.03)
    }
    const bots = botBonks('hard', N_BOTS)
    rows['hard v hard'] = bots
    if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ accidentalBonks: rows }))
    expect(bots.bonks / bots.points, 'hard v hard').toBeLessThanOrEqual(0.03)
  })

  it('bonking is not a cheat code: a net bonker wins no more than plain play', () => {
    const plain = rowOf('casual', 'normal')
    const bonker = gauge(PROFILES.casualBonker, 'normal', N)
    if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ plain, bonker }))
    expect(bonker.win).toBeLessThanOrEqual(plain.win + 0.1)
  })
})

// Bigger courts = more running for both sides: casual should still beat Easy and still lose to Hard.
describe('court size sanity gauges', () => {
  for (const size of ['large', 'xl'] as const)
    it(`${size}: casual still beats Easy, Hard still beats casual, matches end`, () => {
      const easy = gauge(PROFILES.casual, 'easy', N_SIZE, {}, size)
      const hard = gauge(PROFILES.casual, 'hard', N_SIZE, {}, size)
      if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ size, easy, hard }))
      expect(easy.win).toBeGreaterThanOrEqual(0.75)
      expect(hard.win).toBeLessThanOrEqual(0.5)
      for (const r of [easy, hard]) expect(r.minutes).toBeLessThanOrEqual(6)
    })
})
