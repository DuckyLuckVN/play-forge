import { describe, expect, it } from 'vitest'
import { MAX_VOICES, SFX_LIMITER, duckedMusicGain, pruneVoices, voicesAllowed } from './sound'

describe('duckedMusicGain', () => {
  it('scales the music level by the duck factor', () => {
    expect(duckedMusicGain(1, 1)).toBeCloseTo(0.35)
    expect(duckedMusicGain(1, 0.6)).toBeCloseTo(0.21)
    expect(duckedMusicGain(0.5, 1)).toBeCloseTo(0.25 * 0.35)
  })

  it('clamps the duck factor to 0..1', () => {
    expect(duckedMusicGain(1, 2)).toBeCloseTo(0.35)
    expect(duckedMusicGain(1, -1)).toBe(0)
  })
})

describe('voicesAllowed', () => {
  it('plays everything under the cap, the head of the sound at it, nothing past it', () => {
    expect(voicesAllowed(0, 6)).toBe(6)
    expect(voicesAllowed(MAX_VOICES - 2, 6)).toBe(2)
    expect(voicesAllowed(MAX_VOICES, 6)).toBe(0)
    expect(voicesAllowed(MAX_VOICES + 5, 6)).toBe(0)
    expect(voicesAllowed(0, 3, 2)).toBe(2)
  })
})

describe('pruneVoices', () => {
  it('drops finished and non-finite voices, keeps pending ones', () => {
    const ends = [1, 2, 3, NaN, 5]
    expect(pruneVoices(ends, 2)).toBe(2)
    expect(ends).toEqual([3, 5])
  })

  it('a stalled clock holds voices but never blocks forever once time advances', () => {
    const ends = Array.from({ length: MAX_VOICES }, () => 1)
    expect(voicesAllowed(pruneVoices(ends, 0), 3)).toBe(0) // suspended context, clock at 0
    expect(voicesAllowed(pruneVoices(ends, 1.5), 3)).toBe(3) // resumed
  })

  it('records nothing for tones that never started', () => {
    const ends: number[] = []
    expect(voicesAllowed(pruneVoices(ends, 0), 3)).toBe(3)
  })
})

describe('SFX_LIMITER', () => {
  it('only catches peaks: threshold below full scale, fast attack', () => {
    expect(SFX_LIMITER.threshold).toBe(-6)
    expect(SFX_LIMITER.attack).toBeLessThan(0.01)
  })
})
