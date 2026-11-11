import { describe, expect, it } from 'vitest'
import { Mesh, type MeshBasicMaterial } from 'three'
import { CHARGE_LOOK, ChargeRing, COOLDOWN_LOOK } from './chargering'

const mats = (r: ChargeRing) =>
  r.root.children.map((c) => ((c as Mesh).material as MeshBasicMaterial).opacity)

describe('rings at the feet', () => {
  it('the charge ring keeps its look; the cooldown ring sits just outside it, cool blue, no pulse', () => {
    expect(CHARGE_LOOK).toMatchObject({ inner: 0.44, outer: 0.56, pulse: true })
    expect(CHARGE_LOOK.low.getHexString()).toBe('7ef0c8')
    expect(COOLDOWN_LOOK).toMatchObject({ inner: 0.6, outer: 0.72, pulse: false })
    expect(COOLDOWN_LOOK.inner).toBeGreaterThan(CHARGE_LOOK.outer)
    for (const c of [COOLDOWN_LOOK.low, COOLDOWN_LOOK.high, COOLDOWN_LOOK.full])
      expect(c.getHexString()).toBe('5cc8ff')
  })

  it('a full cooldown ring never throbs; < 0 hides it; alpha fades fill and track together', () => {
    const r = new ChargeRing(COOLDOWN_LOOK)
    r.update(1, 2, 3, 0.03)
    expect(r.root.visible).toBe(true)
    expect(r.root.scale.x).toBe(1)
    expect(r.root.position.x).toBe(2)
    const full = mats(r)
    r.update(1, 2, 3, 0.03, 0.5)
    mats(r).forEach((o, i) => expect(o).toBeCloseTo(full[i] * 0.5))
    r.update(-1, 0, 0, 0)
    expect(r.root.visible).toBe(false)
    const c = new ChargeRing()
    c.update(1, 0, 0, 0.03)
    expect(c.root.scale.x).toBeGreaterThan(1)
  })
})
