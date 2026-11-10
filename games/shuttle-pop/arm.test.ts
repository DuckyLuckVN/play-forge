import { describe, expect, it } from 'vitest'
import {
  basePose,
  CH,
  CONTACT_T,
  DRIVE,
  FOLLOW_T,
  N_CH,
  READY,
  REST,
  settleCurve,
  SMASH_KEYS,
  STRIKE,
  STRIKE_END,
  strikeValue,
  sweepProgress,
  swingPose,
  TIER,
  upper,
  type BaseIn,
  type SwingIn,
} from './arm'
import { SWING, SwingDriver } from './moves'

const still = (): BaseIn => ({ run: 0, stride: 0, ready: 0, happy: 0, sad: 0, wave: 0 })
const swingAt = (strike: number, load = 1, prev = -1): SwingIn => ({ load, strike, prev, coil: 0 })
const maxDiff = (a: Float64Array, b: Float64Array) => {
  let m = 0
  for (let c = 0; c < N_CH; c++) m = Math.max(m, Math.abs(a[c] - b[c]))
  return m
}

describe('basePose', () => {
  it('idle and running keep a soft elbow bend (never a straight stick arm)', () => {
    const o = upper()
    const b = still()
    for (const run of [0, 0.5, 1])
      for (let st = 0; st < 1; st += 0.05) {
        b.run = run
        b.stride = st
        basePose(b, o)
        expect(o[CH.rElbow]).toBeGreaterThan(0.5)
        expect(o[CH.lElbow]).toBeGreaterThan(0.5)
      }
  })

  it('runs a counter-swing: the arms swing opposite ways through the stride', () => {
    const b = still()
    b.run = 1
    const a = upper()
    const c = upper()
    b.stride = 0.25
    basePose(b, a)
    b.stride = 0.75
    basePose(b, c)
    expect(Math.sign(a[CH.rPitch] - c[CH.rPitch])).toBe(-Math.sign(a[CH.lPitch] - c[CH.lPitch]))
  })
})

describe('ready stance (badminton)', () => {
  it('moving in the stance keeps the racket up and the off hand raised: no jogging counter-swing', () => {
    const b = still()
    b.ready = 1
    b.run = 1
    const o = upper()
    for (let st = 0; st < 1; st += 0.02) {
      b.stride = st
      basePose(b, o)
      for (let c = 0; c < N_CH; c++) expect(Math.abs(o[c] - READY[c])).toBeLessThan(0.1)
    }
  })

  it('racket raised in front, elbow bent; off hand raised forward', () => {
    // pitch: 0 hanging, −π/2 forward.
    expect(READY[CH.rPitch]).toBeLessThan(-0.9)
    expect(READY[CH.rElbow]).toBeGreaterThan(0.6)
    expect(READY[CH.lPitch]).toBeLessThan(-0.6)
  })
})

describe('strike curve', () => {
  it('is continuous from the wind-up through the settle (no jumps), plain and smash', () => {
    const base = basePose(still(), upper())
    const a = upper()
    const b = upper()
    for (const smash of [0, 0.5, 1]) {
      let worst = 0
      // Wind-up (strike < 0) → release → strike → settle → past the end, in 0.5 ms steps.
      for (let t = -0.05; t < STRIKE_END + 0.05; t += 0.0005) {
        const s0 = t < 0 ? swingAt(-1, 1 + t / 0.05) : swingAt(t)
        const t1 = t + 0.0005
        const s1 = t1 < 0 ? swingAt(-1, 1 + t1 / 0.05) : swingAt(t1)
        swingPose(base, s0, smash, a)
        swingPose(base, s1, smash, b)
        worst = Math.max(worst, maxDiff(a, b))
      }
      // The fastest joint (wrist snap) moves well under 0.1 rad per 0.5 ms.
      expect(worst).toBeLessThan(0.1)
    }
  })

  it('overlapping action: sweep speed peaks run torso → shoulder → elbow → wrist, each later', () => {
    const h = 0.0005
    const peakAt = (k: number) => {
      let best = 0
      let at = 0
      for (let t = 0; t < FOLLOW_T; t += h) {
        const v = sweepProgress(k, t + h) - sweepProgress(k, t)
        if (v > best) {
          best = v
          at = t
        }
      }
      return { at, speed: best }
    }
    const tiers = [0, 1, 2, 3].map(peakAt)
    for (let k = 1; k < 4; k++) {
      expect(tiers[k].at).toBeGreaterThan(tiers[k - 1].at + 0.005)
      // Distal joints whip faster.
      expect(tiers[k].speed).toBeGreaterThan(tiers[k - 1].speed)
    }
    // Each joint starts STRIKE.lag after the one before (the brief's ~30–50 ms overlap, chibi-quick).
    expect(STRIKE.lag).toBeGreaterThanOrEqual(0.02)
    expect(STRIKE.lag).toBeLessThanOrEqual(0.05)
  })

  it('the racket (wrist) meets the contact pose at CONTACT_T, at its fastest', () => {
    const c = CH.rWrist
    const k = DRIVE
    expect(strikeValue(c, CONTACT_T, k.load[c], k.contact[c], k.follow[c], REST[c])).toBeCloseTo(
      k.contact[c],
      9,
    )
    expect(sweepProgress(TIER[c], CONTACT_T)).toBeCloseTo(1, 9)
    const speed = (t: number) => sweepProgress(3, t + 1e-4) - sweepProgress(3, t)
    expect(speed(CONTACT_T)).toBeGreaterThan(speed(CONTACT_T - 0.02))
    expect(speed(CONTACT_T)).toBeGreaterThan(speed(CONTACT_T + 0.02))
    // Press → contact at normal speed (a whiff, or a contact later than this) stays snappy.
    expect(SWING.load + CONTACT_T).toBeLessThan(0.22)
  })

  it('settles back onto the base pose with a small spring overshoot, exactly at the end', () => {
    expect(settleCurve(0)).toBe(0)
    expect(settleCurve(STRIKE.settle)).toBe(1)
    let peak = 0
    for (let v = 0; v < STRIKE.settle; v += 0.001) peak = Math.max(peak, settleCurve(v))
    expect(peak).toBeGreaterThan(1.03)
    expect(peak).toBeLessThan(1.3)
    const base = basePose(still(), upper())
    const o = upper()
    for (const smash of [0, 1]) {
      swingPose(base, swingAt(STRIKE_END), smash, o)
      expect(maxDiff(o, base)).toBe(0)
    }
  })

  it('load (0..1) alone blends the base into the loaded pose and holds it (charge hook)', () => {
    const base = basePose(still(), upper())
    const o = upper()
    swingPose(base, swingAt(-1, 0), 0, o)
    expect(maxDiff(o, base)).toBe(0)
    swingPose(base, swingAt(-1, 1), 0, o)
    expect(maxDiff(o, DRIVE.load)).toBeLessThan(1e-12)
    swingPose(base, swingAt(-1, 1), 1, o)
    expect(maxDiff(o, SMASH_KEYS.load)).toBeLessThan(1e-12)
    // Release starts exactly where the hold was.
    const held = Float64Array.from(o)
    swingPose(base, swingAt(0), 1, o)
    expect(maxDiff(o, held)).toBeLessThan(1e-12)
  })

  it('a new wind-up over a strike still settling starts from where that strike is (no pop)', () => {
    const base = basePose(still(), upper())
    const a = upper()
    const b = upper()
    const t = FOLLOW_T + 0.05
    swingPose(base, swingAt(t), 0, a)
    swingPose(base, swingAt(-1, 0, t), 0, b)
    expect(maxDiff(a, b)).toBeLessThan(1e-12)
  })

  it('every channel belongs to a joint tier', () => {
    expect(TIER).toHaveLength(N_CH)
    expect(TIER[CH.twist]).toBe(0)
    expect(TIER[CH.rPitch]).toBe(1)
    expect(TIER[CH.rElbow]).toBe(2)
    expect(TIER[CH.rWrist]).toBe(3)
  })
})

describe('SwingDriver + swingPose', () => {
  it('gives the same timeline at 30, 60 and 144 fps (dt-independent)', () => {
    const sample = (fps: number) => {
      const d = new SwingDriver()
      d.press()
      const out: number[] = []
      const dt = 1 / fps
      // Sample every 1/6 s (a whole number of frames at each rate... 30 and 60; 144 lands within a frame).
      for (let f = 1; f <= fps * 0.7; f++) {
        d.update(dt)
        if (f % (fps / 6) === 0) out.push(d.load, d.strike)
      }
      return out
    }
    const a = sample(30)
    const b = sample(60)
    expect(b).toHaveLength(a.length)
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i], 9)
    // 144 fps: strike time = age − release at any frame.
    const d = new SwingDriver()
    d.press()
    for (let f = 0; f < 36; f++) d.update(1 / 144)
    expect(d.strike).toBeCloseTo(36 / 144 - SWING.load, 9)
  })

  it('drives a full swing back to the exact base pose', () => {
    const d = new SwingDriver()
    const base = basePose(still(), upper())
    const o = upper()
    d.press()
    for (let f = 0; f < 120; f++) d.update(1 / 60)
    swingPose(base, d, 0, o)
    expect(maxDiff(o, base)).toBe(0)
    expect(d.load).toBe(0)
    expect(d.strike).toBe(-1)
  })
})
