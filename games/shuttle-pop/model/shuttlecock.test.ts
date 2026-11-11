import { describe, expect, it } from 'vitest'
import { Color, Vector3 } from 'three'
import { CORK_TIP, SHUTTLECOCK, SHUTTLECOCK_COLORS, shuttlecockGeometry } from './shuttlecock'

const { body, outline } = shuttlecockGeometry()
body.computeBoundingBox()
outline.computeBoundingBox()

describe('shuttlecockGeometry', () => {
  it('is two light geometries: a vertex-coloured body and a position-only outline', () => {
    expect(body.getAttribute('color')).toBeDefined()
    expect(outline.getAttribute('color')).toBeUndefined()
    const tris = body.getAttribute('position').count / 3
    expect(tris).toBeGreaterThan(50)
    expect(tris).toBeLessThan(400)
    expect(outline.getAttribute('position').count / 3).toBeLessThan(400)
  })

  it('spans cork tip (+Y) to the skirt end (−Y), ~2.6× a real shuttle (visibility first)', () => {
    const b = body.boundingBox!
    expect(b.max.y).toBeCloseTo(CORK_TIP, 6)
    expect(b.min.y).toBeCloseTo(-SHUTTLECOCK.length, 6)
    expect(b.max.x).toBeCloseTo(SHUTTLECOCK.skirtEnd, 3)
    const length = b.max.y - b.min.y
    expect(length).toBeGreaterThan(0.09 * 1.8)
    expect(length).toBeLessThan(0.09 * 5)
  })

  it('the cork is at the leading (+Y) end: every cork-coloured vertex sits above the junction', () => {
    const pos = body.getAttribute('position')
    const col = body.getAttribute('color')
    const cork = new Color(SHUTTLECOCK_COLORS.cork)
    let n = 0
    for (let i = 0; i < pos.count; i++) {
      if (
        Math.abs(col.getX(i) - cork.r) + Math.abs(col.getY(i) - cork.g) + Math.abs(col.getZ(i) - cork.b) >
        1e-6
      )
        continue
      n++
      expect(pos.getY(i)).toBeGreaterThan(0)
    }
    expect(n).toBeGreaterThan(0)
  })

  it('faces outward on the outside (front faces visible), the skirt inside faces in', () => {
    const pos = body.getAttribute('position')
    const [a, b, c, n, mid] = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()]
    let out = 0
    let inward = 0
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i)
      b.fromBufferAttribute(pos, i + 1)
      c.fromBufferAttribute(pos, i + 2)
      n.subVectors(c, b).cross(a.clone().sub(b))
      if (n.lengthSq() < 1e-14) continue // lathe's degenerate tip triangles
      mid.copy(a).add(b).add(c).divideScalar(3)
      // Radial (side) faces only.
      const radial = n.x * mid.x + n.z * mid.z
      if (Math.abs(radial) < 1e-9) continue
      if (radial > 0) out++
      else inward++
    }
    // Outer cork + outer skirt out; inner skirt in (about a third of the side faces).
    expect(out).toBeGreaterThan(inward)
    expect(inward).toBeGreaterThan(0)
  })

  it('reads at least as big as the old ball (0.08 m sphere + 1.35× rim) end-on and side-on', () => {
    const oldBall = 2 * 0.08 * 1.35
    const o = outline.boundingBox!
    expect(o.max.x - o.min.x).toBeGreaterThanOrEqual(oldBall) // end-on: the skirt mouth
    expect(o.max.y - o.min.y).toBeGreaterThanOrEqual(oldBall) // side-on: cork tip → mouth
  })

  it('the outline encloses the body', () => {
    expect(outline.boundingBox!.containsBox(body.boundingBox!)).toBe(true)
    expect(outline.boundingBox!.max.y).toBeGreaterThan(body.boundingBox!.max.y)
  })
})
