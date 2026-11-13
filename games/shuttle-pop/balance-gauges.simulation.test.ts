// 1v1 tuning gauges: scripted casual / skilled players vs every computer level (harness: balance.harness.ts).
import { describe, expect, it } from 'vitest'
import { gauge, mean, N, PROFILES, type Row } from './balance.harness'
import { type ShotKind } from './shots'

// Tuning gauges, not truths. Measured at N (task-14 fix 2: proxies charging, taps 4–7 ticks long, reach
// judged from where each side stood): casual wins Easy 99%, Normal 54%, Hard 5%; skilled wins Hard 62.5%.
// The two Hard targets pull apart: point shares sit ~19–22 points apart (casual ~31–35%, skilled
// ~53–55%) for every Hard grade mix tried (task-14 report), so the Hard bands (casual ≥ 5%, skilled ≤ 65%)
// can't both have margin.
describe('balance vs scripted players (tuning gauges)', () => {
  it('casual: beats Easy, a bit under even with Normal, wins vs Hard now and then; even rallies stay short', () => {
    const r = {
      easy: gauge(PROFILES.casual, 'easy', N),
      normal: gauge(PROFILES.casual, 'normal', N),
      hard: gauge(PROFILES.casual, 'hard', N),
    }
    expect(r.easy.win).toBeGreaterThanOrEqual(0.9)
    // 0.3–0.5 (was 0.45–0.65) since the 2026-11-13 bot retune: Normal was asked to be a bit tougher
    // (better smash defence, dive saves); measured 0.39.
    expect(r.normal.win).toBeGreaterThanOrEqual(0.3)
    expect(r.normal.win).toBeLessThanOrEqual(0.5)
    expect(r.hard.win).toBeGreaterThanOrEqual(0.05)
    expect(r.hard.win).toBeLessThan(r.normal.win)
    // Spec: 4–10 hits a rally between equal players (shots = serve + hits), at most 5 min a match.
    expect(r.normal.shots).toBeLessThanOrEqual(10.5)
    for (const l of ['easy', 'normal', 'hard'] as const) expect(r[l].minutes).toBeLessThanOrEqual(5)
  })

  it('skilled: beats Hard sometimes, not always; smash fastest, then drive, then clear', () => {
    const speeds: Partial<Record<ShotKind, number[]>> = {}
    const hard = gauge(PROFILES.skilled, 'hard', N, speeds)
    expect(hard.win).toBeGreaterThanOrEqual(0.2)
    expect(hard.win).toBeLessThanOrEqual(0.65)
    expect(hard.minutes).toBeLessThanOrEqual(5)
    const avg = (k: ShotKind) => mean(speeds[k] ?? [])
    expect(avg('smash')).toBeGreaterThan(avg('drive'))
    expect(avg('drive')).toBeGreaterThan(avg('clear'))
    if (process.env.BALANCE_LOG)
      console.warn(
        JSON.stringify({
          hard,
          speeds: Object.fromEntries(Object.keys(speeds).map((k) => [k, avg(k as ShotKind)])),
        }),
      )
  })

  it.runIf(process.env.BALANCE_LOG)(
    'logs the full table',
    () => {
      const rows: Record<string, Row> = {}
      for (const [name, H] of Object.entries(PROFILES))
        for (const l of ['easy', 'normal', 'hard'] as const)
          // BALANCE_ONLY=casual-normal (etc.) logs one row.
          if (!process.env.BALANCE_ONLY || process.env.BALANCE_ONLY === `${name}-${l}`)
            rows[`${name} v ${l}`] = gauge(H, l, N)
      console.warn(JSON.stringify(rows, null, 1))
    },
    120_000,
  )
})
