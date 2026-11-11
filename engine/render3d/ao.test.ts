import { Mesh, MeshBasicMaterial, Object3D, Sprite } from 'three'
import { describe, expect, it } from 'vitest'
import { aoSkips } from './ao'

describe('aoSkips', () => {
  it('leaves sprites and non-depth-writing meshes out of the AO depth pass', () => {
    expect(aoSkips(new Sprite())).toBe(true)
    expect(aoSkips(new Mesh(undefined, new MeshBasicMaterial({ transparent: true, depthWrite: false })))).toBe(true)
    expect(aoSkips(new Mesh(undefined, [new MeshBasicMaterial(), new MeshBasicMaterial({ depthWrite: false })]))).toBe(true)
  })
  it('keeps solid meshes (also faded ones that still write depth) and plain groups', () => {
    expect(aoSkips(new Mesh(undefined, new MeshBasicMaterial()))).toBe(false)
    expect(aoSkips(new Mesh(undefined, new MeshBasicMaterial({ transparent: true, opacity: 0.5 })))).toBe(false)
    expect(aoSkips(new Object3D())).toBe(false)
  })
})
