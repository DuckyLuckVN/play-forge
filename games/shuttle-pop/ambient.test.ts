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

  it('depends only on time (same pose at 30 or 144 fps)', () => {
    const f = new PetalField(PETALS.count)
    expect(f.at(3, 2.5, pose())).toEqual(new PetalField(PETALS.count).at(3, 2.5, pose()))
  })
})
