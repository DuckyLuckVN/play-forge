import { describe, expect, it } from 'vitest'
import type { BufferGeometry } from 'three'
import { BODIES, FEET, HANDS } from './model/body'
import { EXTRAS, extraMeshes, type ExtraSpec } from './model/extras'
import { EARS, HEADS, MUZZLES, STYLES } from './model/head'
import { RIG, TALL_RIG } from './model/dims'
import { legless, rigOf } from './model/look'
import { modelOf, type ModelGeos } from './model/model'
import { PRESETS } from './presets'
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
    }
  })
})

/**
 * Per look: triangles over every drawn bone, head mesh alone, extra meshes. The toy-style humans (Task 18:
 * sculpted hair clumps, knit ribs, kit stripes, chunky sneakers, pleated skirt) need ~22k, heads ~10k; draw calls, not
 * triangles, are the budget that matters on phones (two chibis ≈ 45k triangles).
 */
const BUDGET = { tris: 22500, head: 10000, extraMeshes: 4 }
