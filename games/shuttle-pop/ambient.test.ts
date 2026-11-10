import { describe, expect, it } from 'vitest'
import { FLOCK, flockDir, flockProgress, PETALS, PetalField, type PetalPose } from './ambient'

describe('bird flock schedule', () => {
  it('waits, crosses in FLOCK.cross seconds, then rests until the next period', () => {
    expect(flockProgress(0)).toBe(-1)
    expect(flockProgress(FLOCK.start)).toBe(0)
    expect(flockProgress(FLOCK.start + FLOCK.cross / 2)).toBeCloseTo(0.5)
    expect(flockProgress(FLOCK.start + FLOCK.cross + 0.5)).toBe(-1)
    expect(flockProgress(FLOCK.start + FLOCK.period + 1)).toBeCloseTo(1 / FLOCK.cross)
  })

  it('alternates direction each crossing', () => {
    expect(flockDir(FLOCK.start + 1)).toBe(1)
    expect(flockDir(FLOCK.start + FLOCK.period + 1)).toBe(-1)
    expect(flockDir(FLOCK.start + 2 * FLOCK.period + 1)).toBe(1)
  })
})

describe('petal field', () => {
  const pose = (): PetalPose => ({ x: 0, y: 0, z: 0, s: 0, rx: 0, rz: 0 })

  it('keeps every petal inside its side bands (plus sway) over a long run', () => {
    const f = new PetalField(PETALS.count)
    const p = pose()
    for (let t = 0; t < 120; t += 0.37)
      for (let i = 0; i < f.count; i++) {
        f.at(i, t, p)
        // Side bands only: never over the court.
        expect(Math.abs(p.x)).toBeGreaterThanOrEqual(PETALS.inner - PETALS.sway)
        expect(Math.abs(p.x)).toBeLessThanOrEqual(PETALS.outer + PETALS.sway)
        expect(p.y).toBeGreaterThanOrEqual(PETALS.y[0])
        expect(p.y).toBeLessThanOrEqual(PETALS.y[1])
        expect(p.z).toBeGreaterThanOrEqual(PETALS.z[0] - PETALS.sway)
        expect(p.z).toBeLessThanOrEqual(PETALS.z[1] + PETALS.sway)
        expect(p.s).toBeGreaterThanOrEqual(0)
        expect(p.s).toBeLessThanOrEqual(1)
      }
  })

  it('drifts smoothly: any jump (a wrap) happens while the petal is shrunk to nothing', () => {
    const f = new PetalField(PETALS.count)
    const a = pose()
    const b = pose()
    let wraps = 0
    for (let t = 0; t < 60; t += 1 / 60)
      for (let i = 0; i < f.count; i++) {
        f.at(i, t, a)
        f.at(i, t + 1 / 60, b)
        const step = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
        if (step > 0.2) {
          wraps++
          expect(Math.max(a.s, b.s)).toBeLessThan(0.2)
        } else expect(step).toBeLessThan(0.05)
      }
    expect(wraps).toBeGreaterThan(0)
  })

  it('depends only on time (same pose at 30 or 144 fps)', () => {
    const f = new PetalField(PETALS.count)
    expect(f.at(3, 2.5, pose())).toEqual(new PetalField(PETALS.count).at(3, 2.5, pose()))
  })
})
