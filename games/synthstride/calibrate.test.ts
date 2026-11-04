import { describe, expect, it } from 'vitest'
import {
  calibrationKey,
  estimateOffset,
  loadOffset,
  MAX_OFFSET_MS,
  offsetTicks,
  saveOffset,
  tapOffset,
} from './calibrate'

const clicks = [0, 600, 1200, 1800, 2400, 3000]
const memory = () => {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

describe('timing calibration', () => {
  it('takes the median lateness, ignoring a stray tap', () => {
    expect(estimateOffset(clicks, [40, 650, 1245, 1835, 2440, 2700])).toBe(43)
  })

  it('needs at least four usable taps', () => {
    expect(estimateOffset(clicks, [40, 650, 1245])).toBeNull()
  })

  it('never goes negative or past the cap', () => {
    expect(estimateOffset(clicks, [-30, 570, 1170, 1770])).toBe(0)
    expect(estimateOffset(clicks, [290, 890, 1490, 2090])).toBe(MAX_OFFSET_MS)
  })

  it('converts to ticks, clamped', () => {
    expect(offsetTicks(0)).toBe(0)
    expect(offsetTicks(50)).toBe(3)
    expect(offsetTicks(9999)).toBe(12)
  })

  it('saves and loads per browser, sanitising junk', () => {
    const store = memory()
    expect(loadOffset(store)).toBe(0)
    saveOffset(57.4, store)
    expect(loadOffset(store)).toBe(57)
    store.setItem('play-forge:synthstride:latency', 'abc')
    expect(loadOffset(store)).toBe(0)
    expect(loadOffset(null)).toBe(0)
  })

  // Regression: Space / Enter used to reach the focused "Calibrate timing"
  // button and open another overlay on every tap.
  it('while measuring, Space / Enter are taps and never reach the page', () => {
    expect(calibrationKey('Space', true)).toBe('tap')
    expect(calibrationKey('Enter', true)).toBe('tap')
    expect(calibrationKey('KeyA', true)).toBe('block')
  })

  it('after measuring, Space / Enter press the focused dialog button; Escape closes', () => {
    expect(calibrationKey('Space', false)).toBe('pass')
    expect(calibrationKey('Enter', false)).toBe('pass')
    expect(calibrationKey('Escape', true)).toBe('close')
    expect(calibrationKey('Escape', false)).toBe('close')
  })

  it('measures one tap against the nearest click (colours its dot)', () => {
    expect(tapOffset(640, clicks)).toBe(40)
    expect(tapOffset(1170, clicks)).toBe(-30)
  })
})
