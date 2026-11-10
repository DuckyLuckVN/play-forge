import { describe, expect, it } from 'vitest'
import { kneeDrop, legAngles, legOut, type LegIn } from './legs'
import { LEG } from './model/dims'

const input = (o: Partial<LegIn> = {}): LegIn => ({
  cycle: 0,
  amp: 0,
  along: 0,
  across: 0,
  tuck: 0,
  splay: 0,
  bend: 0,
  ...o,
})

describe('legAngles', () => {
  it('standing: straight legs, no drop', () => {
    const o = legAngles(input(), legOut())
    for (const v of [...o.hipX, ...o.knee, ...o.hipZ]) expect(v).toBeCloseTo(0, 12)
    expect(o.drop).toBe(0)
  })

  it('knees only fold backward, in every stride phase / tuck / crouch', () => {
    const o = legOut()
    for (let ph = 0; ph < 1; ph += 0.05)
      for (const bend of [0, 0.2, 0.4])
        for (const tuck of [0, 0.5]) {
          legAngles(input({ cycle: Math.sin(ph * Math.PI * 2), amp: 0.6, along: 1, bend, tuck }), o)
          expect(o.knee[0]).toBeGreaterThanOrEqual(0)
          expect(o.knee[1]).toBeGreaterThanOrEqual(0)
        }
  })

  it('running: the back-swinging leg bends its knee, the front one stays straight', () => {
    const o = legAngles(input({ cycle: 1, amp: 0.6, along: 1 }), legOut())
    expect(o.hipX[0]).toBeGreaterThan(0)
    expect(o.knee[0]).toBeGreaterThan(0.5)
    expect(o.knee[1]).toBe(0)
  })

  it('crouch: the rig drops exactly enough for the bent leg to reach the ground', () => {
    const o = legAngles(input({ bend: 0.38 }), legOut())
    expect(o.drop).toBeGreaterThan(0)
    const reach = LEG.thigh * Math.cos(o.hipX[0]) + LEG.shin * Math.cos(o.hipX[0] + o.knee[0])
    expect(reach + o.drop).toBeCloseTo(LEG.thigh + LEG.shin, 9)
    expect(kneeDrop(0, 0)).toBe(0)
  })

  it('splay opens the legs symmetrically; a side shuffle rolls both the same way', () => {
    const o = legAngles(input({ splay: 0.2 }), legOut())
    expect(o.hipZ[0]).toBeCloseTo(-0.2)
    expect(o.hipZ[1]).toBeCloseTo(0.2)
    legAngles(input({ cycle: 1, amp: 0.5, across: 1 }), o)
    expect(o.hipZ[0]).toBeCloseTo(o.hipZ[1])
  })
})
