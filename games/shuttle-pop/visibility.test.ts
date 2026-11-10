import { describe, expect, it } from 'vitest'
import { fadeTarget, fadeTo, haloPixels, occlusion, VIS, type ScreenRect } from './visibility'

const R: ScreenRect = { x0: -0.1, y0: -0.5, x1: 0.1, y1: 0.2, depth: 6 }

describe('shuttle visibility math', () => {
  it('inside + behind = 1; outside past the edge = 0; soft in between', () => {
    expect(occlusion(0, 0, 7, R)).toBe(1)
    expect(occlusion(0.3, 0, 7, R)).toBe(0)
    expect(occlusion(0.1 + VIS.edge / 2, 0, 7, R)).toBeCloseTo(0.5)
  })
  it('a shuttle clearly in front of the player is never occluded', () => {
    expect(occlusion(0, 0, 6 - VIS.front - 0.01, R)).toBe(0)
    expect(occlusion(0, 0, 6 - VIS.front + 0.01, R)).toBe(1)
  })
  it('uses Chebyshev distance on the vertical axis and corners too', () => {
    expect(occlusion(0, 0.2 + VIS.edge / 2, 7, R)).toBeCloseTo(0.5)
    expect(occlusion(0.1 + VIS.edge / 2, 0.2 + VIS.edge / 4, 7, R)).toBeCloseTo(0.5)
    expect(occlusion(0, 0, 7, R, 0)).toBe(1)
    expect(occlusion(0.11, 0, 7, R, 0)).toBe(0)
  })
  it('fade only in a rally; floor at minOpacity', () => {
    expect(fadeTarget(1, true)).toBeCloseTo(VIS.minOpacity)
    expect(fadeTarget(1, false)).toBe(1)
    expect(fadeTarget(0, true)).toBe(1)
  })
  it('fadeTo: fast in, slower out, same result at 30 and 60 fps', () => {
    let a = 1
    let b = 1
    for (let i = 0; i < 6; i++) a = fadeTo(a, 0.4, 1 / 30)
    for (let i = 0; i < 12; i++) b = fadeTo(b, 0.4, 1 / 60)
    expect(a).toBeCloseTo(b, 6)
    expect(fadeTo(0.4, 1, 0.1) - 0.4).toBeLessThan(1 - fadeTo(1, 0.4, 0.1))
    expect(fadeTo(0.5, 0.5, 0.016)).toBe(0.5)
  })
  it('halo texture: opaque-ish centre, transparent rim', () => {
    const p = haloPixels(16)
    expect(p.length).toBe(16 * 16 * 4)
    expect(p[(8 * 16 + 8) * 4 + 3]).toBeGreaterThan(200)
    expect(p[3]).toBe(0)
    expect(p[0]).toBe(255)
  })
})
