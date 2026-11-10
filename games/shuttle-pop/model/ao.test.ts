import { describe, expect, it } from 'vitest'
import { BoxGeometry, SphereGeometry, type BufferGeometry } from 'three'
import { bakeAO } from './ao'

const occ = (g: BufferGeometry) => ({
  pos: g.getAttribute('position').array,
  index: g.getIndex()!.array,
  nor: g.getAttribute('normal').array,
})

describe('baked AO', () => {
  it('an open convex shape stays (nearly) unoccluded', () => {
    const ao = bakeAO(occ(new SphereGeometry(0.2, 24, 16)))
    expect(Math.min(...ao)).toBeGreaterThan(0.97)
  })

  it('a lid just above a sphere darkens its top, not its bottom', () => {
    const s = new SphereGeometry(0.2, 24, 16)
    const lid = new BoxGeometry(0.5, 0.01, 0.5).translate(0, 0.225, 0)
    const ao = bakeAO(occ(s), [occ(lid)])
    const P = s.getAttribute('position')
    let top = 1
    let bottom = 0
    for (let i = 0; i < P.count; i++) {
      if (P.getY(i) > 0.19) top = Math.min(top, ao[i])
      if (P.getY(i) < -0.19) bottom = Math.max(bottom, ao[i])
    }
    expect(top).toBeLessThan(0.75)
    expect(bottom).toBeGreaterThan(0.97)
    for (const f of ao) expect(f).toBeGreaterThanOrEqual(0.5)
  })

  it('empty mesh → empty result', () => {
    expect(bakeAO({ pos: [], index: [], nor: [] })).toHaveLength(0)
  })
})
