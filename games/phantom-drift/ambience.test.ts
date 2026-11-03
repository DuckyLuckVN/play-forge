import { describe, expect, it } from 'vitest'
import { ambienceAt, DAY_CYCLE, HAZARD_HUES, RIFT_HUE_RANGE, riftHue } from './ambience'

const hueDistance = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360)
  return Math.min(d, 360 - d)
}

describe('rift colour drift', () => {
  it('stays in the cool range at all times', () => {
    for (let t = 0; t < 600; t += 0.5) {
      const h = riftHue(t)
      expect(h).toBeGreaterThanOrEqual(RIFT_HUE_RANGE[0])
      expect(h).toBeLessThanOrEqual(RIFT_HUE_RANGE[1])
    }
  })

  it('never comes near a hazard colour', () => {
    for (let t = 0; t < 600; t += 0.5)
      for (const hazard of HAZARD_HUES) expect(hueDistance(riftHue(t), hazard)).toBeGreaterThan(40)
  })

  it('drifts slowly (no jumps between frames)', () => {
    for (let t = 0; t < 300; t += 1 / 60) expect(Math.abs(riftHue(t + 1 / 60) - riftHue(t))).toBeLessThan(0.2)
  })
})

describe('day / night', () => {
  it('starts at night and cycles every DAY_CYCLE seconds', () => {
    expect(ambienceAt(0).daylight).toBe(0)
    expect(ambienceAt(DAY_CYCLE).daylight).toBe(0)
    expect(ambienceAt(12.3).daylight).toBeCloseTo(ambienceAt(12.3 + DAY_CYCLE).daylight)
  })

  it('reaches full day mid-cycle, with no stars and the sun up', () => {
    const peak = Math.max(...Array.from({ length: 180 }, (_, i) => ambienceAt(i).daylight))
    expect(peak).toBe(1)
    const noon = Array.from({ length: 180 }, (_, i) => ambienceAt(i)).find((a) => a.daylight === 1)!
    expect(noon.stars).toBe(0)
    expect(noon.sunHeight).toBeGreaterThan(ambienceAt(0).sunHeight)
  })

  it('changes smoothly', () => {
    for (let t = 0; t < DAY_CYCLE; t += 1 / 60) {
      const a = ambienceAt(t)
      const b = ambienceAt(t + 1 / 60)
      expect(Math.abs(a.daylight - b.daylight)).toBeLessThan(0.02)
      expect(Math.abs(a.warmth - b.warmth)).toBeLessThan(0.02)
    }
  })

  it('has a warm sunrise and sunset glow between night and day', () => {
    const warmest = Math.max(...Array.from({ length: 720 }, (_, i) => ambienceAt(i / 4).warmth))
    expect(warmest).toBeGreaterThan(0.8)
    expect(ambienceAt(0).warmth).toBe(0)
  })
})
