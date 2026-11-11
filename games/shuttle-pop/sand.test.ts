import { RepeatWrapping, SRGBColorSpace } from 'three'
import { describe, expect, it } from 'vitest'
import { SAND, sandPixels, sandTexture } from './sand'

describe('sand texture', () => {
  it('is the same every load (seeded) and differs by seed', () => {
    expect(sandPixels()).toEqual(sandPixels())
    expect(sandPixels(32, 1)).not.toEqual(sandPixels(32, 2))
  })

  it('stays near white (it tints the surround colour), with visible grain', () => {
    const p = sandPixels()
    let sum = 0
    let min = 255
    let max = 0
    for (let i = 0; i < p.length; i += 4) {
      sum += p[i]
      min = Math.min(min, p[i])
      max = Math.max(max, p[i])
      expect(p[i + 3]).toBe(255)
    }
    const mean = sum / (p.length / 4)
    expect(mean).toBeGreaterThan(215)
    expect(mean).toBeLessThan(250)
    expect(max - min).toBeGreaterThan(40)
  })

  it('tiles seamlessly: the soft patches match across opposite edges', () => {
    // Compare the patch layer alone: average a band so per-pixel grain cancels out.
    const px = SAND.px
    const p = sandPixels()
    const col = (x: number) => {
      let s = 0
      for (let y = 0; y < px; y++) s += p[(y * px + x) * 4]
      return s / px
    }
    expect(Math.abs(col(0) - col(px - 1))).toBeLessThan(4)
  })

  it('repeats and is sRGB', () => {
    const t = sandTexture(4)
    expect([t.wrapS, t.wrapT]).toEqual([RepeatWrapping, RepeatWrapping])
    expect(t.colorSpace).toBe(SRGBColorSpace)
    expect(t.anisotropy).toBe(4)
    t.dispose()
  })
})
