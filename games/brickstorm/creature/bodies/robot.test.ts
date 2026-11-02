import { describe, expect, it } from 'vitest'
import type { EyeStyle, Mood, Pose } from '../../hero-avatar'
import { fakeCanvas, installPath2D } from '../../test-canvas'
import { solveHands } from '../hands'
import { CREATURE_LOOKS } from '../looks'
import type { DrawKit, Frame } from '../types'
import { BODIES } from './index'
import { robot } from './robot'

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

const look = CREATURE_LOOKS.rookie!

const kitFor = (f: Frame) => {
  const m = robot.metrics(look, f)
  const calls: string[] = []
  const kit: DrawKit = {
    metrics: m,
    hands: solveHands(m, f.pose, f.hold, f.holding),
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

describe('robot body (Cubo)', () => {
  it('is registered, and rookie is a cube robot', () => {
    expect(BODIES.robot).toBe(robot)
    expect(look).toMatchObject({ body: 'robot', variant: 'cube', signature: 'glance' })
  })

  it('stands within ±20% of the old figure, with sockets at the shoulders', () => {
    const m = robot.metrics(look, frame())
    expect(m.headTop).toBeGreaterThanOrEqual(-60)
    expect(m.headTop).toBeLessThanOrEqual(-40)
    expect(m.armed).toBe(true)
    expect(m.socketF.x).toBeGreaterThan(0)
    expect(m.socketB.x).toBeLessThan(0)
    expect(m.socketF.y).toBeGreaterThan(m.head.y)
    // The held ball (≈ chest height, 12 units in front) is in reach.
    const d = Math.hypot(12 - m.socketF.x, -14 - m.socketF.y)
    expect(d).toBeLessThan(m.upper + m.fore)
  })

  it('draws every mood × eyes without throwing, back hand before front hand, with its hat', () => {
    for (const mood of MOODS)
      for (const eyes of EYES)
        for (const still of [false, true]) {
          const f = frame({ mood, eyes, still, pose: { ...POSE, fall: mood === 'ko' ? 1 : 0 } })
          const { kit, calls } = kitFor(f)
          expect(() => robot.draw(fakeCanvas(), look, f, kit)).not.toThrow()
          expect(calls.indexOf('back')).toBeLessThan(calls.indexOf('front'))
          expect(calls).toContain('hat')
        }
  })

  it('raises both arms on cheer and pump, and on cast', () => {
    for (const mood of ['cheer', 'pump', 'cast'] as Mood[]) {
      const p = robot.pose!(look, frame({ mood }))
      expect(Math.abs(p.sF)).toBeGreaterThan(1.9)
      expect(Math.abs(p.sB)).toBeGreaterThan(1.9)
    }
  })

  it('keeps the pose untouched under reduced motion when idle', () => {
    const f = frame({ still: true })
    expect(robot.pose!(look, f)).toEqual(f.pose)
  })

  it('tips over with pose.fall (KO): the head moves sideways and down', () => {
    const up = robot.metrics(look, frame())
    const down = robot.metrics(look, frame({ mood: 'ko', pose: { ...POSE, fall: 1 } }))
    expect(Math.abs(down.head.x - up.head.x)).toBeGreaterThan(20)
    expect(down.head.y).toBeGreaterThan(up.head.y)
  })
})
