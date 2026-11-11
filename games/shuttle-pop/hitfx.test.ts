import { describe, expect, it } from 'vitest'
import { flashAt, HIT_FX, hitJuice } from './hitfx'

describe('hitJuice', () => {
  it('plain hits stay calm; Perfect and smashes flash; only big smashes stop', () => {
    expect(hitJuice(false, false, false)).toEqual({ flash: 0, stop: 0 })
    expect(hitJuice(true, false, false).flash).toBeGreaterThan(0)
    expect(hitJuice(true, false, false).stop).toBe(0)
    expect(hitJuice(false, true, false)).toEqual({ flash: HIT_FX.flash.smash, stop: 0 })
    expect(hitJuice(true, true, false).stop).toBe(HIT_FX.stop.perfectSmash)
  })

  it('a full-charge smash is the biggest (dopamine spike), and its stop stays short', () => {
    const big = hitJuice(true, true, true)
    for (const p of [false, true])
      for (const s of [false, true]) expect(big.flash).toBeGreaterThanOrEqual(hitJuice(p, s, false).flash)
    expect(big.stop).toBeGreaterThan(0)
    expect(big.stop).toBeLessThanOrEqual(0.08) // ~5 frames: felt, never in the way of the next shot
  })
})

describe('flashAt', () => {
  it('fades linearly to 0 and stays off', () => {
    expect(flashAt(0.8, 0)).toBeCloseTo(0.8)
    expect(flashAt(0.8, HIT_FX.fade / 2)).toBeCloseTo(0.4)
    expect(flashAt(0.8, HIT_FX.fade)).toBe(0)
    expect(flashAt(0, 0)).toBe(0)
    expect(flashAt(0.8, -1)).toBe(0)
    expect(flashAt(0.8, Number.NaN)).toBe(0)
  })
})
