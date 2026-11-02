import { describe, expect, it, vi } from 'vitest'
import type { EyeStyle, Mood, Pose } from '../../hero-avatar'
import { HeroAvatar, type AvatarContext } from '../../hero-avatar'
import { fakeCanvas, installPath2D } from '../../test-canvas'
import { solveHands } from '../hands'
import { CREATURE_LOOKS } from '../looks'
import type { DrawKit, Frame } from '../types'
import { golem } from './golem'
import { BODIES } from './index'

vi.mock('@forge/fx/tween', () => ({ prefersReducedMotion: () => false }))

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

const look = CREATURE_LOOKS.knight!

const kitFor = (f: Frame) => {
  const m = golem.metrics(look, f)
  const calls: string[] = []
  const kit: DrawKit = {
    metrics: m,
    hands: solveHands(m, golem.pose!(look, f), f.hold, f.holding),
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

const actx = (patch: Partial<AvatarContext> = {}): AvatarContext => ({
  homeX: 100,
  boardW: 392,
  floorY: 760,
  aim: null,
  watch: null,
  throwing: false,
  danger: false,
  lowHealth: false,
  combo: 0,
  ...patch,
})
const run = (a: HeroAvatar, seconds: number, c = actx()) => {
  for (let t = 0; t < seconds; t += 1 / 60) a.update(1 / 60, c)
}

describe('golem body (Bastion)', () => {
  it('is registered, and knight is a brick golem with a scarf', () => {
    expect(BODIES.golem).toBe(golem)
    expect(look).toEqual({
      body: 'golem',
      variant: 'brick',
      main: '#b8bcc6',
      second: '#2f7df6',
      hand: '#b8bcc6',
      eye: '#ffffff',
      signature: 'scarf',
    })
  })

  it('is armed, stands within ±20% of the old figure, with sockets at the shoulders', () => {
    const m = golem.metrics(look, frame({ still: true }))
    expect(m.armed).toBe(true)
    expect(m.headTop).toBeGreaterThanOrEqual(-60)
    expect(m.headTop).toBeLessThanOrEqual(-40)
    expect(m.socketF.x).toBeGreaterThan(0)
    expect(m.socketB.x).toBeLessThan(0)
    expect(m.socketF.y).toBeGreaterThan(m.head.y)
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
            expect(() => golem.draw(fakeCanvas(), look, f, kit)).not.toThrow()
            expect(calls.indexOf('back')).toBeLessThan(calls.indexOf('front'))
            expect(calls).toContain('hat')
          }
  })

  it('draws its fist hands without throwing, open or closed', () => {
    const f = frame()
    const h = kitFor(f).kit.hands.front
    for (const open of [0, 1])
      expect(() => golem.drawHand!(fakeCanvas(), { ...h, open }, look, 4)).not.toThrow()
  })

  it('crumbles into at least 5 blocks on KO (pose.fall = 1), its head settled low on the pile', () => {
    const f = frame({ mood: 'ko', moodAge: 2, eyes: 'xx', pose: { ...POSE, fall: 1 } })
    const c = fakeCanvas()
    golem.draw(c, look, f, kitFor(f).kit)
    const blocks = new Set(
      c.log
        .filter((r) => r.name === 'fill' && r.args[0] instanceof Path2D)
        .map((r) => r.args[0] as Path2D & { ops: { name: string }[] })
        .filter((p) => p.ops.some((o) => o.name === 'roundRect')),
    )
    expect(blocks.size).toBeGreaterThanOrEqual(5)
    const up = golem.metrics(look, frame())
    const down = golem.metrics(look, f)
    expect(down.headTop).toBeGreaterThan(up.headTop + 10)
    expect(down.bodyBox.w).toBeGreaterThan(up.bodyBox.w * 1.3)
    expect(down.bodyBox.h).toBeLessThan(up.bodyBox.h * 0.9)
  })

  it('raises its fists on cheer, then stomps: a shake offset only after the stomp, none when still', () => {
    for (const mood of ['cheer', 'pump'] as Mood[]) {
      const up = golem.pose!(look, frame({ mood, moodAge: 0.2 }))
      expect(up.sF).toBeGreaterThan(1.9)
      expect(up.sB).toBeLessThan(-1.9)
    }
    const at = (moodAge: number, still = false) =>
      golem.offsetX!(look, frame({ mood: 'cheer', moodAge, still }))
    expect(at(0.2)).toBe(0)
    const shake = [0.45, 0.48, 0.5, 0.55, 0.6].map((a) => Math.abs(at(a)))
    expect(Math.max(...shake)).toBeGreaterThan(0.5)
    expect(Math.max(...shake)).toBeLessThan(3)
    expect(at(1.2)).toBe(0)
    expect(at(0.5, true)).toBe(0)
    expect(golem.offsetX!(look, frame())).toBe(0)
  })

  it('breathes heavily, the head lagging a beat behind the shoulders', () => {
    const gap = [0, 0.4, 0.8, 1.2, 1.6, 2].map((t) => {
      const m = golem.metrics(look, frame({ t }))
      return m.head.y - m.socketF.y
    })
    expect(Math.max(...gap) - Math.min(...gap)).toBeGreaterThan(0.5)
    const lift = [0, 0.5, 1, 1.5, 2].map((t) => golem.metrics(look, frame({ t })).socketF.y)
    expect(Math.max(...lift) - Math.min(...lift)).toBeGreaterThan(1)
  })

  it('freezes its idle loops under reduced motion (same drawing at any time)', () => {
    const drawAt = (t: number) => {
      const f = frame({ t, still: true })
      const c = fakeCanvas()
      golem.draw(c, look, f, kitFor(f).kit)
      return JSON.stringify(c.log)
    }
    expect(drawAt(1)).toBe(drawAt(5.5))
  })

  it('the scarf whips on the signature move', () => {
    const drawWith = (fidget: number) => {
      const f = frame({ fidget })
      const c = fakeCanvas()
      golem.draw(c, look, f, kitFor(f).kit)
      return JSON.stringify(c.log)
    }
    expect(drawWith(0.5)).not.toBe(drawWith(0))
  })

  it('the knight holds the ball exactly in its front fist, mirrored and bigger too', () => {
    for (const [homeX, size] of [
      [100, 1],
      [300, 1],
      [100, 1.35],
    ]) {
      const a = new HeroAvatar('knight')
      a.size = size
      const h = { x: homeX, y: 740, r: 5 }
      run(a, 0.5, actx({ homeX, hold: h }))
      expect(a.mood).toBe('idle')
      a.draw(fakeCanvas(), 760)
      const front = a.lastHands?.front
      expect(front).toBeTruthy()
      expect(Math.abs(front!.x - h.x)).toBeLessThan(0.01)
      expect(Math.abs(front!.y - h.y)).toBeLessThan(0.01)
    }
  })
})
