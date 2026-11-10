import { describe, expect, it } from 'vitest'
import { COURT, DRAG, DT, G, isIn, predictLanding, solveLaunch, stepShuttle, type Flight } from './physics'

const copy = (f: Flight): Flight => ({ pos: { ...f.pos }, vel: { ...f.vel } })

describe('shuttle physics', () => {
  it('falls under gravity with drag', () => {
    const f: Flight = { pos: { x: 0, y: 300, z: 0 }, vel: { x: 0, y: 0, z: 0 } }
    for (let i = 0; i < 180; i++) stepShuttle(f)
    expect(Math.abs(Math.abs(f.vel.y) - Math.sqrt(G / DRAG))).toBeLessThan(0.2)
  })

  it('predictLanding matches stepping and does not mutate', () => {
    const f: Flight = { pos: { x: -1, y: 1.5, z: -4 }, vel: { x: 2, y: 9, z: 7 } }
    const snap = copy(f)
    const p = predictLanding(f)
    expect(f).toEqual(snap)
    const g = copy(f)
    let prev = copy(g)
    let ticks = 0
    while (g.pos.y > 0 && ticks < 600) {
      prev = copy(g)
      stepShuttle(g)
      ticks++
    }
    expect(p.ticks).toBe(ticks)
    // landing is interpolated to y = 0 between the last two ticks
    const k = prev.pos.y / (prev.pos.y - g.pos.y)
    expect(p.pos.x).toBeCloseTo(prev.pos.x + (g.pos.x - prev.pos.x) * k, 6)
    expect(p.pos.z).toBeCloseTo(prev.pos.z + (g.pos.z - prev.pos.z) * k, 6)
    expect(p.pos.y).toBe(0)
    expect(DT).toBeCloseTo(1 / 60, 12)
  })

  it('solveLaunch hits target', () => {
    const from = { x: 0, y: 1.2, z: -5 }
    const v = solveLaunch(from, { x: 1, z: 4 }, 45, 40)
    const p = predictLanding({ pos: from, vel: v })
    expect(Math.hypot(p.pos.x - 1, p.pos.z - 4)).toBeLessThan(0.05)
    expect(p.netHit).toBe(false)
  })

  it('solveLaunch returns max speed when unreachable', () => {
    const v = solveLaunch({ x: 0, y: 1.2, z: -5 }, { x: 0, z: 6 }, 45, 5)
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(5, 6)
  })

  it('net hit kills horizontal speed, shuttle lands on hitter side', () => {
    const f: Flight = { pos: { x: 0, y: 1.5, z: -3 }, vel: { x: 0, y: 0, z: 10 } }
    const p = predictLanding(f)
    expect(p.netHit).toBe(true)
    expect(p.pos.z).toBeLessThan(0)
  })

  it('clears the net when above it', () => {
    const f: Flight = { pos: { x: 0, y: 3, z: -3 }, vel: { x: 0, y: 0, z: 8 } }
    const p = predictLanding(f)
    expect(p.netHit).toBe(false)
    expect(p.pos.z).toBeGreaterThan(0)
  })

  it('lines are in', () => {
    expect(isIn({ x: COURT.halfWidth, z: COURT.halfLen }, 1)).toBe(true)
    expect(isIn({ x: 2.6, z: 3 }, 1)).toBe(false)
    expect(isIn({ x: 0, z: -1 }, 1)).toBe(false)
    expect(isIn({ x: 0, z: -1 }, 0)).toBe(true)
    expect(isIn({ x: 0, z: 6.71 }, 1)).toBe(false)
  })
})
