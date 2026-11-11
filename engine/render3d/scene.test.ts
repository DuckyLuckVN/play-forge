import { describe, expect, it } from 'vitest'
import { needsPost, wantsMsaa } from './scene'

describe('needsPost', () => {
  it('draws straight to the canvas with no bloom and no glitch (the vignette is a CSS layer)', () => {
    expect(needsPost(0, false)).toBe(false)
  })

  it('uses the composer while a glitch plays or a post effect (bloom, AO) is on', () => {
    expect(needsPost(0.4, false)).toBe(true)
    expect(needsPost(0, true)).toBe(true)
  })
})

describe('wantsMsaa', () => {
  it('on below 2 device pixels per CSS pixel, off on sharp phone screens', () => {
    expect(wantsMsaa(1)).toBe(true)
    expect(wantsMsaa(1.5)).toBe(true)
    expect(wantsMsaa(2)).toBe(false)
    expect(wantsMsaa(3)).toBe(false)
    expect(wantsMsaa(0)).toBe(true) // unknown ratio: treat as 1
  })
})
