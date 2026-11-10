import { describe, expect, it } from 'vitest'
import {
  meshTile,
  NetRipple,
  RIPPLE,
  RIPPLE_GLSL,
  rippleDisplace,
  rippleOffset,
  sagAt,
  wobbleWeight,
} from './net'

describe('NetRipple', () => {
  it('rests flat until the shuttle hits the net', () => {
    const r = new NetRipple()
    r.update(0.5)
    expect(r.env).toBe(0)
  })

  it('a kick pushes away from the hitter, then dies out', () => {
    const r = new NetRipple()
    r.kick(1.2, 1)
    expect(r.hitX).toBe(1.2)
    r.update(0.02)
    expect(rippleOffset(r.env, r.phase, 0)).toBeGreaterThan(0)
    const back = new NetRipple()
    back.kick(0, -1)
    back.update(0.02)
    expect(rippleOffset(back.env, back.phase, 0)).toBeLessThan(0)
    r.update(RIPPLE.life)
    expect(r.env).toBe(0)
  })

  it('is frame-rate independent: 30 fps and 144 fps land on the same displacement', () => {
    const run = (fps: number) => {
      const r = new NetRipple()
      r.kick(0.5, 1)
      const n = Math.round(0.5 * fps)
      for (let i = 0; i < n; i++) r.update(1 / fps)
      return rippleOffset(r.env, r.phase, 0.3)
    }
    expect(run(30)).toBeCloseTo(run(144), 6)
    expect(run(60)).toBeCloseTo(run(144), 6)
  })

  it('a second hit restarts the wobble without a smaller jolt than what is left', () => {
    const r = new NetRipple()
    r.kick(0, 1)
    r.update(0.05)
    const left = Math.abs(r.env)
    r.kick(0.4, 1)
    expect(Math.abs(r.env)).toBeGreaterThanOrEqual(left)
    expect(r.phase).toBe(0)
  })

  it('reset rests it', () => {
    const r = new NetRipple()
    r.kick(0, 1)
    r.update(0.01)
    r.reset()
    expect(r.env).toBe(0)
  })
})

describe('rippleOffset', () => {
  it('fades with distance from the hit', () => {
    // Same phase, envelope; the wave's crest moves out, so compare the falloff envelope directly.
    const near = Math.abs(rippleOffset(1, Math.PI / 2, 0))
    const far = Math.abs(rippleOffset(1, Math.PI / 2 + RIPPLE.k * 2, 2))
    expect(far).toBeLessThan(near)
  })
})

describe('net shape', () => {
  it('sags most mid-span, none at the posts', () => {
    expect(sagAt(0)).toBe(0)
    expect(sagAt(1)).toBe(0)
    expect(sagAt(0.5)).toBe(1)
  })

  it('wobble weight: posts fixed, the tape stiffer than the bottom', () => {
    expect(wobbleWeight(0, 1)).toBeCloseTo(0)
    expect(wobbleWeight(1, 1)).toBeCloseTo(0)
    expect(wobbleWeight(0.5, 0)).toBeLessThan(wobbleWeight(0.5, 1))
    expect(wobbleWeight(0.5, 1)).toBeCloseTo(1)
  })
})

describe('meshTile', () => {
  it('opaque thread pixels on a clear tile, one colour everywhere (no dark fringe in mipmaps)', () => {
    const size = 16
    const px = meshTile(size, 2)
    expect(px.length).toBe(size * size * 4)
    const at = (x: number, y: number) => px[(y * size + x) * 4 + 3]
    expect(at(0, 0)).toBeGreaterThan(0)
    expect(at(1, 8)).toBeGreaterThan(0)
    expect(at(8, 1)).toBeGreaterThan(0)
    expect(at(8, 8)).toBe(0)
    for (let i = 0; i < px.length; i += 4) {
      expect(px[i]).toBe(px[0])
      expect(px[i + 1]).toBe(px[1])
      expect(px[i + 2]).toBe(px[2])
    }
  })

  it('threads cover a small share, so the far net stays see-through once mipmapped', () => {
    const size = 32
    const px = meshTile(size, 2)
    let a = 0
    for (let i = 3; i < px.length; i += 4) a += px[i]
    expect(a / (size * size * 255)).toBeLessThan(0.3)
  })
})

describe('shader parity', () => {
  /** RIPPLE_GLSL run as JS (it only uses float maths: abs, sin, exp). */
  const glsl = new Function(
    'position',
    'aWobble',
    'uNetEnv',
    'uNetPhase',
    'uNetHitX',
    'const { abs, sin, exp } = Math; const transformed = { x: 0, y: 0, z: 0 };' +
      RIPPLE_GLSL.replace(/\bfloat\b/g, 'let') +
      'return transformed;',
  ) as (p: { x: number }, w: number, env: number, phase: number, hitX: number) => { y: number; z: number }

  it('the vertex shader moves a vertex exactly as rippleDisplace says', () => {
    const out = { y: 0, z: 0 }
    for (const [x, w, env, phase, hitX] of [
      [0.3, 1, 0.12, 0.5, 0],
      [-2, 0.4, -0.08, 3.1, 1.2],
      [1.5, 0.9, 0.05, 7.7, -0.6],
    ]) {
      const got = glsl({ x }, w, env, phase, hitX)
      rippleDisplace(env, phase, x - hitX, w, out)
      // The shader's constants are written to 4 decimals.
      expect(got.z).toBeCloseTo(out.z, 4)
      expect(got.y).toBeCloseTo(out.y, 4)
    }
  })

  it('swinging either way lifts (never drops) the net', () => {
    const out = { y: 0, z: 0 }
    rippleDisplace(-0.1, 1, 0, 1, out)
    expect(out.z).toBeLessThan(0)
    expect(out.y).toBeGreaterThan(0)
  })
})
