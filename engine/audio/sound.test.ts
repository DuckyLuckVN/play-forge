import { describe, expect, it } from 'vitest'
import { duckedMusicGain } from './sound'

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
