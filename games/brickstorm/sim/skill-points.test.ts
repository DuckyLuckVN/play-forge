// Collected skill orbs bank skill points; the player opens the pick screen when they want
// (between shots), and closing it keeps the point and the same offers.
import { describe, expect, it } from 'vitest'
import { closePicks, openPicks, pickBoost } from './boosts'
import { gainXp } from './damage'
import { fire, openPickOrAim } from './run'
import { empty } from './testing'

function withPoints(n: number) {
  const s = empty()
  s.pendingPicks = n
  openPickOrAim(s)
  return s
}

describe('skill points', () => {
  it('a level-up drops an orb instead of a point (the point comes when a ball collects it)', () => {
    const s = empty()
    s.phase = 'aim'
    gainXp(s, 1e4)
    openPickOrAim(s)
    expect(s.pendingPicks).toBe(0)
    expect(s.orbsDue).toBeGreaterThan(0)
    expect(s.phase).toBe('aim')
  })

  it('opening shows offers; picking spends one point; with points left it stays open with new offers', () => {
    const s = withPoints(2)
    expect(openPicks(s)).toBe(true)
    expect(s.phase).toBe('pick')
    const first = [...s.choices]
    pickBoost(s, first[0])
    expect(s.pendingPicks).toBe(1)
    expect(s.phase).toBe('pick')
    pickBoost(s, s.choices[0])
    expect(s.pendingPicks).toBe(0)
    expect(s.phase).toBe('aim')
  })

  it('closing keeps the point and the very same offers (no free reroll)', () => {
    const s = withPoints(1)
    openPicks(s)
    const offers = [...s.choices]
    closePicks(s)
    expect(s.phase).toBe('aim')
    expect(s.pendingPicks).toBe(1)
    openPicks(s)
    expect(s.choices).toEqual(offers)
  })

  it('cannot open with no points, or mid-volley', () => {
    const s = withPoints(0)
    expect(openPicks(s)).toBe(false)
    s.pendingPicks = 1
    fire(s, Math.PI / 2)
    expect(s.phase).toBe('volley')
    expect(openPicks(s)).toBe(false)
  })

  it('a shot cannot be fired from the pick screen', () => {
    const s = withPoints(1)
    openPicks(s)
    fire(s, Math.PI / 2)
    expect(s.phase).toBe('pick')
  })
})
