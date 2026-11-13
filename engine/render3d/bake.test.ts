import { describe, expect, it } from 'vitest'
import { areaUv, groundShadowPoint, shadeOf, type BakeArea } from './bake'

describe('static light bake (pure parts)', () => {
  it('a point casts onto the ground away from the sun, by height / sun elevation', () => {
    // Sun up-left at 45°: a point 2 m up lands 2 m to the right.
    expect(groundShadowPoint({ x: 0, y: 2, z: 0 }, { x: -1, y: 1, z: 0 })).toEqual({ x: 2, z: 0 })
    // On the ground: its own spot. Straight-down sun: no offset.
    expect(groundShadowPoint({ x: 3, y: 0, z: -1 }, { x: -1, y: 1, z: 2 })).toEqual({ x: 3, z: -1 })
    expect(groundShadowPoint({ x: 1, y: 5, z: 1 }, { x: 0, y: 1, z: 0 })).toEqual({ x: 1, z: 1 })
  })

  it('world x / z map to the bake texture (0..1 across the area; v along +z)', () => {
    const area: BakeArea = { minX: -10, maxX: 10, minZ: -5, maxZ: 15 }
    expect(areaUv(-10, -5, area)).toEqual([0, 0])
    expect(areaUv(10, 15, area)).toEqual([1, 1])
    expect(areaUv(0, 5, area)).toEqual([0.5, 0.5])
  })

  it('shade: 1 in open sun, darker in shadow and near occluders, never below the floor', () => {
    const o = { shadow: 0.6, ao: 0.3 }
    expect(shadeOf(1, 1, o)).toBe(1) // lit, nothing above
    expect(shadeOf(0, 1, o)).toBeCloseTo(0.4) // full shadow: the sky light remains
    expect(shadeOf(1, 0, o)).toBeCloseTo(0.7) // right under an occluder
    expect(shadeOf(0, 0, o)).toBeCloseTo(0.28)
    expect(shadeOf(0.5, 0.5, o)).toBeCloseTo(0.7 * 0.85)
  })
})
