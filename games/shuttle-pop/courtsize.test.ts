import { describe, expect, it } from 'vitest'
import { COURT_SCALE, courtDims, courtScale, courtSizeOf, spreadXZ } from './courtsize'
import { COURT } from './physics'

describe('court size', () => {
  it('normal is today’s court exactly', () => expect(courtDims('normal')).toEqual({ ...COURT }))
  it('large / xl scale length, width and short line; net height stays', () => {
    for (const s of ['large', 'xl'] as const) {
      const d = courtDims(s),
        k = COURT_SCALE[s]
      expect(d.halfLen).toBeCloseTo(COURT.halfLen * k, 9)
      expect(d.halfWidth).toBeCloseTo(COURT.halfWidth * k, 9)
      expect(d.shortLine).toBeCloseTo(COURT.shortLine * k, 9)
      expect(d.netH).toBe(COURT.netH)
    }
  })
  it('multiplies on top of another base (doubles)', () =>
    expect(courtDims('xl', { ...COURT, halfWidth: 3.05 }).halfWidth).toBeCloseTo(3.05 * 1.3, 9))
  it('returns a fresh object', () => expect(courtDims('normal')).not.toBe(courtDims('normal')))
  it('unknown values are normal', () => {
    for (const v of [undefined, '', 'huge', 'XL', 1.3, null, {}]) expect(courtSizeOf(v)).toBe('normal')
    expect(courtSizeOf('xl')).toBe('xl')
    expect(courtSizeOf('large')).toBe('large')
  })
  it('courtScale / spreadXZ', () => {
    expect(courtScale(courtDims('large'))).toEqual({ x: expect.closeTo(1.15, 9), z: expect.closeTo(1.15, 9) })
    expect(courtScale(COURT)).toEqual({ x: 1, z: 1 })
    expect(spreadXZ({ x: 2, z: -3, y: 1 }, { x: 1.5, z: 2 })).toEqual({ x: 3, z: -6, y: 1 })
  })
})
