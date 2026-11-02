/** Shared fixtures for body-type tests: a neutral pose, frames, a recording kit, the draw matrix and avatar steps. */
import type { EyeStyle, Mood, Pose } from '../../hero-avatar'
import { HeroAvatar, rearFor, type AvatarContext } from '../../hero-avatar'
import type { HeroId } from '../../sim/heroes'
import { fakeCanvas } from '../../test-canvas'
import { solveHands } from '../hands'
import type { BodyType, CreatureLook, DrawKit, Frame, Rect } from '../types'

export const POSE: Pose = {
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

/** A frame patch: any frame field, with the pose given as a partial over the neutral POSE. */
export type FramePatch = Omit<Partial<Frame>, 'pose'> & { pose?: Partial<Pose> }

/**
 * A frame; the pose is the neutral POSE with the patch's fields over it. Its `rear` follows the avatar's target for the
 * mood and ball unless the patch's pose sets one (an explicit 0 included).
 */
export const frame = (patch: FramePatch = {}): Frame => ({
  t: 1.3,
  still: false,
  mood: 'idle',
  moodAge: 0.1,
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
  pose: {
    ...POSE,
    ...patch.pose,
    rear: patch.pose?.rear ?? rearFor(patch.mood ?? 'idle', !!patch.hold),
  },
})

/** The resting ball at size 1, in local units. */
export const HOLD = { x: 12, y: -21, r: 7 }
/** A frame holding the ball. */
export const held = (patch: FramePatch = {}) => frame({ hold: HOLD, holding: true, ...patch })

export const MOODS: Mood[] = [
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
export const EYES: EyeStyle[] = ['normal', 'happy', 'squeeze', 'wide', 'xx']

/** Hold-mood poses as the avatar sets them (idle, watch, aim high and low, worried). */
export const HOLD_POSES: Array<[Mood, Partial<Pose>]> = [
  ['idle', {}],
  ['watch', { sF: 0.5, eF: 1.7, sB: -0.3, eB: 1.9, lean: 0.08 }],
  ['aim', { crouch: 0.35, lean: -0.08, sF: -2.3, eF: 1.7, sB: 2.6, eB: 0.15 }],
  ['aim', { crouch: 0.35, lean: -0.08, sF: -2.3, eF: 1.7, sB: 1.6, eB: 0.15 }],
  ['worried', { sF: 0.8, eF: 2.3, sB: -0.6, eB: 2.3, crouch: 0.2 }],
]

/**
 * About 40 draws per variant: every mood once, the other eye styles on idle, still × fidget on the moods with
 * one-shots, and a cheer at three ages. Moods are drawn with their own pose fall (KO lies down).
 */
export const DRAW_CASES: FramePatch[] = [
  ...MOODS.map((mood) => ({ mood })),
  ...EYES.filter((e) => e !== 'normal').map((eyes) => ({ eyes })),
  ...(['idle', 'cheer', 'pump', 'hurt', 'ko'] as Mood[]).flatMap((mood) =>
    [false, true].flatMap((still) => [0, 0.5].map((fidget) => ({ mood, still, fidget, moodAge: 0.3 }))),
  ),
  ...[0.05, 0.6, 1.5].map((moodAge) => ({ mood: 'cheer' as Mood, moodAge })),
]
export const caseFrame = (c: FramePatch) =>
  frame({ moodAge: 0.4, ...c, pose: { fall: c.mood === 'ko' ? 1 : 0 } })

/** A kit that records what the body asks it to draw (hands come from the solver, as in the avatar). */
export function kitFor(body: BodyType, look: CreatureLook, f: Frame) {
  const m = body.metrics(look, f)
  const calls: string[] = []
  const kit: DrawKit = {
    metrics: m,
    hands: solveHands(m, body.pose?.(look, f) ?? f.pose, f.hold, f.holding),
    backHand: () => calls.push('back'),
    frontHand: () => calls.push('front'),
    hat: () => calls.push('hat'),
    emblem: () => calls.push('emblem'),
  }
  return { kit, calls }
}
/** Everything a draw sends to the canvas, as text (to compare frames). */
export const drawLog = (body: BodyType, look: CreatureLook, f: Frame) => {
  const c = fakeCanvas()
  body.draw(c, look, f, kitFor(body, look, f).kit)
  return JSON.stringify(c.log)
}
export const handsOf = (body: BodyType, look: CreatureLook, f: Frame) =>
  solveHands(body.metrics(look, f), body.pose?.(look, f) ?? f.pose, f.hold, f.holding)

/** Distance from a point to a box (0 inside). */
export const toBox = (p: { x: number; y: number }, b: Rect) =>
  Math.hypot(Math.max(b.x - p.x, 0, p.x - (b.x + b.w)), Math.max(b.y - p.y, 0, p.y - (b.y + b.h)))

export const actx = (patch: Partial<AvatarContext> = {}): AvatarContext => ({
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
export const run = (a: HeroAvatar, seconds: number, c = actx()) => {
  for (let t = 0; t < seconds; t += 1 / 60) a.update(1 / 60, c)
}

/**
 * The worst distance between the drawn front hand and the held ball through a real HeroAvatar, at homeX 100 and 300
 * (mirrored), sizes 1 and 1.35, sampled three times while idle (null if a hand was missing or the mood left idle).
 */
export function worstHold(id: HeroId): number | null {
  let worst = 0
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
      if (a.mood !== 'idle') return null
      a.draw(fakeCanvas(), 760)
      const front = a.lastHands?.front
      if (!front) return null
      worst = Math.max(worst, Math.hypot(front.x - h.x, front.y - h.y))
    }
  }
  return worst
}
