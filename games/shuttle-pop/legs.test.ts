import { describe, expect, it } from 'vitest'
import { footX, kneeDrop, legAngles, legOut, type LegIn } from './legs'
import { GAIT } from './locomotion'
import { LEG } from './model/dims'

const input = (o: Partial<LegIn> = {}): LegIn => ({
  cycle: 0,
  amp: 0,
  along: 0,
  across: 0,
  tuck: 0,
  splay: 0,
  bend: 0,
  phase: 0,
  dir: 1,
  lunge: 0,
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

  it('splay opens the legs symmetrically', () => {
    const o = legAngles(input({ splay: 0.2 }), legOut())
    expect(o.hipZ[0]).toBeCloseTo(-0.2)
    expect(o.hipZ[1]).toBeCloseTo(0.2)
  })

  /** Foot gap (left foot x − right foot x) through a full shuffle cycle. */
  const gaps = (o: Partial<LegIn>) => {
    const out = legOut()
    const g: number[] = []
    for (let ph = 0; ph < 1; ph += 0.01) {
      legAngles(input({ amp: GAIT.amp, across: 1, phase: ph, cycle: Math.sin(ph * Math.PI * 2), ...o }), out)
      g.push(footX(1, out) - footX(0, out))
    }
    return g
  }

  it('side shuffle (chassé): the feet open and close but never cross, either way, any stance width', () => {
    for (const dir of [1, -1])
      for (const splay of [0, 0.16])
        for (const bend of [0, 0.3]) {
          const g = gaps({ dir, splay, bend })
          expect(Math.min(...g)).toBeGreaterThan(0.05)
          expect(Math.max(...g) - Math.min(...g)).toBeGreaterThan(0.03)
        }
  })

  it('side shuffle: the lead foot (toward the move) steps out first, the trail foot follows', () => {
    const out = legOut()
    // A quarter cycle in, moving +x: the left (lead, +x) foot is out, the right still in place.
    legAngles(input({ amp: GAIT.amp, across: 1, dir: 1, phase: 0.25 }), out)
    expect(out.hipZ[1]).toBeGreaterThan(0.1)
    legAngles(input({ amp: GAIT.amp, across: 1, dir: -1, phase: 0.25 }), out)
    expect(out.hipZ[0]).toBeLessThan(-0.1)
  })

  it('side shuffle: a little hop (lift ≥ 0) each cycle; none when stepping forward or standing', () => {
    const out = legOut()
    let peak = 0
    for (let ph = 0; ph < 1; ph += 0.01) {
      legAngles(input({ amp: GAIT.amp, across: 1, phase: ph }), out)
      expect(out.lift).toBeGreaterThanOrEqual(0)
      peak = Math.max(peak, out.lift)
      legAngles(input({ amp: GAIT.amp, along: 1, phase: ph }), out)
      expect(out.lift).toBe(0)
    }
    expect(peak).toBeGreaterThan(0.01)
    expect(legAngles(input(), out).lift).toBe(0)
  })

  it('lunge: racket-side (right) knee bent in front, back leg extended, the lower foot on the ground', () => {
    const o = legAngles(input({ lunge: 1, bend: 0.2 }), legOut())
    expect(o.hipX[0]).toBeLessThan(-0.8)
    expect(o.knee[0]).toBeGreaterThan(1.2)
    expect(o.hipX[1]).toBeGreaterThan(0.3)
    expect(o.knee[1]).toBeLessThan(0.3)
    const reach = (k: number) => LEG.thigh * Math.cos(o.hipX[k]) + LEG.shin * Math.cos(o.hipX[k] + o.knee[k])
    expect(Math.max(reach(0), reach(1)) + o.drop).toBeCloseTo(LEG.thigh + LEG.shin, 9)
  })

  it('lunge blends in continuously (no joint jumps)', () => {
    const a = legOut()
    const b = legOut()
    for (let l = 0; l < 1; l += 0.01) {
      legAngles(input({ lunge: l, bend: 0.2, splay: 0.14 }), a)
      legAngles(input({ lunge: l + 0.01, bend: 0.2, splay: 0.14 }), b)
      for (let k = 0; k < 2; k++) {
        expect(Math.abs(a.hipX[k] - b.hipX[k])).toBeLessThan(0.03)
        expect(Math.abs(a.knee[k] - b.knee[k])).toBeLessThan(0.03)
        expect(Math.abs(a.hipZ[k] - b.hipZ[k])).toBeLessThan(0.03)
      }
      expect(Math.abs(a.drop - b.drop)).toBeLessThan(0.003)
    }
  })
})
