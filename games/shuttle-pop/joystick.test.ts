import { describe, expect, it } from 'vitest'
import { joystickVector, knobOffset, quantise, StickTracker } from './joystick'

const O = { x: 100, y: 200 }
const R = 50

describe('joystickVector', () => {
  it('beyond the radius → length 1', () => {
    const v = joystickVector(O, { x: 100 + 300, y: 200 }, R)
    expect(v.x).toBeCloseTo(1)
    expect(v.z).toBeCloseTo(0)
    const d = joystickVector(O, { x: 100 + 200, y: 200 - 200 }, R)
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1)
  })

  it('inside the dead zone → (0, 0)', () => {
    expect(joystickVector(O, { x: 103, y: 202 }, R)).toEqual({ x: 0, z: 0 })
    expect(joystickVector(O, O, R)).toEqual({ x: 0, z: 0 })
  })

  it('screen up = forward (z > 0), screen right = x > 0', () => {
    expect(joystickVector(O, { x: 100, y: 150 }, R).z).toBeGreaterThan(0)
    expect(joystickVector(O, { x: 100, y: 250 }, R).z).toBeLessThan(0)
    expect(joystickVector(O, { x: 150, y: 200 }, R).x).toBeGreaterThan(0)
  })

  it('ramps from 0 at the dead-zone edge to 1 at the radius (never over 1)', () => {
    const half = joystickVector(O, { x: 100, y: 200 - R * 0.575 }, R) // halfway between 0.15 and 1
    expect(half.z).toBeCloseTo(0.5)
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      for (const r of [10, 30, 50, 80, 500]) {
        const v = joystickVector(O, { x: O.x + Math.cos(a) * r, y: O.y + Math.sin(a) * r }, R)
        expect(Math.hypot(v.x, v.z)).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  })
})

describe('quantise', () => {
  it('snaps to 0.05 steps toward zero', () => {
    expect(quantise({ x: 0.33, z: -0.71 })).toEqual({ x: 0.3, z: -0.7 })
    expect(quantise({ x: 1, z: 0 })).toEqual({ x: 1, z: 0 })
    expect(quantise({ x: 0.04, z: -0.04 })).toEqual({ x: 0, z: 0 })
  })

  it('never makes a diagonal longer than 1 (overshoot stays ≤ 1)', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      const q = quantise({ x: Math.cos(a), z: Math.sin(a) })
      expect(Math.hypot(q.x, q.z)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('tiny wiggles inside a step give the same value (send-on-change stays quiet)', () => {
    expect(quantise({ x: 0.51, z: 0.2 })).toEqual(quantise({ x: 0.54, z: 0.21 }))
  })
})

describe('knobOffset', () => {
  it('follows the finger inside the radius and clamps at it', () => {
    expect(knobOffset(O, { x: 110, y: 190 }, R)).toEqual({ x: 10, y: -10 })
    const k = knobOffset(O, { x: 400, y: 200 }, R)
    expect(k.x).toBeCloseTo(R)
    expect(k.y).toBeCloseTo(0)
  })
})

describe('StickTracker', () => {
  it('the first touch owns the stick; a second finger cannot steal it', () => {
    const s = new StickTracker(R)
    expect(s.down(1, 100, 200)).toBe(true)
    expect(s.down(2, 300, 200)).toBe(false)
    expect(s.move(2, 0, 0)).toBeNull()
    const v = s.move(1, 100, 100)
    expect(v?.z).toBeCloseTo(1)
  })

  it('up / cancel of the owner frees the stick and recentres', () => {
    const s = new StickTracker(R)
    s.down(7, 100, 200)
    expect(s.up(3)).toBe(false)
    expect(s.up(7)).toBe(true)
    expect(s.active).toBe(false)
    expect(s.move(7, 0, 0)).toBeNull()
    s.down(8, 10, 10)
    s.cancel()
    expect(s.active).toBe(false)
  })
})
