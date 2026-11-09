import { describe, expect, it } from 'vitest'
import { lerpV, viewOf } from './world'

describe('view mapping', () => {
  it('keeps side 0 as is', () => {
    expect(viewOf(0).flip).toBe(1)
  })

  it('mirrors (x, z) → (−x, −z) for side 1, so the local player is always near', () => {
    const { flip } = viewOf(1)
    const p = { x: 1.2, z: 4.5 }
    expect([p.x * flip, p.z * flip]).toEqual([-1.2, -4.5])
  })
})

describe('lerpV', () => {
  const a = { x: 1, y: 2, z: 3 }
  const b = { x: -3, y: 6, z: 0 }

  it('hits both endpoints and the midpoint', () => {
    const out = { x: 0, y: 0, z: 0 }
    expect(lerpV(a, b, 0, out)).toEqual(a)
    expect(lerpV(a, b, 1, out)).toEqual(b)
    expect(lerpV(a, b, 0.5, out)).toEqual({ x: -1, y: 4, z: 1.5 })
  })

  it('writes into out and returns it (no allocation)', () => {
    const out = { x: 0, y: 0, z: 0 }
    expect(lerpV(a, b, 0.25, out)).toBe(out)
  })
})
