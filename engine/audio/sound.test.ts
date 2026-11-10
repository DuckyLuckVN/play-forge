import { describe, expect, it } from 'vitest'
import {
  MAX_VOICES,
  SFX_CLIP_THRESHOLD,
  softClipCurve,
  duckedMusicGain,
  pruneVoices,
  voicesAllowed,
} from './sound'

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

describe('softClipCurve (effects bus soft clip, no makeup gain)', () => {
  const n = 2049
  const c = softClipCurve(n)
  const xOf = (i: number) => (i / (n - 1)) * 2 - 1
  it('is exactly linear up to the threshold', () => {
    for (let i = 0; i < n; i++) {
      if (Math.abs(xOf(i)) <= SFX_CLIP_THRESHOLD) expect(Math.abs(c[i] - xOf(i))).toBeLessThan(1e-6)
    }
  })
  it('is monotonic and never exceeds full scale', () => {
    for (let i = 1; i < n; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1])
    for (const y of c) expect(Math.abs(y)).toBeLessThanOrEqual(1)
  })
  it('is continuous (no slope jump) at the threshold', () => {
    const m = 20001
    const d = softClipCurve(m)
    const h = 2 / (m - 1)
    const i = Math.round(((SFX_CLIP_THRESHOLD + 1) / 2) * (m - 1))
    expect(Math.abs(d[i + 1] - d[i] - (d[i] - d[i - 1]))).toBeLessThan(1e-3 * h)
    expect(Math.abs((d[i + 1] - d[i]) / h - 1)).toBeLessThan(1e-2)
  })
  it('is odd-symmetric and compresses peaks below 1', () => {
    for (let i = 0; i < n; i++) expect(c[i]).toBeCloseTo(-c[n - 1 - i], 6)
    expect(c[n - 1]).toBeGreaterThan(SFX_CLIP_THRESHOLD)
    expect(c[n - 1]).toBeLessThanOrEqual(1)
  })
})
