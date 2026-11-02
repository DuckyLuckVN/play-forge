import { describe, expect, it, vi } from 'vitest'
import type { EyeStyle, Mood, Pose } from '../../hero-avatar'
import { HeroAvatar, type AvatarContext } from '../../hero-avatar'
import type { HeroId } from '../../sim/heroes'
import { fakeCanvas, installPath2D } from '../../test-canvas'
import { solveHands } from '../hands'
import { CREATURE_LOOKS } from '../looks'
import type { CreatureLook, DrawKit, Frame, Rect } from '../types'
import { critter } from './critter'
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

/** Hero → [variant, signature]. */
const CAST: Array<[HeroId, string, string]> = [
  ['ranger', 'sprout', 'rustle'],
  ['ninja', 'cat', 'pawlick'],
  ['paladin', 'lion', 'roar'],
  ['sorcerer', 'crystal', 'glint'],
  ['dragon', 'dragon', 'puff'],
  ['gambler', 'dice', 'reroll'],
]
const LOOKS = CAST.map(([id]) => [id, CREATURE_LOOKS[id]!] as const)
const HOLD = { x: 12, y: -21, r: 7 }

const kitFor = (look: CreatureLook, f: Frame) => {
  const m = critter.metrics(look, f)
  const calls: string[] = []
  const kit: DrawKit = {
    metrics: m,
    hands: solveHands(m, critter.pose!(look, f), f.hold, f.holding),
    backHand: () => calls.push('back'),
    frontHand: () => calls.push('front'),
    hat: () => calls.push('hat'),
    emblem: () => calls.push('emblem'),
  }
  return { kit, calls }
}
const drawLog = (look: CreatureLook, f: Frame) => {
  const c = fakeCanvas()
  critter.draw(c, look, f, kitFor(look, f).kit)
  return JSON.stringify(c.log)
}
const handsOf = (look: CreatureLook, f: Frame) =>
  solveHands(critter.metrics(look, f), critter.pose!(look, f), f.hold, f.holding)

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
/** Hold-mood poses as the avatar sets them (idle, watch, aim high and low, worried). */
const HOLD_POSES: Array<[Mood, Partial<Pose>]> = [
  ['idle', {}],
  ['watch', { sF: 0.5, eF: 1.7, sB: -0.3, eB: 1.9, lean: 0.08 }],
  ['aim', { crouch: 0.35, lean: -0.08, sF: -2.3, eF: 1.7, sB: 2.6, eB: 0.15 }],
  ['aim', { crouch: 0.35, lean: -0.08, sF: -2.3, eF: 1.7, sB: 1.6, eB: 0.15 }],
  ['worried', { sF: 0.8, eF: 2.3, sB: -0.6, eB: 2.3, crouch: 0.2 }],
]

const toBox = (p: { x: number; y: number }, b: Rect) =>
  Math.hypot(Math.max(b.x - p.x, 0, p.x - (b.x + b.w)), Math.max(b.y - p.y, 0, p.y - (b.y + b.h)))

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

describe('critter body (Sprig, Kage, Aurelia, Nyx, Drakon, Lucky)', () => {
  it('is registered, and each critter hero has its variant and signature', () => {
    expect(BODIES.critter).toBe(critter)
    for (const [id, variant, signature] of CAST) {
      const look = CREATURE_LOOKS[id]!
      expect(look.body).toBe('critter')
      expect(look.variant).toBe(variant)
      expect(look.signature).toBe(signature)
      for (const c of [look.main, look.second, look.hand, look.eye]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('is armed (front legs are the arms), stands within ±20% of the old figure, the ball in reach', () => {
    for (const [, look] of LOOKS) {
      const m = critter.metrics(look, frame({ still: true, hold: HOLD, holding: true }))
      expect(m.armed).toBe(true)
      expect(m.headTop).toBeGreaterThanOrEqual(-60)
      expect(m.headTop).toBeLessThanOrEqual(-40)
      // Both front-leg sockets sit at the chest, under the head.
      for (const s of [m.socketF, m.socketB]) expect(s.y).toBeGreaterThan(m.head.y + m.head.ry * 0.5)
      expect(m.socketF.x).toBeGreaterThan(m.socketB.x)
      expect(Math.hypot(HOLD.x - m.socketF.x, HOLD.y - m.socketF.y)).toBeLessThan(m.upper + m.fore)
      // Planted paws reach the ground from both sockets.
      for (const s of [m.socketF, m.socketB])
        expect(Math.hypot(2, -m.handR - s.y)).toBeLessThanOrEqual(m.upper + m.fore + 0.01)
    }
  })

  it('rears up to hold the ball: the torso tilts up and the shoulders rise', () => {
    for (const [, look] of LOOKS) {
      const down = critter.metrics(look, frame({ still: true }))
      const up = critter.metrics(look, frame({ still: true, hold: HOLD, holding: true }))
      expect(up.socketF.y).toBeLessThan(down.socketF.y - 1)
    }
  })

  it('draws each variant × every mood × eyes without throwing, back paw before front, with its hat', () => {
    // Every eye style once per mood, and every still × fidget × age combination with normal eyes.
    const cases: Array<[EyeStyle, boolean, number, number]> = [
      ...EYES.map((e): [EyeStyle, boolean, number, number] => [e, false, 0, 0.4]),
      ...[false, true].flatMap((still) =>
        [0, 0.5].flatMap((fidget) =>
          [0.05, 0.4, 1.5].map((age): [EyeStyle, boolean, number, number] => ['normal', still, fidget, age]),
        ),
      ),
    ]
    for (const [, look] of LOOKS)
      for (const mood of MOODS)
        for (const [eyes, still, fidget, moodAge] of cases) {
          const f = frame({
            mood,
            eyes,
            still,
            fidget,
            moodAge,
            pose: { ...POSE, fall: mood === 'ko' ? 1 : 0 },
          })
          const { kit, calls } = kitFor(look, f)
          expect(() => critter.draw(fakeCanvas(), look, f, kit)).not.toThrow()
          expect(calls.indexOf('back')).toBeLessThan(calls.indexOf('front'))
          expect(calls).toContain('hat')
        }
  }, 20_000)

  it('draws its paws without throwing, open or closed', () => {
    for (const [, look] of LOOKS) {
      const h = kitFor(look, frame()).kit.hands.front
      for (const open of [0, 1])
        expect(() => critter.drawHand!(fakeCanvas(), { ...h, open }, look, 4)).not.toThrow()
    }
  })

  it('plants the free front paw on the ground while holding (not raised like a wave)', () => {
    for (const [, look] of LOOKS)
      for (const [mood, patch] of HOLD_POSES)
        for (const t of [0, 0.8, 1.9]) {
          const f = frame({ mood, t, pose: { ...POSE, ...patch }, hold: HOLD, holding: true })
          const m = critter.metrics(look, f)
          const { back } = handsOf(look, f)
          expect(back.y).toBeGreaterThan(m.socketB.y)
          // On the ground: the paw's bottom within a unit of the floor.
          expect(Math.abs(back.y + m.handR)).toBeLessThan(1)
        }
  })

  it('stands on all fours without the ball (both paws on the ground)', () => {
    for (const [, look] of LOOKS) {
      const f = frame()
      const m = critter.metrics(look, f)
      const h = handsOf(look, f)
      for (const p of [h.front, h.back]) expect(Math.abs(p.y + m.handR)).toBeLessThan(1)
    }
  })

  it('still lets an idle wave raise the back paw', () => {
    const p = critter.pose!(
      LOOKS[0][1],
      frame({ pose: { ...POSE, sB: -2.6, eB: 0.3 }, hold: HOLD, holding: true }),
    )
    expect(p.sB).toBeLessThan(-2)
  })

  it('free paws stay near the body and out of the head in every free pose', () => {
    for (const [, look] of LOOKS)
      for (const mood of MOODS) {
        if (mood === 'throw' || mood === 'ko') continue
        for (const t of [0, 0.7, 1.9]) {
          const f = frame({ mood, t, moodAge: 0.5 })
          const m = critter.metrics(look, f)
          const h = handsOf(look, f)
          for (const hand of [h.front, h.back]) {
            expect(toBox(hand, m.bodyBox)).toBeLessThan(m.handR * 4)
            const hx = (hand.x - m.head.x) / m.head.rx
            const hy = (hand.y - m.head.y) / m.head.ry
            expect(Math.hypot(hx, hy)).toBeGreaterThan(1)
          }
        }
      }
  })

  it('rears up with both paws high on cheer and cast; the pump never shakes the screen', () => {
    expect(critter.offsetX).toBeUndefined()
    for (const [, look] of LOOKS) {
      const rest = critter.metrics(look, frame({ hold: HOLD, holding: true }))
      for (const mood of ['cheer', 'cast'] as Mood[]) {
        const f = frame({ mood, moodAge: 1.2 })
        const m = critter.metrics(look, f)
        const h = handsOf(look, f)
        expect(h.front.y).toBeLessThan(m.socketF.y)
        expect(h.back.y).toBeLessThan(m.socketB.y)
      }
      const cheer = critter.metrics(look, frame({ mood: 'cheer', moodAge: 0.5 }))
      expect(cheer.socketF.y).toBeLessThan(rest.socketF.y)
    }
  })

  it('each cheer plays its own flourish (the drawing differs from a plain happy face)', () => {
    const logs = LOOKS.map(([, look]) => {
      const cheer = drawLog(look, frame({ mood: 'cheer', moodAge: 0.3, eyes: 'happy' }))
      const calm = drawLog(look, frame({ mood: 'idle', moodAge: 0.3, eyes: 'happy' }))
      expect(cheer).not.toBe(calm)
      return cheer
    })
    expect(new Set(logs).size).toBe(LOOKS.length)
  })

  it('wags its tail and twitches its ears (idle loop), frozen under reduced motion with no one-shot offsets', () => {
    for (const [, look] of LOOKS) {
      expect(drawLog(look, frame({ t: 1 }))).not.toBe(drawLog(look, frame({ t: 1.4 })))
      expect(drawLog(look, frame({ t: 1, still: true }))).toBe(drawLog(look, frame({ t: 5.5, still: true })))
      const still = (patch: Partial<Frame>) => critter.metrics(look, frame({ still: true, ...patch }))
      const rest = still({})
      // The cheer rear-up is a pose; its hop, flip and tumble are one-shots that stay off.
      expect(still({ mood: 'cheer', moodAge: 0.4 }).head).toEqual(still({ mood: 'cheer', moodAge: 1.2 }).head)
      expect(still({ mood: 'hurt', moodAge: 0.1 }).bodyBox).toEqual(
        still({ mood: 'hurt', moodAge: 1 }).bodyBox,
      )
      expect(still({ t: 4 }).head).toEqual(rest.head)
    }
  })

  it('flops over on its side on KO, and revives as pose.fall returns to 0', () => {
    for (const [, look] of LOOKS) {
      const up = critter.metrics(look, frame())
      const down = critter.metrics(look, frame({ mood: 'ko', moodAge: 2, pose: { ...POSE, fall: 1 } }))
      expect(down.headTop).toBeGreaterThan(up.headTop + 15)
      expect(down.head.y).toBeGreaterThan(-20)
      // Lying down: long and low.
      expect(down.bodyBox.w).toBeGreaterThan(down.bodyBox.h * 1.5)
      const f = frame({ mood: 'ko', moodAge: 2, pose: { ...POSE, fall: 1 } })
      const h = solveHands(down, critter.pose!(look, f), null, false)
      for (const hand of [h.front, h.back]) expect(hand.y).toBeGreaterThan(-10)
      const back = critter.metrics(look, frame({ mood: 'revive', pose: { ...POSE, fall: 0 } }))
      expect(back.headTop).toBeCloseTo(critter.metrics(look, frame({ mood: 'revive' })).headTop, 6)
    }
  })

  it('plays its signature move on the fidget; Kage licks a raised paw', () => {
    for (const [, look] of LOOKS)
      expect(drawLog(look, frame({ fidget: 0.5 }))).not.toBe(drawLog(look, frame()))
    const kage = CREATURE_LOOKS.ninja!
    const f = frame({ fidget: 0.5, hold: HOLD, holding: true })
    const m = critter.metrics(kage, f)
    const { back } = handsOf(kage, f)
    // Raised in front of the face, up by the mouth (the solver's head box shrinks to the crown meanwhile).
    expect(back.y).toBeLessThan(m.socketB.y - 6)
    expect(back.x).toBeGreaterThan(m.head.x + 6)
    expect(critter.metrics(kage, frame({ hold: HOLD, holding: true })).head.ry).toBeGreaterThan(m.head.ry)
  })

  it('holds the ball exactly in the front paw, mirrored and bigger too', () => {
    for (const [id] of CAST)
      for (const [homeX, size] of [
        [100, 1],
        [300, 1],
        [100, 1.35],
        [300, 1.35],
      ]) {
        const a = new HeroAvatar(id)
        a.size = size
        const h = { x: homeX, y: 740, r: 5 }
        for (const seconds of [0.5, 0.4, 0.4]) {
          run(a, seconds, actx({ homeX, hold: h }))
          expect(a.mood).toBe('idle')
          a.draw(fakeCanvas(), 760)
          const front = a.lastHands?.front
          expect(front).toBeTruthy()
          expect(Math.abs(front!.x - h.x)).toBeLessThan(0.01)
          expect(Math.abs(front!.y - h.y)).toBeLessThan(0.01)
        }
      }
  })
})
