import { describe, expect, it } from 'vitest'
import { Mesh, type MeshBasicMaterial } from 'three'
import { CHARGE_LOOK, ChargeRing, cooldownFill, COOLDOWN_LOOK, warmth } from './chargering'

const mats = (r: ChargeRing) =>
  r.root.children.map((c) => ((c as Mesh).material as MeshBasicMaterial).opacity)

describe('rings at the feet', () => {
  it('the charge ring keeps its look; the cooldown ring sits just outside it, lavender over a navy track (reads on the teal court), no pulse', () => {
    expect(CHARGE_LOOK).toMatchObject({ inner: 0.44, outer: 0.56, pulse: true })
    expect(CHARGE_LOOK.low.getHexString()).toBe('7ef0c8')
    expect(COOLDOWN_LOOK).toMatchObject({ inner: 0.6, outer: 0.74, pulse: false })
    expect(COOLDOWN_LOOK.inner).toBeGreaterThan(CHARGE_LOOK.outer)
    expect(COOLDOWN_LOOK.low.getHexString()).toBe('b9a6ff')
    expect(COOLDOWN_LOOK.full.getHexString()).toBe('fff1a8')
    expect(COOLDOWN_LOOK.track).toMatchObject({ opacity: 0.5, width: 0.14 })
    expect(COOLDOWN_LOOK.track?.color.getHexString()).toBe('181a38')
  })

  it('the cooldown ring refills as the cooldown runs out (like the buttons), hidden once ready', () => {
    expect(cooldownFill(1)).toBe(0)
    expect(cooldownFill(0.25)).toBeCloseTo(0.75)
    expect(cooldownFill(0.01)).toBeCloseTo(0.99)
    expect(cooldownFill(0)).toBe(-1)
  })

  it('a full cooldown ring never throbs; < 0 hides it (after the ready pop); alpha fades fill and track together', () => {
    const r = new ChargeRing(COOLDOWN_LOOK)
    r.update(1, 2, 3, 0.03)
    expect(r.root.visible).toBe(true)
    expect(r.root.scale.x).toBe(1)
    expect(r.root.position.x).toBe(2)
    const full = mats(r)
    r.update(1, 2, 3, 0.03, 0.5)
    mats(r).forEach((o, i) => expect(o).toBeCloseTo(full[i] * 0.5))
    // < 0: the ready pop, then hidden once it has played.
    r.update(-1, 0, 0, 0.03)
    r.update(-1, 0, 0, 1)
    expect(r.root.visible).toBe(false)
    const c = new ChargeRing()
    c.update(1, 0, 0, 0.03)
    expect(c.root.scale.x).toBeGreaterThan(1)
  })

  it('warms only over the last quarter: lavender until 75%, cream at full', () => {
    expect(warmth(0.5, 0.75)).toBe(0)
    expect(warmth(0.875, 0.75)).toBeCloseTo(0.5)
    expect(warmth(1, 0.75)).toBe(1)
    // The charge ring (no warmFrom) still blends across its whole fill.
    expect(warmth(0.4, 0)).toBe(0.4)
    const r = new ChargeRing(COOLDOWN_LOOK)
    const fill = r.root.children[1] as Mesh
    r.update(0.5, 0, 0, 0)
    expect((fill.material as MeshBasicMaterial).color.getHexString()).toBe('b9a6ff')
  })

  it('pops when ready (grows and fades ~0.3 s, then hides); hide() and the charge ring never pop', () => {
    const r = new ChargeRing(COOLDOWN_LOOK)
    r.update(0.9, 1, 2, 10)
    r.update(-1, 1, 2, 10.1)
    expect(r.root.visible).toBe(true)
    r.update(-1, 1, 2, 10.25)
    expect(r.root.scale.x).toBeGreaterThan(1.2)
    expect(r.root.position.x).toBe(1)
    r.update(-1, 1, 2, 10.5)
    expect(r.root.visible).toBe(false)
    r.update(0.9, 1, 2, 11)
    r.hide()
    r.update(-1, 1, 2, 11.05)
    expect(r.root.visible).toBe(false)
    const c = new ChargeRing()
    c.update(0.5, 0, 0, 1)
    c.update(-1, 0, 0, 1.05)
    expect(c.root.visible).toBe(false)
  })
})
