import { describe, expect, it, vi } from 'vitest'
import type { EyeStyle, Mood, Pose } from '../../hero-avatar'
import { HeroAvatar, type AvatarContext } from '../../hero-avatar'
import type { HeroId } from '../../sim/heroes'
import { fakeCanvas, installPath2D } from '../../test-canvas'
import { solveHands } from '../hands'
import { CREATURE_LOOKS } from '../looks'
import type { CreatureLook, DrawKit, Frame, Rect } from '../types'
import { BODIES } from './index'
import { sprite } from './sprite'

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

/** Hero → [variant, signature]. */
const CAST: Array<[HeroId, string, string]> = [
  ['flash', 'spark', 'crackle'],
  ['pyro', 'flame', 'flare'],
  ['tempest', 'cloud', 'bolt'],
  ['cleric', 'star', 'twinkle'],
  ['necro', 'ghost', 'fade'],
]
const LOOKS = CAST.map(([id]) => [id, CREATURE_LOOKS[id]] as const)

const kitFor = (look: CreatureLook, f: Frame) => {
  const m = sprite.metrics(look, f)
  const calls: string[] = []
  const kit: DrawKit = {
    metrics: m,
    hands: solveHands(m, sprite.pose!(look, f), f.hold, f.holding),
    backHand: () => calls.push('back'),
    frontHand: () => calls.push('front'),
    hat: () => calls.push('hat'),
    emblem: () => calls.push('emblem'),
  }
  return { kit, calls }
}
const drawLog = (look: CreatureLook, f: Frame) => {
  const c = fakeCanvas()
  sprite.draw(c, look, f, kitFor(look, f).kit)
  return JSON.stringify(c.log)
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

const toBox = (p: { x: number; y: number }, b: Rect) =>
  Math.hypot(Math.max(b.x - p.x, 0, p.x - (b.x + b.w)), Math.max(b.y - p.y, 0, p.y - (b.y + b.h)))
const bottom = (b: Rect) => b.y + b.h

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

describe('sprite body (Zip, Ember, Volta, Lumi, Boo)', () => {
  it('is registered, and each sprite hero has its variant and signature', () => {
    expect(BODIES.sprite).toBe(sprite)
    for (const [id, variant, signature] of CAST) {
      const look = CREATURE_LOOKS[id]
      expect(look.body).toBe('sprite')
      expect(look.variant).toBe(variant)
      expect(look.signature).toBe(signature)
      for (const c of [look.main, look.second, look.hand, look.eye]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('is armless and floats: base about 6 above the floor, head within ±20% of the old figure', () => {
    for (const [, look] of LOOKS) {
      const m = sprite.metrics(look, frame({ still: true }))
      expect(m.armed).toBe(false)
      expect(m.headTop).toBeGreaterThanOrEqual(-60)
      expect(m.headTop).toBeLessThanOrEqual(-40)
      expect(bottom(m.bodyBox)).toBeGreaterThan(-9)
      expect(bottom(m.bodyBox)).toBeLessThan(-3)
      // The held ball (12 in front, LAUNCH_LIFT + BALL_R = 21 up) is in reach of the front socket.
      expect(Math.hypot(12 - m.socketF.x, -21 - m.socketF.y)).toBeLessThan(m.upper + m.fore)
    }
  })

  it('bobs with a 2.4 hover bob (still when reduced)', () => {
    for (const [, look] of LOOKS) {
      const ys = Array.from({ length: 40 }, (_, i) =>
        bottom(sprite.metrics(look, frame({ t: i * 0.1 })).bodyBox),
      )
      const span = Math.max(...ys) - Math.min(...ys)
      expect(span).toBeGreaterThan(3.5)
      expect(span).toBeLessThan(6)
      const still = [0, 1, 2.5].map((t) => bottom(sprite.metrics(look, frame({ t, still: true })).bodyBox))
      expect(new Set(still).size).toBe(1)
    }
  })

  it('draws each variant in every mood, eye style, still and fidget case without throwing, back hand first, with its hat', () => {
    // About 40 draws per variant: every mood once, the other eye styles on idle, and still × fidget on the moods
    // with one-shots (plus a cheer at three ages) — the same code paths as the full product, at a fraction of the cost.
    const cases: Array<Partial<Frame>> = [
      ...MOODS.map((mood) => ({ mood })),
      ...EYES.filter((e) => e !== 'normal').map((eyes) => ({ eyes })),
      ...(['idle', 'cheer', 'pump', 'hurt', 'ko'] as Mood[]).flatMap((mood) =>
        [false, true].flatMap((still) => [0, 0.5].map((fidget) => ({ mood, still, fidget, moodAge: 0.3 }))),
      ),
      ...[0.05, 0.6, 1.5].map((moodAge) => ({ mood: 'cheer' as Mood, moodAge })),
    ]
    for (const [, look] of LOOKS)
      for (const c of cases) {
        const f = frame({ moodAge: 0.4, ...c, pose: { ...POSE, fall: c.mood === 'ko' ? 1 : 0 } })
        const { kit, calls } = kitFor(look, f)
        expect(() => sprite.draw(fakeCanvas(), look, f, kit)).not.toThrow()
        expect(calls.indexOf('back')).toBeLessThan(calls.indexOf('front'))
        expect(calls).toContain('hat')
      }
  })

  it('floating hands stay near the body (within four hand radii) in every free pose', () => {
    for (const [, look] of LOOKS)
      for (const mood of MOODS) {
        if (mood === 'throw' || mood === 'ko') continue
        for (const t of [0, 0.7, 1.9]) {
          const f = frame({ mood, t, moodAge: 0.5 })
          const m = sprite.metrics(look, f)
          const h = solveHands(m, sprite.pose!(look, f), null, false)
          for (const hand of [h.front, h.back]) expect(toBox(hand, m.bodyBox)).toBeLessThan(m.handR * 4)
        }
      }
  })

  it('rests the back hand low behind the body while holding (no raised hand that reads as a wave)', () => {
    const poses: Array<[Mood, Partial<Pose>]> = [
      ['idle', {}],
      ['watch', { sF: 0.5, eF: 1.7, sB: -0.3, eB: 1.9, lean: 0.08 }],
      ['aim', { crouch: 0.35, lean: -0.08, sF: -2.3, eF: 1.7, sB: 2.6, eB: 0.15 }],
      ['aim', { crouch: 0.35, lean: -0.08, sF: -2.3, eF: 1.7, sB: 1.6, eB: 0.15 }],
      ['worried', { sF: 0.8, eF: 2.3, sB: -0.6, eB: 2.3, crouch: 0.2 }],
    ]
    for (const [, look] of LOOKS)
      for (const [mood, patch] of poses)
        for (const t of [0, 0.8, 1.9]) {
          const f = frame({
            mood,
            t,
            pose: { ...POSE, ...patch },
            hold: { x: 12, y: -21, r: 7 },
            holding: true,
          })
          const m = sprite.metrics(look, f)
          const { back } = solveHands(m, sprite.pose!(look, f), f.hold, true)
          expect(back.y).toBeGreaterThan(m.socketB.y)
          expect(back.x).toBeLessThan(m.bodyBox.x + m.bodyBox.w / 2)
        }
  })

  it('still lets an idle wave raise the back hand', () => {
    const p = sprite.pose!(LOOKS[0][1], frame({ pose: { ...POSE, sB: -2.6, eB: 0.3 } }))
    expect(p.sB).toBeLessThan(-2)
  })

  it('raises both hands on cheer and cast; the pump never shakes the screen', () => {
    expect(sprite.offsetX).toBeUndefined()
    for (const [, look] of LOOKS)
      for (const mood of ['cheer', 'cast'] as Mood[]) {
        const f = frame({ mood, moodAge: 1.2 })
        const m = sprite.metrics(look, f)
        const h = solveHands(m, sprite.pose!(look, f), null, false)
        expect(h.front.y).toBeLessThan(m.socketF.y)
        expect(h.back.y).toBeLessThan(m.socketB.y)
      }
  })

  it('each cheer plays its own flourish (the drawing differs from a plain happy face)', () => {
    for (const [, look] of LOOKS) {
      const cheer = drawLog(look, frame({ mood: 'cheer', moodAge: 0.3, eyes: 'happy' }))
      const calm = drawLog(look, frame({ mood: 'idle', moodAge: 0.3, eyes: 'happy' }))
      expect(cheer).not.toBe(calm)
    }
    // Boo loops the loop: the whole body travels mid-cheer.
    const boo = CREATURE_LOOKS.necro
    const rest = sprite.metrics(boo, frame({ mood: 'idle' }))
    const loop = sprite.metrics(boo, frame({ mood: 'cheer', moodAge: 0.45 }))
    expect(Math.hypot(loop.head.x - rest.head.x, loop.head.y - rest.head.y)).toBeGreaterThan(8)
  })

  it("Volta's bolt never reaches past the floor line (cheer flash, signature, bob low, KO drift)", () => {
    const look = CREATURE_LOOKS.tempest
    const cases: Array<Partial<Frame>> = [
      { mood: 'cheer', moodAge: 0.02, eyes: 'happy' },
      { fidget: 0.5 },
      ...[0, 0.7, 1.4, 2.1, 2.8].map((t) => ({ t, mood: 'cheer' as Mood, moodAge: 0.05 })),
      { mood: 'ko', pose: { ...POSE, fall: 0.3 } },
      { mood: 'ko', pose: { ...POSE, fall: 0.6 } },
    ]
    for (const patch of cases) {
      const f = frame(patch)
      const c = fakeCanvas()
      sprite.draw(c, look, f, kitFor(look, f).kit)
      const box = sprite.metrics(look, f).bodyBox
      const base = bottom(box)
      /** The rig's height scale (no lean here, so the box height scales with it). */
      const sy = (g: Frame) =>
        box.h / sprite.metrics(look, { ...g, mood: 'idle', pose: { ...POSE } }).bodyBox.h
      const i = c.log.findIndex((r) => r.name === 'translate' && r.args[0] === -5 && r.args[1] === -9)
      if (i < 0) continue // shrunk away
      const bs = c.log[i + 1].args[0] as number
      // Tip (13 units at scale 1, plus half the 3.5-unit outline) in the rig frame, then onto the board.
      expect(base + (-9 + 15 * bs) * sy(f)).toBeLessThanOrEqual(0.01)
    }
  })

  it('KO fizzles and drifts down to the floor, and revives as pose.fall returns to 0', () => {
    for (const [, look] of LOOKS) {
      const up = sprite.metrics(look, frame())
      const half = sprite.metrics(look, frame({ mood: 'ko', pose: { ...POSE, fall: 0.5 } }))
      const down = sprite.metrics(look, frame({ mood: 'ko', pose: { ...POSE, fall: 1 } }))
      expect(half.headTop).toBeGreaterThan(up.headTop)
      expect(down.headTop).toBeGreaterThan(half.headTop)
      expect(Math.abs(bottom(down.bodyBox))).toBeLessThan(1.5)
      const f = frame({ mood: 'ko', pose: { ...POSE, fall: 1 } })
      const h = solveHands(down, sprite.pose!(look, f), null, false)
      for (const hand of [h.front, h.back]) expect(hand.y).toBeGreaterThan(-12)
      const back = sprite.metrics(look, frame({ mood: 'revive', pose: { ...POSE, fall: 0 } }))
      expect(back.headTop).toBeCloseTo(up.headTop, 6)
    }
  })

  it('moves on its own idle loop, frozen under reduced motion (no one-shot offsets either)', () => {
    for (const [, look] of LOOKS) {
      expect(drawLog(look, frame({ t: 1 }))).not.toBe(drawLog(look, frame({ t: 1.4 })))
      expect(drawLog(look, frame({ t: 1, still: true }))).toBe(drawLog(look, frame({ t: 5.5, still: true })))
      const still = (patch: Partial<Frame>) => sprite.metrics(look, frame({ still: true, ...patch }))
      const rest = still({})
      expect(still({ mood: 'cheer', moodAge: 0.45 }).head).toEqual(rest.head)
      expect(still({ mood: 'hurt', moodAge: 0.1 }).bodyBox).toEqual(rest.bodyBox)
    }
  })

  it('plays its signature move on the fidget', () => {
    for (const [, look] of LOOKS)
      expect(drawLog(look, frame({ fidget: 0.5 }))).not.toBe(drawLog(look, frame()))
  })

  it('holds the ball exactly in the front hand while hovering, mirrored and bigger too', () => {
    for (const [id] of CAST)
      for (const [homeX, size] of [
        [100, 1],
        [300, 1],
        [100, 1.35],
      ]) {
        const a = new HeroAvatar(id)
        a.size = size
        const h = { x: homeX, y: 740, r: 5 }
        for (const seconds of [0.5, 0.9, 1.3]) {
          run(a, seconds === 0.5 ? 0.5 : 0.4, actx({ homeX, hold: h }))
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
