import { describe, expect, it } from 'vitest'
import { runChange, TickClock } from './clock'

describe('TickClock', () => {
  it('maps ticks to local time from the earliest arrivals (ignores late packets)', () => {
    const c = new TickClock(60)
    c.observe(0, 1000)
    c.observe(1, 1016.7 + 40) // arrived late: jitter
    c.observe(2, 1033.3)
    expect(c.timeOf(2)).toBeCloseTo(1033.3, 0)
    expect(c.tickAt(1050)).toBeCloseTo(3, 1)
  })

  it('follows a host that runs slow, gradually', () => {
    const c = new TickClock(60)
    for (let t = 0; t < 600; t++) c.observe(t, 1000 + t * 18) // host ticks every 18 ms, not 16.7
    // An 8% slow host (extreme): still tracked within the half-second window.
    expect(Math.abs(c.timeOf(599) - (1000 + 599 * 18))).toBeLessThan(45)
  })

  it('reports whether it has heard from the host recently', () => {
    const c = new TickClock(60)
    expect(c.fresh(0)).toBe(false)
    c.observe(10, 500)
    expect(c.fresh(560)).toBe(true)
    expect(c.fresh(800)).toBe(false)
  })

  it('starts over when ticks go backwards (a new match)', () => {
    const c = new TickClock(60)
    c.observe(500, 1000)
    c.observe(0, 2000)
    expect(c.timeOf(0)).toBeCloseTo(2000, 0)
  })

  // Regression: an out-of-order (stale) state used to reset the clock.
  it('ignores a slightly older state arriving late (out of order)', () => {
    const c = new TickClock(60)
    for (let t = 100; t <= 130; t++) c.observe(t, 1000 + (t - 100) * (1000 / 60))
    const before = c.timeOf(131)
    c.observe(127, 1000 + 31 * (1000 / 60) + 40)
    expect(c.timeOf(131)).toBeCloseTo(before, 3)
  })

  // Regression: a state arriving out of order looked like a new match and
  // reset the game's move sequence, so the host then ignored every move.
  describe('runChange', () => {
    it('a small step back is a stale state, not a new match', () => {
      expect(runChange(1000, 997)).toBe('stale')
    })
    it('ticks restarting near zero, or a big jump back, is a new match', () => {
      expect(runChange(1000, 0)).toBe('new')
      expect(runChange(5000, 200)).toBe('new')
      expect(runChange(-Infinity, 0)).toBe('new')
    })
    it('moving forward is just the next state', () => {
      expect(runChange(1000, 1001)).toBe('next')
      expect(runChange(1000, 1000)).toBe('next')
    })
  })
})
