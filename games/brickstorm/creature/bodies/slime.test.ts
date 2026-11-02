import { describe, expect, it } from 'vitest'
import type { EyeStyle, Mood, Pose } from '../../hero-avatar'
import { fakeCanvas, installPath2D } from '../../test-canvas'
import { solveHands } from '../hands'
import { CREATURE_LOOKS } from '../looks'
import type { DrawKit, Frame, Rect } from '../types'
import { BODIES } from './index'
import { slime } from './slime'

installPath2D()

const POSE: Pose = {
  crouch: 0,
  lean: 0,
  sF: 0.15,
  eF: 0.35,
  sB: -0.15,
  eB: 0.35,
  tilt: 0,
  fall: 0,
  eyeOpen: 1,
  brow: 0,
  browUp: 0,
  mouthOpen: 0,
  smile: 0.35,
  blush: 0.15,
  rear: 0,
}

const frame = (patch: Partial<Frame> = {}): Frame => ({
  t: 1.3,
  still: false,
  mood: 'idle',
  moodAge: 0.1,
  pose: { ...POSE },
  eyes: 'normal',
  blink: 0,
  lookX: 1,
  lookY: 0,
  hop: 0,
  squash: 0,
  knock: 0,
  smear: 0,
  hold: null,
  holding: false,
  fidget: 0,
  ...patch,
})

const look = CREATURE_LOOKS.baron!

const kitFor = (f: Frame) => {
  const m = slime.metrics(look, f)
  const calls: string[] = []
  const kit: DrawKit = {
    metrics: m,
    hands: solveHands(m, slime.pose?.(look, f) ?? f.pose, f.hold, f.holding),
    backHand: () => calls.push('back'),
    frontHand: () => calls.push('front'),
    hat: () => calls.push('hat'),
    emblem: () => calls.push('emblem'),
  }
  return { kit, calls }
}

const MOODS: Mood[] = [
  'idle',
  'aim',
  'throw',
  'watch',
  'cheer',
  'pump',
  'wow',
  'scared',
  'worried',
  'hurt',
  'heal',
  'cast',
  'ko',
  'revive',
  'sad',
]
const EYES: EyeStyle[] = ['normal', 'happy', 'squeeze', 'wide', 'xx']

/** Distance from a point to a rectangle (0 inside). */
const toBox = (p: { x: number; y: number }, b: Rect) =>
  Math.hypot(Math.max(b.x - p.x, 0, p.x - (b.x + b.w)), Math.max(b.y - p.y, 0, p.y - (b.y + b.h)))

describe('slime body (Goldie)', () => {
  it('is registered, and baron is a gold slime that flips a coin', () => {
    expect(BODIES.slime).toBe(slime)
    expect(look).toEqual({
      body: 'slime',
      variant: 'gold',
      main: '#fcc419',
      second: '#c77d0a',
      hand: '#ffe08a',
      eye: '#141a2e',
      signature: 'coinflip',
    })
  })

  it('is armless, stands within ±20% of the old figure, with sockets at the blob sides', () => {
    const m = slime.metrics(look, frame({ still: true }))
    expect(m.armed).toBe(false)
    expect(m.headTop).toBeGreaterThanOrEqual(-60)
    expect(m.headTop).toBeLessThanOrEqual(-40)
    expect(m.socketF.x).toBeCloseTo(16, 6)
    expect(m.socketF.y).toBeCloseTo(-22, 6)
    expect(m.socketB.x).toBeCloseTo(-16, 6)
    expect(m.socketB.y).toBeCloseTo(-22, 6)
    // The held ball (12 in front, LAUNCH_LIFT + BALL_R = 21 up) is in reach.
    expect(Math.hypot(12 - m.socketF.x, -21 - m.socketF.y)).toBeLessThan(m.upper + m.fore)
  })

  it('draws every mood × eyes without throwing, back hand before front hand, with its hat', () => {
    for (const mood of MOODS)
      for (const eyes of EYES)
        for (const still of [false, true])
          for (const fidget of [0, 0.5]) {
            const f = frame({ mood, eyes, still, fidget, pose: { ...POSE, fall: mood === 'ko' ? 1 : 0 } })
            const { kit, calls } = kitFor(f)
            expect(() => slime.draw(fakeCanvas(), look, f, kit)).not.toThrow()
            expect(calls.indexOf('back')).toBeLessThan(calls.indexOf('front'))
            expect(calls).toContain('hat')
          }
  })

  it('floating hands stay near the blob (within two hand widths) in every free pose', () => {
    for (const mood of MOODS) {
      if (mood === 'throw' || mood === 'ko') continue
      for (const t of [0, 0.7, 1.9]) {
        const f = frame({ mood, t, moodAge: 0.5 })
        const m = slime.metrics(look, f)
        const h = solveHands(m, slime.pose!(look, f), null, false)
        for (const hand of [h.front, h.back]) expect(toBox(hand, m.bodyBox)).toBeLessThan(m.handR * 4)
      }
    }
  })

  it('raises both hands on cheer, pump and cast', () => {
    for (const mood of ['cheer', 'pump', 'cast'] as Mood[]) {
      const f = frame({ mood })
      const m = slime.metrics(look, f)
      const h = solveHands(m, slime.pose!(look, f), null, false)
      expect(h.front.y).toBeLessThan(m.socketF.y)
      expect(h.back.y).toBeLessThan(m.socketB.y)
    }
  })

  it('melts to a puddle as pose.fall goes 0 → 1 (KO), hands flopped by its sides', () => {
    const up = slime.metrics(look, frame())
    const half = slime.metrics(look, frame({ mood: 'ko', pose: { ...POSE, fall: 0.5 } }))
    const down = slime.metrics(look, frame({ mood: 'ko', pose: { ...POSE, fall: 1 } }))
    expect(half.headTop).toBeGreaterThan(up.headTop)
    expect(down.headTop).toBeGreaterThan(half.headTop)
    expect(down.headTop).toBeGreaterThan(-20)
    expect(down.bodyBox.w).toBeGreaterThan(up.bodyBox.w * 1.2)
    const f = frame({ mood: 'ko', pose: { ...POSE, fall: 1 } })
    const h = solveHands(down, slime.pose!(look, f), null, false)
    for (const hand of [h.front, h.back]) expect(hand.y).toBeGreaterThan(-8)
  })

  it('the jelly lags hops: the top trails the body when it hops', () => {
    const rest = slime.metrics(look, frame())
    const hop = slime.metrics(look, frame({ hop: -10 }))
    expect(hop.headTop).toBeGreaterThan(rest.headTop)
    // The top squashes more than the base (the extra 0.5× on the top).
    const sq = slime.metrics(look, frame({ squash: -4 }))
    expect(sq.headTop).toBeGreaterThan(rest.headTop)
  })

  it('splats on hurt (wider and flatter)', () => {
    const rest = slime.metrics(look, frame())
    const hurt = slime.metrics(look, frame({ mood: 'hurt', moodAge: 0.05 }))
    expect(hurt.bodyBox.w).toBeGreaterThan(rest.bodyBox.w)
    expect(hurt.headTop).toBeGreaterThan(rest.headTop)
  })

  it('freezes its idle loops under reduced motion (same drawing at any time)', () => {
    const drawAt = (t: number) => {
      const f = frame({ t, still: true })
      const c = fakeCanvas()
      slime.draw(c, look, f, kitFor(f).kit)
      return JSON.stringify(c.log)
    }
    expect(drawAt(1)).toBe(drawAt(5.5))
  })

  it('wobbles each bulge on its own phase when moving', () => {
    const blobAt = (t: number) => {
      const f = frame({ t })
      const c = fakeCanvas()
      slime.draw(c, look, f, kitFor(f).kit)
      return JSON.stringify(c.log)
    }
    expect(blobAt(1)).not.toBe(blobAt(1.4))
  })
})
