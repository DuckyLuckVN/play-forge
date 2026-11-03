import { describe, expect, it } from 'vitest'
import { cameraRig, fitView, LANE_W, laneX, trackHalfWidth, worldZ, Z_SCALE } from './world'

describe('3D world mapping', () => {
  it('centres the lanes on x = 0', () => {
    expect(laneX(1, 3)).toBe(0)
    expect(laneX(0, 3)).toBe(-LANE_W)
    expect(laneX(2, 4)).toBeCloseTo(LANE_W / 2)
    expect(laneX(0, 5) + laneX(4, 5)).toBeCloseTo(0)
    expect(trackHalfWidth(3)).toBeCloseTo(1.5 * LANE_W)
  })

  it('maps sim depth forward into -z', () => {
    expect(worldZ(0)).toBeCloseTo(0)
    expect(worldZ(100)).toBeCloseTo(-100 * Z_SCALE)
    expect(worldZ(-10)).toBeGreaterThan(0)
  })

  it('fits the rift on any screen: wider view first, then pulls back', () => {
    expect(fitView(16 / 9, 60, 8, 9)).toEqual({ fov: 60, dist: 9 })
    const fits = (aspect: number) => {
      const { fov, dist } = fitView(aspect, 60, 8, 9)
      expect(fov).toBeLessThanOrEqual(80)
      expect(dist).toBeGreaterThanOrEqual(9)
      const hHalf = Math.atan(Math.tan((fov * Math.PI) / 360) * aspect)
      expect(Math.tan(hHalf) * dist).toBeGreaterThanOrEqual(8 - 1e-6)
    }
    for (const aspect of [16 / 9, 1, 3 / 4, 9 / 16, 9 / 19.5, 0.3]) fits(aspect)
  })

  it('leans the camera into a lane change and follows the ghost', () => {
    const still = cameraRig(laneX(1, 3), laneX(1, 3))
    expect(still.roll).toBe(0)
    const sliding = cameraRig(0, LANE_W)
    expect(sliding.roll).not.toBe(0)
    expect(cameraRig(2 * LANE_W, 2 * LANE_W).x).toBeGreaterThan(0)
    expect(Math.abs(cameraRig(2 * LANE_W, 2 * LANE_W).x)).toBeLessThan(2 * LANE_W)
  })
})
