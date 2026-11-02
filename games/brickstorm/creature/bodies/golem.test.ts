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

  it('crumbles into 5 separate blocks on KO (pose.fall = 1): the torso splits, every block moves off its spot', () => {
    type P = Path2D & { ops: { name: string; args: number[] }[] }
    /** Torso halves (13 × 22 blocks) drawn in a frame. */
    const halves = (f: Frame) => {
      const c = fakeCanvas()
      golem.draw(c, look, f, kitFor(f).kit)
      return new Set(
        c.log
          .filter((r) => r.name === 'fill' && r.args[0] instanceof Path2D)
          .map((r) => r.args[0] as P)
          .filter((p) => p.ops.some((o) => o.name === 'roundRect' && o.args[2] === 13 && o.args[3] === 22)),
      ).size
    }
    const ko = frame({ mood: 'ko', moodAge: 2, eyes: 'xx', pose: { ...POSE, fall: 1 } })
    const up = frame({ still: true })
    expect(halves(up)).toBe(0)
    expect(halves(ko)).toBe(2)
    const a = golem.metrics(look, up)
    const b = golem.metrics(look, ko)
    // The head rolls off to the front and lands low; the sockets ride their torso halves down; the pile spreads.
    expect(b.head.x - a.head.x).toBeGreaterThan(10)
    expect(b.headTop).toBeGreaterThan(a.headTop + 20)
    expect(b.socketF.y - a.socketF.y).toBeGreaterThan(8)
    expect(b.socketB.y - a.socketB.y).toBeGreaterThan(15)
    expect(b.bodyBox.w).toBeGreaterThan(a.bodyBox.w * 1.3)
    expect(b.bodyBox.h).toBeLessThan(a.bodyBox.h * 0.9)
    // The head no longer sits over the torso pile's middle, so all five blocks show.
    expect(b.head.x - b.head.rx).toBeGreaterThan(b.bodyBox.x + b.bodyBox.w / 2 - 5)
  })

  it('hangs the back fist at its side, below the shoulder and clear of the torso, in idle, watch, aim and worried', () => {
    const poses: Array<[Mood, Partial<Pose>]> = [
      ['idle', {}],
      ['watch', { sF: 0.5, eF: 1.7, sB: -0.3, eB: 1.9, lean: 0.08 }],
      ['aim', { crouch: 0.35, lean: -0.08, sF: -2.3, eF: 1.7, sB: 2.6, eB: 0.15 }],
      ['aim', { crouch: 0.35, lean: -0.08, sF: -2.3, eF: 1.7, sB: 1.6, eB: 0.15 }],
      ['worried', { sF: 0.8, eF: 2.3, sB: -0.6, eB: 2.3, crouch: 0.2 }],
    ]
    for (const [mood, patch] of poses)
      for (const t of [0, 0.8, 1.9]) {
        const f = frame({
          mood,
          t,
          pose: { ...POSE, ...patch },
          hold: { x: 12, y: -21, r: 7 },
          holding: true,
        })
        const m = golem.metrics(look, f)
        const { back } = solveHands(m, golem.pose!(look, f), f.hold, true)
        expect(back.y).toBeGreaterThan(m.socketB.y)
        expect(back.x).toBeLessThan(m.bodyBox.x)
        // Hip level: between the knees and the chest.
        expect(back.y).toBeGreaterThan(-20)
        expect(back.y).toBeLessThan(-6)
      }
  })

  it('still lets an idle wave raise the back arm', () => {
    const p = golem.pose!(look, frame({ pose: { ...POSE, sB: -2.6, eB: 0.3 } }))
    expect(p.sB).toBeLessThan(-2)
  })

  it('raises its fists on cheer, then stomps: a shake offset only after the stomp, none when still or on a pump', () => {
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
    for (const moodAge of [0.3, 0.35, 0.4, 0.5])
      expect(golem.offsetX!(look, frame({ mood: 'pump', moodAge }))).toBe(0)
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

  it('holds a pose without one-shot motion under reduced motion (no stomp dip, hurt squash or gust)', () => {
    const still = (patch: Partial<Frame>) => golem.metrics(look, frame({ still: true, ...patch }))
    const rest = still({})
    expect(still({ mood: 'cheer', moodAge: 0.5 }).socketF).toEqual(rest.socketF)
    expect(still({ mood: 'hurt', moodAge: 0.15 }).bodyBox).toEqual(rest.bodyBox)
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
