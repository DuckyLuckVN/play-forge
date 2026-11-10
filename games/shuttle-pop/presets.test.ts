import { describe, expect, it } from 'vitest'
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from 'three'
import { BODIES, FEET, HANDS } from './model/body'
import { EXTRAS, extraMeshes, type ExtraSpec } from './model/extras'
import { EARS, HEADS, MUZZLES, STYLES } from './model/head'
import { RIG, TALL_RIG } from './model/dims'
import { legless, rigOf } from './model/look'
import { modelOf, type ModelGeos } from './model/model'
import { AVAILABLE_IDS, AVAILABLE_PRESETS, isAvailable, nextAvailable, PRESETS } from './presets'
import { PRESETS as SIM_PRESETS } from './sim'
import { VI } from './i18n'

/** Every bone geometry of a model (thigh / shin once each: the rig shows them twice). */
function geosOf(m: ModelGeos): BufferGeometry[] {
  return [
    m.torso,
    m.hips,
    m.head,
    m.face,
    m.upperArm,
    m.thigh,
    m.shin,
    m.racket,
    ...m.foreArm,
    ...m.hand,
    ...m.extras.flatMap((e) => [e.geo, ...(e.glow ? [e.glow] : [])]),
  ]
}
const tris = (g: BufferGeometry) => (g.getIndex()?.count ?? 0) / 3

describe('preset table', () => {
  it('ids match the index and the sim preset count', () => {
    expect(SIM_PRESETS).toBe(PRESETS.length)
    PRESETS.forEach((p, i) => expect(p.id).toBe(i))
  })

  it('every preset has a VI name and every look key resolves in its builder table', () => {
    for (const p of PRESETS) {
      const l = p.look
      expect(VI[p.name], p.name).toBeTruthy()
      expect(HEADS[l.head], `${p.name} head`).toBeTypeOf('function')
      expect(EARS[l.ears], `${p.name} ears`).toBeTypeOf('function')
      expect(MUZZLES[l.muzzle], `${p.name} muzzle`).toBeTypeOf('function')
      expect(STYLES[l.style], `${p.name} style`).toBeTypeOf('function')
      expect(HANDS[l.hands], `${p.name} hands`).toBeTypeOf('function')
      expect(FEET[l.feet], `${p.name} feet`).toBeTypeOf('function')
      expect(BODIES[l.body], `${p.name} body`).toBeDefined()
      for (const k of l.extras)
        expect((EXTRAS as Record<string, ExtraSpec>)[k], `${p.name} ${k}`).toBeDefined()
      for (const v of Object.values(l.kit ?? {})) expect(v).not.toBeUndefined()
    }
  })

  it('every look builds every bone with geometry (legless looks: no legs), cached by preset id', () => {
    for (const p of PRESETS) {
      const m = modelOf(p)
      const noLegs = legless(p.look)
      for (const g of geosOf(m)) {
        const n = g.getAttribute('position').count
        if (noLegs && (g === m.thigh || g === m.shin)) expect(n).toBe(0)
        else expect(n, p.name).toBeGreaterThan(0)
      }
      expect(modelOf({ id: p.id, look: { ...p.look } })).toBe(m)
    }
  })

  it('every rig stands on the ground (thigh + shin = hip height); humans stand on the taller rig', () => {
    for (const p of PRESETS) {
      const r = rigOf(p.look)
      expect(r.thigh + r.shin, p.name).toBeCloseTo(r.hipY, 9)
      // The torso keeps its layout relative to the hips (the torso builders are hip-relative); the head
      // sits on the shoulders, never sunk below the collar.
      expect(r.shoulderY - r.hipY).toBeCloseTo(RIG.shoulderY - RIG.hipY, 9)
      expect(r.headY - r.shoulderY).toBeGreaterThan(0.38)
      expect(r).toBe(p.look.body === 'human' ? TALL_RIG : RIG)
    }
  })

  it('looks with the same racket colours share one racket geometry', () => {
    const a = PRESETS[0]
    const b = { id: 1000, look: { ...PRESETS[1].look, accent: a.look.accent, grip: a.look.grip } }
    expect(modelOf(b).racket).toBe(modelOf(a).racket)
  })

  it('every look stays inside the triangle / extra-mesh budget', () => {
    for (const p of PRESETS) {
      const m = modelOf(p)
      // Legs and arms are drawn twice.
      const total =
        geosOf(m).reduce((a, g) => a + tris(g), 0) + tris(m.thigh) + tris(m.shin) + tris(m.upperArm)
      expect(total, p.name).toBeLessThan(BUDGET.tris)
      expect(tris(m.head), `${p.name} head`).toBeLessThan(BUDGET.head)
      const extras = m.extras.reduce((a, e) => a + extraMeshes(e.spec), 0)
      expect(extras, `${p.name} extra meshes`).toBeLessThanOrEqual(BUDGET.extraMeshes)
      // The far twin also draws its outline shells (head hull + head extras' shells).
      const shells =
        tris(m.hull) + m.extras.reduce((a, e) => a + (e.hull ? tris(e.hull) * (e.spec.pair ? 2 : 1) : 0), 0)
      expect(tris(m.hull), `${p.name} hull`).toBeLessThanOrEqual(BUDGET.hull)
      expect(total + shells, `${p.name} far twin`).toBeLessThan(BUDGET.tris + BUDGET.hull)
    }
  })

  it('the low-poly twin hull still wraps the whole head (hair, hats, bows) from every direction', () => {
    const ray = new Raycaster()
    // A hair off the centre: rays exactly along the shell's seam edges slip between its triangles.
    const o = new Vector3(1e-4, 2e-4, 0)
    const d = new Vector3()
    for (const p of PRESETS) {
      const m = modelOf(p)
      const shell = new Mesh(m.hull, new MeshBasicMaterial({ side: DoubleSide }))
      const P = m.head.getAttribute('position')
      let inside = 0
      let n = 0
      for (let i = 0; i < P.count; i += 5) {
        d.fromBufferAttribute(P, i).sub(o)
        const r = d.length()
        ray.set(o, d.normalize())
        const hits = ray.intersectObject(shell)
        const out = hits.length ? hits[hits.length - 1].distance : 0
        n++
        // Every head point sits inside the hull (a hair's breadth of slack on chords between samples).
        if (out >= r - 0.006) inside++
      }
      expect(inside, p.name).toBe(n)
    }
  })
})

/**
 * Per look: triangles over every drawn bone, head mesh alone, the far twin's head outline hull (model/hull.ts),
 * extra meshes. The toy-style humans (Task 18: sculpted hair clumps, knit ribs, kit stripes, chunky sneakers,
 * pleated skirt) need ~22k, heads ~10k; draw calls, not triangles, are the budget that matters on phones (two
 * human chibis ≈ 46k triangles: ~22k each + the far twin's 1.4k hull).
 */
const BUDGET = { tris: 22500, head: 10000, hull: 1500, extraMeshes: 4 }

describe('availability flag', () => {
  it('only the four humans are available now', () => {
    expect(AVAILABLE_IDS).toEqual([0, 1, 2, 3])
    expect(AVAILABLE_PRESETS.map((p) => p.name)).toEqual(['Berry', 'Cloud', 'Sunny', 'Mint'])
    expect(PRESETS.length).toBe(12)
    expect(isAvailable(4)).toBe(false)
    expect(isAvailable(-1)).toBe(false)
  })

  it('nextAvailable cycles the available ids and skips taken ones', () => {
    expect(nextAvailable(0, () => false)).toBe(1)
    expect(nextAvailable(3, () => false)).toBe(0)
    expect(nextAvailable(0, (n) => n === 1)).toBe(2)
    expect(nextAvailable(7, (n) => n === 0)).toBe(1)
    expect(nextAvailable(2, () => true)).toBe(2)
  })

  it('a hidden look still builds on demand', () => {
    const hidden = PRESETS.find((p) => !isAvailable(p.id))!
    const m = modelOf(hidden)
    expect(m.head.getAttribute('position').count).toBeGreaterThan(0)
    expect(modelOf(hidden)).toBe(m)
  })
})
