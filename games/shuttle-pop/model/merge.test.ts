import { describe, expect, it } from 'vitest'
import { BoxGeometry, Color, SphereGeometry, Vector3 } from 'three'
import { mergeParts, part, place } from './merge'

const lin = (hex: number) => new Color().setHex(hex)

describe('mergeParts', () => {
  it('keeps every vertex and triangle, each part painted over its own contiguous range', () => {
    const box = new BoxGeometry(1, 1, 1)
    const ball = new SphereGeometry(0.5, 8, 6)
    const g = mergeParts([part(box, 0xff0000), part(ball, 0x00ff00, { p: [2, 0, 0] })])
    const nBox = box.getAttribute('position').count
    const nBall = ball.getAttribute('position').count
    expect(g.getAttribute('position').count).toBe(nBox + nBall)
    expect(g.getIndex()!.count).toBe(box.getIndex()!.count + ball.getIndex()!.count)
    const col = g.getAttribute('color')
    expect(col.getX(0)).toBeCloseTo(lin(0xff0000).r)
    expect(col.getY(nBox - 1)).toBeCloseTo(0)
    expect(col.getY(nBox)).toBeCloseTo(lin(0x00ff00).g)
    // The second part's indices point into its own range.
    const idx = g.getIndex()!
    for (let i = box.getIndex()!.count; i < idx.count; i++) expect(idx.getX(i)).toBeGreaterThanOrEqual(nBox)
    expect(g.getAttribute('position').getX(nBox)).toBeGreaterThan(1)
  })

  it('paint functions colour by placed position (hard bands)', () => {
    const g = mergeParts([part(new BoxGeometry(1, 2, 1), (_x, y) => (y > 0 ? 0xffffff : 0x000000))])
    const P = g.getAttribute('position')
    const C = g.getAttribute('color')
    for (let i = 0; i < P.count; i++) expect(C.getX(i)).toBe(P.getY(i) > 0 ? 1 : 0)
  })

  it('a mirrored part keeps its faces pointing outward (winding flipped back)', () => {
    const g = mergeParts([part(new BoxGeometry(1, 1, 1), 0xffffff, { s: [-1, 1, 1] })])
    const P = g.getAttribute('position')
    const I = g.getIndex()!
    const a = new Vector3()
    const b = new Vector3()
    const c = new Vector3()
    for (let t = 0; t < I.count; t += 3) {
      a.fromBufferAttribute(P, I.getX(t))
      b.fromBufferAttribute(P, I.getX(t + 1))
      c.fromBufferAttribute(P, I.getX(t + 2))
      const n = b.clone().sub(a).cross(c.clone().sub(a))
      const centre = a.clone().add(b).add(c).divideScalar(3)
      expect(n.dot(centre)).toBeGreaterThan(0)
    }
  })

  it('place() moves a built sub-assembly', () => {
    const parts = place([part(new BoxGeometry(1, 1, 1), 0xffffff)], { p: [0, 5, 0] })
    parts[0].geo.computeBoundingBox()
    expect(parts[0].geo.boundingBox!.min.y).toBeCloseTo(4.5)
  })
})
