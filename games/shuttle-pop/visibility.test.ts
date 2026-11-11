import { describe, expect, it } from 'vitest'
import {
  bodyBox,
  fadeTarget,
  fadeTo,
  haloOpacity,
  haloPixels,
  occlusion,
  stepFades,
  VIS,
  type ScreenRect,
} from './visibility'

const R: ScreenRect = { x0: -0.1, y0: -0.5, x1: 0.1, y1: 0.2, depth: 6 }

describe('shuttle visibility math', () => {
  it('bodyBox lifts with the jump', () => {
    const b = bodyBox(0, 0.75, 1.6, 1)
    expect(b.y0).toBeCloseTo(0.9)
    expect(b.y1).toBeCloseTo(2.35)
    expect(b.mid).toBeCloseTo(1.625)
    expect(bodyBox(0, 0, 1.6, 1).y1).toBeCloseTo(1.6)
    const s = bodyBox(0, 0, 1.6, 1.2)
    expect(s.y0).toBeCloseTo(VIS.body.bottom * 1.2)
    expect(s.y1).toBeCloseTo(1.6 * 1.2)
    expect(bodyBox(0.5, 0.75, 1.6, 1.2).y1).toBeCloseTo(0.5 + 0.75 + 1.6 * 1.2)
  })

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
  it('fades in any phase (a serve too); floor at minOpacity', () => {
    expect(fadeTarget(1)).toBeCloseTo(VIS.minOpacity)
    expect(fadeTarget(0)).toBe(1)
    expect(fadeTarget(0.5)).toBeCloseTo(1 - 0.5 * (1 - VIS.minOpacity))
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
  it('stepFades: any covering player fades (opponent / server too), two at once, the rest recover', () => {
    // [local, opponent, third]: opponent fully covers (e.g. its own serve), local half covers, third clear.
    const fades = [1, 1, 0.5]
    for (let i = 0; i < 120; i++) stepFades([0.5, 1, 0], fades, 1 / 60)
    expect(fades[1]).toBeCloseTo(VIS.minOpacity, 3)
    expect(fades[0]).toBeCloseTo(fadeTarget(0.5), 3)
    expect(fades[2]).toBeGreaterThan(0.99)
    // Negative dt = no change; a missing occlusion entry counts as clear.
    const held = [0.6]
    stepFades([1], held, -1)
    expect(held[0]).toBe(0.6)
    const short = [0.6, 0.6]
    stepFades([1], short, 1)
    expect(short[1]).toBeGreaterThan(0.95)
  })
  it('halo: never while held (serve), never on a player (in front or behind), full when clear', () => {
    expect(haloOpacity(0, true)).toBe(0)
    expect(haloOpacity(1, false)).toBe(0)
    expect(haloOpacity(0, false)).toBe(VIS.halo.opacity)
    expect(haloOpacity(0.5, false)).toBeCloseTo(VIS.halo.opacity / 2)
    // A shuttle in FRONT of a player still overlaps its box (depth ignored for the halo).
    expect(occlusion(0, 0, Infinity, R)).toBe(1)
  })
  it('halo texture: opaque-ish centre, transparent rim', () => {
    const p = haloPixels(16)
    expect(p.length).toBe(16 * 16 * 4)
    expect(p[(8 * 16 + 8) * 4 + 3]).toBeGreaterThan(200)
    expect(p[3]).toBe(0)
    expect(p[0]).toBe(255)
  })
})
