import { describe, expect, it } from 'vitest'
import { needsPost } from './scene'

describe('needsPost', () => {
  it('draws straight to the canvas with no bloom and no glitch (the vignette is a CSS layer)', () => {
    expect(needsPost(0, false)).toBe(false)
  })

  it('uses the composer while a glitch plays or bloom is on', () => {
    expect(needsPost(0.4, false)).toBe(true)
    expect(needsPost(0, true)).toBe(true)
  })
})
