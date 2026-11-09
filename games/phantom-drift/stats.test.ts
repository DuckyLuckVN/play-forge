import { describe, expect, it } from 'vitest'
import { createState, speedAt, TICK_RATE } from './sim'
import { prefersTouchHint } from './hud'
import { distanceText, kmh, summaryRows, timeText } from './stats'

const me = [{ id: 'p0', name: 'P0', slot: 0, ready: true, connected: true }]
const t = (en: string, p?: Record<string, string | number>) =>
  p ? en.replace(/\{(\w+)\}/g, (_, k) => String(p[k])) : en

describe('Phantom Drift numbers', () => {
  it('shows speed in km/h (1 unit = 1 m)', () => {
    expect(kmh(speedAt(0))).toBe(162)
    expect(kmh(speedAt(9))).toBe(389)
  })

  it('shows distance in m, then km', () => {
    expect(distanceText(0)).toBe('0 m')
    expect(distanceText(999.6)).toBe('999 m')
    expect(distanceText(1000)).toBe('1.00 km')
    expect(distanceText(12345)).toBe('12.3 km')
  })

  it('shows time as m:ss', () => {
    expect(timeText(0)).toBe('0:00')
    expect(timeText(65 * TICK_RATE + 30)).toBe('1:05')
    expect(timeText(600 * TICK_RATE)).toBe('10:00')
  })

  it('builds a 3 × 2 summary without repeating the headline score', () => {
    const s = createState(me, 1)
    s.score = 1234.7
    s.dist = 2500
    s.tick = 90 * TICK_RATE
    s.stats = { wisps: 12, nearMisses: 12, bestCombo: 17, phantoms: 2, hearts: 1, topSpeed: speedAt(4) }
    const rows = summaryRows(s, t)
    expect(rows.map((r) => r.label)).toEqual([
      'Distance',
      'Time',
      'Top speed',
      'Wisps',
      'Near misses',
      'Best combo',
    ])
    expect(rows.find((r) => r.label === 'Distance')?.value).toBe('2.50 km')
    expect(rows.find((r) => r.label === 'Time')?.value).toBe('1:30')
    expect(rows.find((r) => r.label === 'Top speed')?.value).toBe(`${kmh(speedAt(4))} km/h`)
    expect(rows.find((r) => r.label === 'Near misses')?.highlight).toBe(true)
    expect(rows.find((r) => r.label === 'Best combo')?.highlight).toBe(false)
  })
})

describe('skill hint', () => {
  it('falls back to the keyboard hint where media queries are unavailable', () => {
    expect(prefersTouchHint()).toBe(false)
  })
})

describe('summary after a death', () => {
  it('counts time and distance up to the death, not the coast to a stop', () => {
    const s = createState(me, 1)
    s.diedAt = 30 * TICK_RATE
    s.diedDist = 1500
    s.tick = 32 * TICK_RATE
    s.dist = 1530
    const rows = summaryRows(s, t)
    expect(rows.find((r) => r.label === 'Time')?.value).toBe('0:30')
    expect(rows.find((r) => r.label === 'Distance')?.value).toBe('1.50 km')
  })
})
