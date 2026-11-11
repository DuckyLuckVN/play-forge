import { describe, expect, it } from 'vitest'
import { levelStep, soundAt, soundSteps, toneAt, type ToneRecipe } from './recipe'

const whoosh: ToneRecipe = { freq: [2000, 500], to: 300, dur: [0.1, 0.2], vol: [0.2, 0.4], wave: 'noise' }

describe('tone recipes', () => {
  it('lerps durations/volumes linearly and pitch geometrically', () => {
    expect(toneAt(whoosh, 0)).toEqual({ freq: 2000, to: 300, dur: 0.1, vol: 0.2, wave: 'noise' })
    expect(toneAt(whoosh, 1)).toMatchObject({ freq: 500, dur: 0.2, vol: 0.4 })
    expect(toneAt(whoosh, 0.5).freq).toBeCloseTo(1000)
    expect(toneAt(whoosh, 0.5).vol).toBeCloseTo(0.3)
  })

  it('ranges apply to to/at/q too; absent optionals stay absent', () => {
    const r: ToneRecipe = { freq: 100, to: [100, 400], dur: 0.1, vol: 0.1, at: [0, 0.1], q: [1, 3] }
    const t = toneAt(r, 0.5) as unknown as Record<string, number>
    expect(t.to).toBeCloseTo(200)
    expect(t.at).toBeCloseTo(0.05)
    expect(t.q).toBeCloseTo(2)
    expect('at' in toneAt(whoosh, 0.5)).toBe(false)
  })

  it('clamps the level; NaN = 0', () => {
    expect(toneAt(whoosh, 2)).toEqual(toneAt(whoosh, 1))
    expect(toneAt(whoosh, NaN)).toEqual(toneAt(whoosh, 0))
  })

  it('a layer fading in from vol 0 is absent at level 0', () => {
    const body: ToneRecipe = { freq: 150, dur: 0.1, vol: [0, 0.3], wave: 'sine' }
    expect(soundAt([whoosh, body], 0)).toHaveLength(1)
    expect(soundAt([whoosh, body], 1)).toHaveLength(2)
  })

  it('levelStep rounds to the nearest of n steps', () => {
    expect([0, 0.12, 0.13, 0.5, 1, 7, -1, NaN].map((t) => levelStep(t, 5))).toEqual([0, 0, 1, 2, 4, 4, 0, 0])
    expect(levelStep(undefined as unknown as number, 5)).toBe(0)
  })

  it('soundSteps precomputes n levels, ends exact', () => {
    const s = soundSteps([whoosh], 5)
    expect(s).toHaveLength(5)
    expect(s[0][0]).toEqual(toneAt(whoosh, 0))
    expect(s[4][0]).toEqual(toneAt(whoosh, 1))
  })
})
