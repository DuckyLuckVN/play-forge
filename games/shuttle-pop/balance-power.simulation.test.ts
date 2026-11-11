// Power swing balance: tap-only play and the per-level win bands vs BASELINE (harness: balance.harness.ts).
import { describe, expect, it } from 'vitest'
import { BASELINE, LEVELS, type Row, rowOf } from './balance.harness'
import { type Level } from './sim'

describe('power swing balance', () => {
  it('tap-only play stays viable vs every level', () => {
    const b = (l: Level) => BASELINE[`tap v ${l}`]
    const r = Object.fromEntries(LEVELS.map((l) => [l, rowOf('tap', l)])) as Record<Level, Row>
    if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ tap: r }))
    expect(r.easy.win).toBeGreaterThanOrEqual(Math.max(0.85, b('easy').win - 0.1))
    expect(r.normal.win).toBeGreaterThanOrEqual(b('normal').win - 0.1)
    expect(r.hard.win).toBeGreaterThanOrEqual(b('hard').win - 0.05)
    for (const l of LEVELS) expect(Math.abs(r[l].share - b(l).share)).toBeLessThanOrEqual(0.05)
  })

  it('AI win rate per difficulty stays in today’s band (casual + skilled)', () => {
    for (const name of ['casual', 'skilled'] as const)
      for (const l of LEVELS) {
        const r = rowOf(name, l)
        const b = BASELINE[`${name} v ${l}`]
        if (process.env.BALANCE_LOG) console.warn(JSON.stringify({ [`${name} v ${l}`]: r }))
        expect(Math.abs(r.win - b.win), `${name} v ${l} win`).toBeLessThanOrEqual(0.1)
        expect(Math.abs(r.share - b.share), `${name} v ${l} share`).toBeLessThanOrEqual(0.05)
      }
  })
})
