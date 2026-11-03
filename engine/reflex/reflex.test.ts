import { describe, expect, it } from 'vitest'
import { ramp, telegraph, tierAt, withinWindow } from './index'

describe('tierAt', () => {
  it('steps every tierTicks and caps', () => {
    expect(tierAt(0, 100, 5)).toBe(0)
    expect(tierAt(99, 100, 5)).toBe(0)
    expect(tierAt(100, 100, 5)).toBe(1)
    expect(tierAt(10_000, 100, 5)).toBe(5)
  })
})

describe('ramp', () => {
  it('goes from start to end over the tiers and holds', () => {
    expect(ramp(0, 9, 1, 2.4)).toBe(1)
    expect(ramp(9, 9, 1, 2.4)).toBeCloseTo(2.4)
    expect(ramp(20, 9, 1, 2.4)).toBeCloseTo(2.4)
    expect(ramp(4.5, 9, 1.1, 0.6)).toBeCloseTo(0.85)
  })
})

describe('telegraph', () => {
  it('reports progress then fires', () => {
    expect(telegraph(100, 40, 60)).toEqual({ progress: 0, fired: false })
    expect(telegraph(100, 40, 80)).toEqual({ progress: 0.5, fired: false })
    expect(telegraph(100, 40, 100)).toEqual({ progress: 1, fired: true })
  })
})

describe('withinWindow', () => {
  it('is true only for recent marks', () => {
    expect(withinWindow(50, 55, 9)).toBe(true)
    expect(withinWindow(50, 58, 9)).toBe(true)
    expect(withinWindow(50, 59, 9)).toBe(false)
    expect(withinWindow(-Infinity, 5, 9)).toBe(false)
  })
})
