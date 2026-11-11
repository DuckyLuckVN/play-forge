import { describe, expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial } from 'three'
import { StunStars } from './stars'

describe('StunStars', () => {
  it('is hidden until stunned, then shows 3 stars on a 0.28 m ring around the head', () => {
    const s = new StunStars()
    expect(s.group.visible).toBe(false)
    s.update({ on: true, spin: 0 }, 1, 2, 3, 1)
    expect(s.group.visible).toBe(true)
    expect(s.group.children).toHaveLength(3)
    for (const c of s.group.children) {
      const p = c.getWorldPosition(c.position.clone())
      expect(Math.hypot(p.x - 1, p.z - 3)).toBeCloseTo(0.28, 5)
      expect(Math.abs(p.y - 2)).toBeLessThanOrEqual(0.03 + 1e-9)
    }
    s.update({ on: false, spin: 0 }, 1, 2, 3, 1)
    expect(s.group.visible).toBe(false)
  })

  it('spin turns the ring; opacity follows the owner and hides at 0', () => {
    const s = new StunStars()
    s.update({ on: true, spin: 0 }, 0, 0, 0, 1)
    const a = s.group.children[0].position.clone()
    s.update({ on: true, spin: Math.PI / 2 }, 0, 0, 0, 0.4)
    const b = s.group.children[0].position
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.1)
    expect(((s.group.children[0] as Mesh).material as MeshBasicMaterial).opacity).toBeCloseTo(0.4)
    s.update({ on: true, spin: 1 }, 0, 0, 0, 0)
    expect(s.group.visible).toBe(false)
  })

  it('a set shares one material across its stars; sets keep their own opacity', () => {
    const s = new StunStars()
    const [a, b] = s.group.children as Mesh[]
    expect(a.geometry).toBe(b.geometry)
    expect(a.material).toBe(b.material)
    const o = new StunStars()
    expect((o.group.children[0] as Mesh).geometry).toBe(a.geometry)
    s.update({ on: true, spin: 0 }, 0, 0, 0, 0.3)
    o.update({ on: true, spin: 0 }, 0, 0, 0, 1)
    expect((a.material as MeshBasicMaterial).opacity).toBeCloseTo(0.3)
    expect(((o.group.children[0] as Mesh).material as MeshBasicMaterial).opacity).toBe(1)
    s.dispose()
    o.dispose()
  })
})
