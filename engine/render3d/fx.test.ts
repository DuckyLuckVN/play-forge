import { MeshBasicMaterial, Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { Chunks3D } from './fx'

const pos = (c: Chunks3D, i: number) => {
  const m = new Matrix4()
  c.mesh.getMatrixAt(i, m)
  return new Vector3().setFromMatrixPosition(m)
}

describe('Chunks3D', () => {
  it('flies, never sinks below the floor, then shrinks away', () => {
    const c = new Chunks3D(new MeshBasicMaterial(), 8)
    c.burst(0, 0.5, 0, { count: 8, life: 1, size: 0.4 })
    for (let f = 0; f < 30; f++) {
      c.update(1 / 60)
      for (let i = 0; i < 8; i++) expect(pos(c, i).y).toBeGreaterThanOrEqual(0)
    }
    for (let f = 0; f < 120; f++) c.update(1 / 60)
    const m = new Matrix4()
    c.mesh.getMatrixAt(0, m)
    expect(new Vector3().setFromMatrixScale(m).x).toBeCloseTo(0)
  })

  it('rides the world scroll', () => {
    const c = new Chunks3D(new MeshBasicMaterial(), 1)
    c.burst(0, 0.5, 0, { count: 1, speed: 0 })
    c.update(0.1, 2)
    expect(pos(c, 0).z).toBeCloseTo(2)
  })

  it('reuses the oldest chunks when full', () => {
    const c = new Chunks3D(new MeshBasicMaterial(), 4)
    c.burst(0, 0, 0, { count: 10 })
    expect(c.mesh.count).toBe(4)
  })
})
