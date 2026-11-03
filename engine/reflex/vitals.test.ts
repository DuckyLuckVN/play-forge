import { describe, expect, it } from 'vitest'
import { addCombo, comboMultiplier, createVitals, damage, regen } from './vitals'

describe('vitals', () => {
  it('damage takes a heart, grants invulnerability and breaks the combo', () => {
    const v = createVitals(3)
    v.combo = 7
    expect(damage(v, 10, 60)).toBe(true)
    expect(v).toMatchObject({ hearts: 2, invulnUntil: 70, combo: 0, calmSince: 10 })
    expect(damage(v, 69, 60)).toBe(false)
    expect(damage(v, 70, 60)).toBe(true)
    expect(v.hearts).toBe(1)
  })

  it('never goes below zero hearts', () => {
    const v = createVitals(1)
    expect(damage(v, 0, 0)).toBe(true)
    expect(damage(v, 5, 0)).toBe(false)
    expect(v.hearts).toBe(0)
  })

  it('regrows a heart after a calm stretch, not before, and not past max', () => {
    const v = createVitals(3)
    expect(regen(v, 500, 100)).toBe(false) // full: calm clock follows
    damage(v, 600, 10)
    expect(regen(v, 699, 100)).toBe(false)
    expect(regen(v, 700, 100)).toBe(true)
    expect(v.hearts).toBe(3)
    expect(regen(v, 2000, 100)).toBe(false)
  })

  it('does not revive the dead', () => {
    const v = createVitals(1)
    damage(v, 0, 0)
    expect(regen(v, 10_000, 100)).toBe(false)
  })

  it('combo multiplier steps every `per` and caps at max', () => {
    expect([0, 7, 8, 16, 31, 32, 99].map((c) => comboMultiplier(c, 8, 5))).toEqual([1, 1, 2, 3, 4, 5, 5])
  })

  it('addCombo reports only multiplier increases and tracks the best', () => {
    const v = createVitals(3)
    const ups: number[] = []
    for (let i = 0; i < 17; i++) {
      const m = addCombo(v, 8, 5)
      if (m) ups.push(m)
    }
    expect(ups).toEqual([2, 3])
    expect(v.bestCombo).toBe(17)
  })
})
