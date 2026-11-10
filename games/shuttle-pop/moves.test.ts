import { describe, expect, it } from 'vitest'
import {
  celebrateSpin,
  hop,
  leapAtHit,
  leapStartAge,
  lookAround,
  SMASH,
  SWING,
  smashJump,
  SwingDriver,
  pendingDue,
} from './moves'
import { CONTACT_T, FOLLOW_T, STRIKE_END } from './arm'

describe('SwingDriver', () => {
  /** Real time of the first frame (stepping at `fps`) on which the racket has reached contact. */
  const contactAfter = (fps: number, due?: (t: number) => number | undefined) => {
    const d = new SwingDriver()
    d.press()
    let t = 0
    while (d.strike < CONTACT_T && t < 2) {
      d.update(1 / fps, due?.(t))
      t += 1 / fps
    }
    return t
  }

  it('winds up, strikes after the wind-up, settles and goes idle', () => {
    const d = new SwingDriver()
    expect(d.busy).toBe(false)
    d.press()
    expect(d.busy).toBe(true)
    d.update(SWING.load / 2)
    expect(d.load).toBeGreaterThan(0)
    expect(d.load).toBeLessThan(1)
    expect(d.strike).toBe(-1)
    d.update(SWING.load / 2 + 0.01)
    expect(d.load).toBe(1)
    expect(d.strike).toBeCloseTo(0.01, 9)
    d.update(FOLLOW_T)
    expect(d.busy).toBe(false)
    d.update(STRIKE_END)
    expect([d.load, d.strike, d.age]).toEqual([0, -1, Infinity])
  })

  it('hit already fired at press → the racket reaches its contact pose within 0.07 s', () => {
    for (const fps of [30, 60, 144]) {
      expect(contactAfter(fps, () => 0)).toBeLessThanOrEqual(0.07 + 1 / fps)
    }
    // Unknown contact (a whiff): normal speed.
    expect(contactAfter(120)).toBeGreaterThan(SWING.load + CONTACT_T - 0.01)
  })

  it('a contact due soon: the whip lands on it, at 30, 60 and 144 fps alike', () => {
    for (const lead of [0.08, 0.12]) {
      for (const fps of [30, 60, 144]) {
        // Contact lands on the frame that reaches the lead (fps only rounds it to a frame).
        const t = contactAfter(fps, (now) => lead - now)
        expect(t).toBeGreaterThanOrEqual(lead - 1e-9)
        expect(t).toBeLessThan(lead + 1 / fps + 1e-9)
      }
    }
  })

  it('holds the loaded pose so the racket meets a later contact on time, at most maxHold', () => {
    const lead = 0.3
    const t = contactAfter(120, (now) => lead - now)
    expect(t).toBeGreaterThanOrEqual(lead - 1e-9)
    expect(t).toBeLessThan(lead + 1 / 120 + 1e-9)
    const far = new SwingDriver()
    far.press()
    far.update(0.5, 5)
    expect(far.strike).toBeCloseTo(0.5 - SWING.load - SWING.maxHold, 9)
  })

  it('coils a little more the longer it holds; the coil freezes at release', () => {
    const d = new SwingDriver()
    d.press()
    d.update(SWING.load, 1)
    expect(d.coil).toBe(0)
    d.update(0.1, 1)
    expect(d.coil).toBeCloseTo(0.1, 9)
    d.update(0.3, 1)
    const c = d.coil
    d.update(0.1)
    expect(d.strike).toBeGreaterThan(0)
    expect(d.coil).toBe(c)
  })

  it('hold() keeps the (capped) loaded pose past maxHold until release()', () => {
    const d = new SwingDriver()
    d.hold(0.6)
    for (let i = 0; i < 120; i++) d.update(1 / 60)
    expect(d.strike).toBe(-1)
    expect(d.load).toBe(0.6)
    d.release()
    d.update(1 / 60)
    expect(d.strike).toBeCloseTo(1 / 60, 9)
    expect(d.load).toBe(0.6)
  })

  it('ignores presses until the racket reaches contact; a later press keeps the old strike as prev', () => {
    const d = new SwingDriver()
    d.press()
    d.update(0.02)
    d.press()
    expect(d.age).toBeCloseTo(0.02, 9)
    d.update(SWING.load)
    expect(d.strike).toBeGreaterThan(0)
    d.press()
    expect(d.strike).toBeGreaterThan(0)
    d.update(CONTACT_T)
    const strike = d.strike
    d.press()
    expect(d.prev).toBe(strike)
    expect(d.strike).toBe(-1)
    d.update(STRIKE_END)
    expect(d.prev).toBe(-1)
  })
})

describe('pendingDue', () => {
  it('seconds to my pending contact, undefined for none / the other side', () => {
    expect(pendingDue({ atTick: 106, side: 1 }, 1, 100, 60)).toBeCloseTo(0.1, 9)
    expect(pendingDue({ atTick: 106, side: 1 }, 0, 100, 60)).toBeUndefined()
    expect(pendingDue(null, 0, 100, 60)).toBeUndefined()
  })
})

describe('smashJump', () => {
  const out = { height: 0, squash: 0 }
  it('leaps from the hit, hangs, lands with a squash, then rests', () => {
    expect(smashJump(0, out).height).toBe(0)
    expect(out.squash).toBeLessThan(0) // stretched as it springs up
    expect(smashJump(SMASH.rise, out).height).toBeCloseTo(1, 6)
    expect(smashJump((SMASH.rise + SMASH.hang) / 2, out).height).toBeGreaterThan(0.9)
    expect(smashJump(SMASH.land, out).height).toBe(0)
    expect(smashJump(SMASH.land + 0.04, out).squash).toBeGreaterThan(0.1)
    expect(smashJump(SMASH.end, out)).toEqual({ height: 0, squash: 0 })
    expect(smashJump(Infinity, out)).toEqual({ height: 0, squash: 0 })
  })

  it('rises faster than it falls (snappy leap, floaty hang)', () => {
    expect(SMASH.rise).toBeLessThan(SMASH.land - SMASH.hang)
  })
})

describe('smash leap timing', () => {
  it('a pending smash schedules the leap so the rise tops out at the hit', () => {
    for (const lead of [0.05, 0.1, 0.2, 0.3]) {
      const age = leapStartAge(lead)
      // After `lead` seconds (the contact), the leap is at the top of its rise.
      expect(age + lead).toBeCloseTo(SMASH.rise, 9)
    }
    // Far ahead: waits (crouching) with a negative age, grounded until it starts.
    const out = { height: 0, squash: 0 }
    expect(smashJump(leapStartAge(0.3), out).height).toBe(0)
  })

  it('the hit keeps a leap already under way, else starts one', () => {
    expect(leapAtHit(SMASH.rise)).toBe(SMASH.rise)
    expect(leapAtHit(0.02)).toBe(0.02)
    expect(leapAtHit(Infinity)).toBe(0)
    expect(leapAtHit(SMASH.end + 1)).toBe(0)
    // Hit came sooner than scheduled (still waiting): leap now.
    expect(leapAtHit(-0.1)).toBe(0)
  })
})

describe('idle + celebration helpers', () => {
  const out = { height: 0, squash: 0 }
  it('hop: on the ground with a squash at each landing, airborne between', () => {
    expect(hop(0, out)).toEqual({ height: 0, squash: 0 })
    expect(hop(0.1 / 2.2, out).height).toBe(0)
    expect(out.squash).toBeGreaterThan(0.1)
    expect(hop(0.5 / 2.2, out).height).toBeGreaterThan(0.9)
    expect(out.squash).toBe(0)
  })

  it('celebrateSpin: every other hop is a full turn, continuous at hop boundaries', () => {
    expect(celebrateSpin(0)).toBe(0)
    const mid = celebrateSpin(1.5 / 2.2)
    expect(mid).toBeGreaterThan(1)
    expect(Math.cos(celebrateSpin(2 / 2.2 - 1e-6))).toBeCloseTo(1, 6)
    expect(celebrateSpin(2 / 2.2)).toBe(0)
  })

  it('lookAround: mostly still, occasionally a small glance, bounded', () => {
    let still = 0
    let max = 0
    for (let t = 0; t < 60; t += 0.05) {
      const l = lookAround(t, 1.3)
      if (l === 0) still++
      max = Math.max(max, Math.abs(l))
    }
    expect(still / 1200).toBeGreaterThan(0.5)
    expect(max).toBeGreaterThan(0.2)
    expect(max).toBeLessThanOrEqual(0.45)
  })
})
