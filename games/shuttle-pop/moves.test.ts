import { describe, expect, it } from 'vitest'
import { celebrateSpin, hop, lookAround, SMASH, SWING, smashJump, swingCurve, type SwingPose } from './moves'

const pose = (): SwingPose => ({ weight: 0, arm: 0, out: 0, wrist: 0, twist: 0, streak: 0 })

describe('swingCurve', () => {
  it('blends in from and back out to the base pose (weight 0 at both ends)', () => {
    expect(swingCurve(0, pose()).weight).toBe(0)
    expect(swingCurve(1, pose()).weight).toBe(0)
    expect(swingCurve(0.5, pose()).weight).toBe(1)
  })

  it('winds up behind the head (~80 ms), then strikes fast forward, then follows through', () => {
    const windupEnd = swingCurve(SWING.windup, pose())
    expect(windupEnd.arm).toBeCloseTo(SWING.armBack, 6)
    expect(SWING.windup * SWING.time).toBeGreaterThan(0.06)
    expect(SWING.windup * SWING.time).toBeLessThan(0.1)
    const strikeEnd = swingCurve(SWING.strike, pose())
    expect(strikeEnd.arm).toBeCloseTo(SWING.armFollow, 6)
    // The strike covers more angle per unit time than the wind-up.
    const upRate = Math.abs(SWING.armBack) / SWING.windup
    const strikeRate = Math.abs(SWING.armFollow - SWING.armBack) / (SWING.strike - SWING.windup)
    expect(strikeRate).toBeGreaterThan(upRate * 1.5)
  })

  it('is continuous (no pops) and streaks only around the strike', () => {
    const a = pose()
    const b = pose()
    for (let s = 0; s < 1; s += 0.005) {
      swingCurve(s, a)
      swingCurve(s + 0.005, b)
      expect(Math.abs(b.arm - a.arm)).toBeLessThan(0.3)
      expect(Math.abs(b.weight - a.weight)).toBeLessThan(0.15)
    }
    expect(swingCurve(0.05, a).streak).toBe(0)
    expect(swingCurve((SWING.windup + SWING.strike) / 2, a).streak).toBeGreaterThan(0.5)
    expect(swingCurve(0.95, a).streak).toBe(0)
  })
})

describe('smashJump', () => {
  const out = { height: 0, squash: 0 }
  it('leaps from the hit, hangs, lands with a squash, then rests', () => {
    expect(smashJump(0, out).height).toBe(0)
    expect(out.squash).toBeLessThan(0) // stretched as it springs up
    expect(smashJump(SMASH.rise, out).height).toBeCloseTo(1, 6)
    expect(smashJump((SMASH.rise + SMASH.hang) / 2, out).height).toBeGreaterThan(0.9)
    expect(smashJump(SMASH.land, out).height).toBe(0)
    expect(smashJump(SMASH.land + 0.04, out).squash).toBeGreaterThan(0.1)
    expect(smashJump(SMASH.end, out)).toEqual({ height: 0, squash: 0 })
    expect(smashJump(Infinity, out)).toEqual({ height: 0, squash: 0 })
  })

  it('rises faster than it falls (snappy leap, floaty hang)', () => {
    expect(SMASH.rise).toBeLessThan(SMASH.land - SMASH.hang)
  })
})

describe('idle + celebration helpers', () => {
  const out = { height: 0, squash: 0 }
  it('hop: on the ground with a squash at each landing, airborne between', () => {
    expect(hop(0, out)).toEqual({ height: 0, squash: 0 })
    expect(hop(0.1 / 2.2, out).height).toBe(0)
    expect(out.squash).toBeGreaterThan(0.1)
    expect(hop(0.5 / 2.2, out).height).toBeGreaterThan(0.9)
    expect(out.squash).toBe(0)
  })

  it('celebrateSpin: every other hop is a full turn, continuous at hop boundaries', () => {
    expect(celebrateSpin(0)).toBe(0)
    const mid = celebrateSpin(1.5 / 2.2)
    expect(mid).toBeGreaterThan(1)
    expect(Math.cos(celebrateSpin(2 / 2.2 - 1e-6))).toBeCloseTo(1, 6)
    expect(celebrateSpin(2 / 2.2)).toBe(0)
  })

  it('lookAround: mostly still, occasionally a small glance, bounded', () => {
    let still = 0
    let max = 0
    for (let t = 0; t < 60; t += 0.05) {
      const l = lookAround(t, 1.3)
      if (l === 0) still++
      max = Math.max(max, Math.abs(l))
    }
    expect(still / 1200).toBeGreaterThan(0.5)
    expect(max).toBeGreaterThan(0.2)
    expect(max).toBeLessThanOrEqual(0.45)
  })
})
