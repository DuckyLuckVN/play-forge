import { describe, expect, it } from 'vitest'
import { modelOf } from './model/model'
import { PRESETS } from './presets'
import { PRESETS as SIM_PRESETS } from './sim'
import { VI } from './i18n'

describe('preset table', () => {
  it('ids match the index and the sim preset count', () => {
    expect(SIM_PRESETS).toBe(PRESETS.length)
    PRESETS.forEach((p, i) => expect(p.id).toBe(i))
  })

  it('every preset has a complete look, a distinct style and a VI name', () => {
    const styles = new Set<string>()
    for (const p of PRESETS) {
      const l = p.look
      for (const k of ['head', 'ears', 'muzzle', 'style', 'face', 'hands', 'feet', 'tail'] as const)
        expect(typeof l[k]).toBe('string')
      for (const v of Object.values(l.kit)) expect(v).not.toBeUndefined()
      styles.add(l.style)
      expect(VI[p.name]).toBeTruthy()
    }
    expect(styles.size).toBe(PRESETS.length)
  })

  it('every look builds every bone with geometry (all builder keys resolve)', () => {
    for (const p of PRESETS) {
      const m = modelOf(p.look)
      for (const g of [
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
      ])
        expect(g.getAttribute('position').count).toBeGreaterThan(0)
      expect(modelOf(p.look)).toBe(m)
    }
  })
})
