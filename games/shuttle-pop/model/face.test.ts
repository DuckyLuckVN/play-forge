import { describe, expect, it } from 'vitest'
import { PRESETS } from '../presets'
import { blinkAt, faceGeometry, faceLayout, faceMix, MORPHS, surfaceOf, type Expr } from './face'

const look = PRESETS[0].look
const EXPRS: Expr[] = ['neutral', ...MORPHS]

describe('chibi face', () => {
  it('every expression has the same topology and colours (morph-safe); only positions move', () => {
    const base = faceLayout(look, 'neutral')
    for (const e of EXPRS) {
      const f = faceLayout(look, e)
      expect(f.pos.length).toBe(base.pos.length)
      expect(f.idx).toEqual(base.idx)
      expect(f.col).toEqual(base.col)
      expect(f.pos.every(Number.isFinite)).toBe(true)
    }
    expect(faceLayout(look, 'happy').pos).not.toEqual(base.pos)
  })

  it('geometry carries one morph target per MORPHS entry', () => {
    const g = faceGeometry(look)
    expect(g.morphAttributes.position).toHaveLength(MORPHS.length)
    for (const m of g.morphAttributes.position!) expect(m.count).toBe(g.getAttribute('position').count)
  })

  it('decals sit just outside the head surface (every face kind), facing the camera side (+z)', () => {
    for (const p of PRESETS) {
      const surf = surfaceOf(p.look)
      const { pos } = faceLayout(p.look, 'effort')
      for (let i = 0; i < pos.length; i += 3) {
        const lift = pos[i + 2] - surf(pos[i], pos[i + 1], 0)
        expect(lift, p.name).toBeGreaterThan(0.002)
        expect(lift, p.name).toBeLessThan(0.025)
        expect(pos[i + 2], p.name).toBeGreaterThan(0.15)
      }
    }
  })

  it('toy faces (humans) blend: the blush fades to alpha 0 at its rim, the rest is opaque', () => {
    const { col } = faceLayout(look, 'neutral')
    const alphas = col.filter((_, i) => i % 4 === 3)
    expect(alphas.some((a) => a === 0)).toBe(true)
    // Only the blush fades (dot eyes leave few other vertices, so a lower share).
    expect(alphas.filter((a) => a === 1).length).toBeGreaterThan(alphas.length * 0.5)
    // Non-toy faces stay fully opaque.
    const cat = faceLayout(PRESETS[4].look, 'neutral').col.filter((_, i) => i % 4 === 3)
    expect(cat.every((a) => a === 1)).toBe(true)
  })

  it('faceMix: influences in 0..1, mood weights never sum past 1, continuous as moods blend', () => {
    const out = [0, 0, 0, 0]
    let prev: number[] | null = null
    for (let u = 0; u <= 1.0001; u += 0.01) {
      faceMix(1 - u, u, u * 0.8, 1, out)
      expect(out[0] + out[1] + out[2]).toBeLessThanOrEqual(1 + 1e-9)
      for (const w of out) expect(w).toBeGreaterThanOrEqual(0)
      if (prev) for (let k = 0; k < 4; k++) expect(Math.abs(out[k] - prev[k])).toBeLessThan(0.05)
      prev = [...out]
    }
    // No blink on top of the happy (already closed) eyes.
    expect(faceMix(1, 0, 0, 1, out)[3]).toBe(0)
    expect(faceMix(0, 0, 0, 1, out)[3]).toBe(1)
    expect(faceMix(-1, 2, 0, 0, out)).toEqual([0, 1, 0, 0])
  })

  it('blinks are short and periodic, offset by the seed', () => {
    let shut = 0
    for (let t = 0; t < 34; t += 0.01) if (blinkAt(t, 0) > 0.5) shut += 0.01
    expect(shut).toBeGreaterThan(0.3)
    expect(shut).toBeLessThan(1)
    expect(blinkAt(0.07, 0)).toBeCloseTo(1, 1)
    expect(blinkAt(0.07, 1)).toBe(0)
  })
})
