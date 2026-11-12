import { describe, expect, it } from 'vitest'
import { hillHeight, mountainPeaks, skylineBlocks, wrap01 } from './backdrop'

describe('backdrop helpers', () => {
  it('wrap01 keeps drifting offsets in [0, 1)', () => {
    expect(wrap01(0.25)).toBeCloseTo(0.25)
    expect(wrap01(1.25)).toBeCloseTo(0.25)
    expect(wrap01(-0.25)).toBeCloseTo(0.75)
    expect(wrap01(3)).toBe(0)
  })

  it('skyline: deterministic, 5–12 m tall, kept to the middle of the arc, both rows present', () => {
    const L = 237
    const blocks = skylineBlocks(21, L)
    expect(skylineBlocks(21, L)).toEqual(blocks)
    expect(blocks.some((b) => b.row === 0)).toBe(true)
    expect(blocks.some((b) => b.row === 1)).toBe(true)
    for (const b of blocks) {
      expect(b.h).toBeGreaterThanOrEqual(5)
      expect(b.h).toBeLessThanOrEqual(12)
      expect(b.x).toBeGreaterThanOrEqual(L * 0.2)
      expect(b.x).toBeLessThan(L * 0.8)
    }
    // Taller in the middle than at the ends.
    const mid = blocks.filter((b) => Math.abs(b.x / L - 0.5) < 0.1)
    const ends = blocks.filter((b) => Math.abs(b.x / L - 0.5) > 0.22)
    const avg = (bs: typeof blocks) => bs.reduce((s, b) => s + b.h, 0) / bs.length
    expect(avg(mid)).toBeGreaterThan(avg(ends))
  })

  it('hills stay low: near under 4 m, far under 10 m (the skyline peeks over)', () => {
    for (let x = 0; x <= 237; x += 3) {
      expect(hillHeight(x, 237, false)).toBeLessThan(4)
      expect(hillHeight(x, 237, false)).toBeGreaterThan(0)
      expect(hillHeight(x, 237, true)).toBeLessThan(10)
    }
  })
})

describe('mountain ranges', () => {
  const length = 80 * ((85 * Math.PI) / 180) * 2
  it('are deterministic, span the arc, and stay under the painted top (18 m)', () => {
    for (const range of [0, 1] as const) {
      const peaks = mountainPeaks(4, length, range)
      expect(mountainPeaks(4, length, range)).toEqual(peaks)
      expect(peaks[0].x - peaks[0].half).toBeLessThanOrEqual(0)
      const last = peaks[peaks.length - 1]
      expect(last.x + last.half).toBeGreaterThanOrEqual(length)
      for (const p of peaks) expect(p.h).toBeLessThan(18)
    }
  })
  it('front range is lower than the back on average (layered depth)', () => {
    const avg = (r: 0 | 1) => {
      const p = mountainPeaks(4, length, r)
      return p.reduce((n, q) => n + q.h, 0) / p.length
    }
    expect(avg(1)).toBeLessThan(avg(0))
  })
})
