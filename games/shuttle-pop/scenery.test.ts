// @vitest-environment jsdom
import { BufferGeometry, Group, InstancedMesh, Material, Matrix4, Mesh, Scene, Texture, Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { courtDims } from './courtsize'
import { Net } from './net'
import { COURT } from './physics'
import { Park, shadowMapSize } from './scenery'

const propsOf = (park: Park) =>
  park.root.children.find(
    (c) => c instanceof Group && c.children.length > 0 && c.children.every((m) => m instanceof InstancedMesh),
  ) as Group
const benchesOf = (park: Park) => park.root.children.find((c) => c instanceof InstancedMesh) as InstancedMesh

/** Largest |x| and |z| over every instance of `mesh`. */
function extent(mesh: InstancedMesh) {
  const m = new Matrix4()
  const p = new Vector3()
  let x = 0
  let z = 0
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m)
    p.setFromMatrixPosition(m)
    x = Math.max(x, Math.abs(p.x))
    z = Math.max(z, Math.abs(p.z))
  }
  return { x, z }
}

/** jsdom has no 2D canvas: every call on the fake context is a no-op (gradients answer addColorStop too). */
function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const noop: object = new Proxy(function () {}, { get: () => noop, apply: () => noop, set: () => true })
  return new Proxy({ canvas } as object, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : noop),
    set: () => true,
  }) as CanvasRenderingContext2D
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return fakeContext(this)
  } as never)
})
afterEach(() => vi.restoreAllMocks())

describe('Park.setCourt', () => {
  it('disposes every old prop mesh and the old wire, and keeps counts stable', () => {
    const park = new Park(new Scene())
    const geoDispose = vi.spyOn(BufferGeometry.prototype, 'dispose')
    const matDispose = vi.spyOn(Material.prototype, 'dispose')
    const before = [...propsOf(park).children] as InstancedMesh[]
    const wire = park.root.children.find((c) => c.type === 'LineSegments') as Mesh
    const oldWire = wire.geometry
    expect(before.length).toBeGreaterThan(0)
    park.setCourt(courtDims('xl'))
    for (const m of before) {
      expect(geoDispose.mock.contexts).toContain(m.geometry)
      expect(matDispose.mock.contexts).toContain(m.material)
    }
    expect(geoDispose.mock.contexts).toContain(oldWire)
    expect(wire.geometry).not.toBe(oldWire)
    park.setCourt(courtDims('normal'))
    expect(propsOf(park).children.length).toBe(before.length)
  })

  it('with the same stretch disposes nothing', () => {
    const park = new Park(new Scene())
    const geoDispose = vi.spyOn(BufferGeometry.prototype, 'dispose')
    const before = [...propsOf(park).children]
    park.setCourt(COURT)
    expect(geoDispose).not.toHaveBeenCalled()
    expect([...propsOf(park).children]).toEqual(before)
  })

  it('a doubles-width court spreads the park on x only', () => {
    const park = new Park(new Scene())
    const bench = extent(benchesOf(park))
    const props = propsOf(park).children.map((m) => extent(m as InstancedMesh))
    park.setCourt({ ...COURT, halfWidth: 3.05 })
    const wider = extent(benchesOf(park))
    expect(wider.x).toBeGreaterThan(bench.x)
    expect(wider.z).toBeCloseTo(bench.z)
    propsOf(park).children.forEach((m, i) => {
      const e = extent(m as InstancedMesh)
      expect(e.x).toBeGreaterThanOrEqual(props[i].x)
      expect(e.z).toBeCloseTo(props[i].z)
    })
    expect(propsOf(park).children.some((m, i) => extent(m as InstancedMesh).x > props[i].x)).toBe(true)
  })
})

describe('Net.dispose', () => {
  it('disposes every geometry, material and the mesh texture', () => {
    const net = new Net(COURT.halfWidth, COURT.netH, 4)
    const geos: BufferGeometry[] = []
    const mats: Material[] = []
    const texes: Texture[] = []
    net.group.traverse((o) => {
      if (!(o instanceof Mesh)) return
      geos.push(o.geometry)
      for (const m of [o.material].flat() as Material[]) {
        mats.push(m)
        const map = (m as Material & { map?: Texture | null }).map
        if (map) texes.push(map)
      }
    })
    const geoSpies = geos.map((g) => vi.spyOn(g, 'dispose'))
    const matSpies = mats.map((m) => vi.spyOn(m, 'dispose'))
    const texSpies = texes.map((t) => vi.spyOn(t, 'dispose'))
    expect(geos.length).toBeGreaterThan(0)
    expect(texSpies.length).toBeGreaterThan(0)
    net.dispose()
    for (const s of [...geoSpies, ...matSpies, ...texSpies]) expect(s).toHaveBeenCalled()
  })
})

describe('shadowMapSize', () => {
  it('a quarter of the shadow pixels on touch devices', () => {
    expect(shadowMapSize(true)).toBe(512)
    expect(shadowMapSize(false)).toBe(1024)
  })
})
