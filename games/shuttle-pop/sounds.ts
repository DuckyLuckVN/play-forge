// Shuttle Pop sound effects (synthesised, see @forge/audio/sound). Music is the stock ARCADE track.
import type { Sound, Tone } from '@forge/audio/sound'
import { levelStep, soundSteps, type ToneRecipe } from '@forge/audio/recipe'
import { CHARGE } from './charge'
import { isPowerHit } from './power'
import type { Grade, ShotKind } from './shots'
import type { SpEvent } from './sim'
import type { AbilityKind } from './ability'

const SMASH: Tone[] = [
  { freq: 4000, to: 300, dur: 0.16, wave: 'noise', vol: 0.65 },
  { freq: 220, to: 70, dur: 0.18, wave: 'square', vol: 0.25 },
  { freq: 1320, to: 660, dur: 0.08, wave: 'triangle', vol: 0.3 },
]
export const SHUTTLE_SOUNDS = {
  /** Charging: a whirr per stage (CHARGE.steps), each a step higher, then a bright ting at full. */
  charge1: [
    { freq: 220, to: 300, dur: 0.14, wave: 'triangle', vol: 0.14 },
    { freq: 500, to: 1100, dur: 0.14, wave: 'noise', vol: 0.08 },
  ],
  charge2: [
    { freq: 330, to: 470, dur: 0.14, wave: 'triangle', vol: 0.17 },
    { freq: 800, to: 1800, dur: 0.14, wave: 'noise', vol: 0.1 },
  ],
  chargeFull: [
    { freq: 1760, dur: 0.22, wave: 'sine', vol: 0.3 },
    { freq: 2637, dur: 0.3, wave: 'sine', vol: 0.18, at: 0.03 },
    { freq: 520, to: 700, dur: 0.12, wave: 'triangle', vol: 0.14 },
  ],
  /** Strings + cork: a short plucky pop, brighter with a better grade. */
  late: [
    { freq: 520, to: 300, dur: 0.07, wave: 'triangle', vol: 0.35 },
    { freq: 900, to: 400, dur: 0.05, wave: 'noise', vol: 0.2 },
  ],
  good: [
    { freq: 880, to: 520, dur: 0.07, wave: 'triangle', vol: 0.4 },
    { freq: 1800, to: 900, dur: 0.05, wave: 'noise', vol: 0.25 },
  ],
  perfect: [
    { freq: 1175, to: 880, dur: 0.06, wave: 'triangle', vol: 0.45 },
    { freq: 2400, to: 1200, dur: 0.05, wave: 'noise', vol: 0.25 },
    { freq: 1568, dur: 0.06, wave: 'sine', vol: 0.3, at: 0.05 },
    { freq: 2093, dur: 0.12, wave: 'sine', vol: 0.28, at: 0.1 },
  ],
  smash: SMASH,
  /** Full-charge Perfect smash: the crack, a punchy low boom and the crowd's "ooh". */
  powerSmash: [
    ...SMASH,
    { freq: 95, to: 38, dur: 0.38, wave: 'sine', vol: 0.45 },
    { freq: 260, to: 60, dur: 0.12, wave: 'square', vol: 0.18 },
    { freq: 700, to: 1000, dur: 0.55, wave: 'noise', vol: 0.2, at: 0.12 },
    { freq: 380, to: 300, dur: 0.5, wave: 'triangle', vol: 0.05, at: 0.14 },
  ],
  /** Power-hit sting (after the onset, so it never adds to the peak): a bright rising ping + air. */
  powerSting: [
    { freq: 1320, to: 2640, dur: 0.18, wave: 'sine', vol: 0.22, at: 0.06 },
    { freq: 1976, dur: 0.25, wave: 'triangle', vol: 0.12, at: 0.09 },
    { freq: 6000, to: 9000, dur: 0.2, wave: 'noise', filter: 'highpass', vol: 0.1, at: 0.06 },
  ],
  /** Hop: a rising air puff + a small lift. */
  jump: [
    { freq: 600, to: 1800, dur: 0.14, wave: 'noise', filter: 'bandpass', q: 1.2, vol: 0.25 },
    { freq: 200, to: 420, dur: 0.1, wave: 'sine', vol: 0.18 },
  ],
  jumpLand: [
    { freq: 110, to: 45, dur: 0.16, wave: 'sine', vol: 0.42 },
    { freq: 500, to: 120, dur: 0.1, wave: 'noise', filter: 'lowpass', vol: 0.3 },
  ],
  /** Lunge: a falling whoosh. */
  dive: [
    { freq: 1400, to: 400, dur: 0.22, wave: 'noise', filter: 'bandpass', q: 0.8, vol: 0.32 },
    { freq: 300, to: 150, dur: 0.12, wave: 'triangle', vol: 0.12 },
  ],
  /** Belly-flop thud + a skid. */
  diveLand: [
    { freq: 120, to: 50, dur: 0.18, wave: 'sine', vol: 0.38 },
    { freq: 700, to: 150, dur: 0.26, wave: 'noise', filter: 'lowpass', vol: 0.36 },
  ],
  /** Stun: a dull knock, then two stars twinkling. */
  bonk: [
    { freq: 480, to: 240, dur: 0.08, wave: 'square', vol: 0.28 },
    { freq: 900, to: 300, dur: 0.1, wave: 'triangle', vol: 0.3 },
    { freq: 2349, dur: 0.08, wave: 'sine', vol: 0.14, at: 0.1 },
    { freq: 2793, dur: 0.1, wave: 'sine', vol: 0.14, at: 0.17 },
  ],
  serve: { freq: 700, to: 480, dur: 0.06, wave: 'triangle', vol: 0.3 },
  net: [
    { freq: 300, to: 90, dur: 0.16, wave: 'noise', vol: 0.45 },
    { freq: 140, to: 80, dur: 0.14, wave: 'sine', vol: 0.35 },
  ],
  land: { freq: 1200, to: 500, dur: 0.05, wave: 'noise', vol: 0.3 },
  pointWin: [
    { freq: 659, dur: 0.08, wave: 'square', vol: 0.14 },
    { freq: 784, dur: 0.08, wave: 'square', vol: 0.14, at: 0.08 },
    { freq: 1047, dur: 0.18, wave: 'square', vol: 0.14, at: 0.16 },
  ],
  pointLose: [
    { freq: 523, dur: 0.1, wave: 'triangle', vol: 0.25 },
    { freq: 392, to: 370, dur: 0.22, wave: 'triangle', vol: 0.25, at: 0.1 },
  ],
  /** Crowd roar after a long rally: wide noise swell. */
  cheer: [
    { freq: 1800, to: 2600, dur: 0.6, wave: 'noise', vol: 0.3 },
    { freq: 900, to: 1400, dur: 0.8, wave: 'noise', vol: 0.22, at: 0.05 },
  ],
} satisfies Record<string, Sound>

/** The opponent's racket sounds are a little further away. */
const THEIRS = 0.7
const POWER_VOL = 0.15
export const HIT_STEPS = 5

/** Low body under the strings' pop, grows with power (non-smash shots). */
const HIT_BODY: readonly ToneRecipe[] = [
  { freq: [200, 150], to: [80, 55], dur: [0.1, 0.16], vol: [0, 0.4], wave: 'sine' },
  { freq: [1600, 1200], to: 300, dur: 0.07, vol: [0, 0.2], wave: 'noise', filter: 'lowpass' },
]
/** Sub-thump under the smash crack, grows with power. */
const SMASH_SUB: readonly ToneRecipe[] = [
  { freq: [110, 90], to: [50, 36], dur: [0.18, 0.34], vol: [0, 0.36], wave: 'sine' },
  { freq: 260, to: 60, dur: 0.1, vol: [0, 0.12], wave: 'square' },
]
/** The smash hitting the floor: a thump after the land tick, heavier the harder it was hit. */
const SMASH_THUMP: readonly ToneRecipe[] = [
  { freq: [90, 75], to: [45, 32], dur: [0.2, 0.34], vol: [0.3, 0.5], wave: 'sine' },
  { freq: [500, 700], to: 90, dur: [0.1, 0.16], vol: [0.2, 0.32], wave: 'noise', filter: 'lowpass' },
]

const GRADES: readonly Grade[] = ['late', 'good', 'perfect']
const BODY_STEPS = soundSteps(HIT_BODY, HIT_STEPS)
const SUB_STEPS = soundSteps(SMASH_SUB, HIT_STEPS)
const TOP = HIT_STEPS - 1

/** Per grade / smash: the base hit with each power step's layers (built once; index 0 unused: the base itself). */
const HIT_LAYERS = {
  smash: SUB_STEPS.map((s) => [...SHUTTLE_SOUNDS.smash, ...s]),
  ...Object.fromEntries(GRADES.map((g) => [g, BODY_STEPS.map((s) => [...SHUTTLE_SOUNDS[g], ...s])])),
} as Record<Grade | 'smash', Tone[][]>
/** A power hit: top-step layers + the sting. A power smash already has its boom: the sting on top. */
const POWER_HIT = {
  smash: [...SHUTTLE_SOUNDS.powerSmash, ...SHUTTLE_SOUNDS.powerSting],
  ...Object.fromEntries(GRADES.map((g) => [g, [...HIT_LAYERS[g][TOP], ...SHUTTLE_SOUNDS.powerSting]])),
} as Record<Grade | 'smash', Tone[]>
/** A smash landing: the land tick first, then the thump for that smash's power step. */
export const SMASH_LAND: readonly Tone[][] = soundSteps(SMASH_THUMP, HIT_STEPS).map((s) => [
  SHUTTLE_SOUNDS.land,
  ...s,
])

const clamp01 = (t: number) => (t > 0 ? (t < 1 ? t : 1) : 0) // NaN → 0

/** The last hit's shot and power: what a landing sounds like (one reused object, see render3d). */
export type LastShot = { shot: ShotKind; power: number }

/**
 * A hit's sound + volume. Power 0 / missing = today's sound (same object); more power adds body (or a
 * smash's sub-thump) and volume; a power hit (isPowerHit) adds the sting, and the power smash is not
 * boosted on top (its layers are the boost). Opponent hits stay quieter.
 */
export function hitSound(
  shot: ShotKind,
  grade: Grade,
  power: number | undefined,
  mine: boolean,
): { sound: Sound; vol: number } {
  const key = shot === 'smash' ? 'smash' : grade
  const step = levelStep(power ?? 0, HIT_STEPS)
  const powered = isPowerHit(power)
  const sound = powered
    ? POWER_HIT[key]
    : step === 0
      ? key === 'smash'
        ? SHUTTLE_SOUNDS.smash
        : SHUTTLE_SOUNDS[key]
      : HIT_LAYERS[key][step]
  const boost = powered ? 1 : 1 + POWER_VOL * clamp01(power ?? 0)
  return { sound, vol: (mine ? 1 : THEIRS) * boost }
}

/**
 * Racket through the air, plays on the release itself (before the state comes back). Level = charge:
 * a tap is a short airy whoosh + soft body; full charge is a long deep whoosh, a heavy body and a
 * high rip on the front edge (the rip only exists once charged).
 */
const SWING_RECIPE: readonly ToneRecipe[] = [
  {
    freq: [2600, 1500],
    to: [700, 260],
    dur: [0.12, 0.22],
    vol: [0.24, 0.42],
    wave: 'noise',
    filter: 'bandpass',
    q: [0.9, 0.6],
  },
  { freq: [190, 120], to: [90, 50], dur: [0.08, 0.18], vol: [0.08, 0.3], wave: 'sine' },
  {
    freq: [3000, 2400],
    to: [5000, 4200],
    dur: 0.1,
    vol: [0, 0.16],
    at: [0.02, 0.03],
    wave: 'noise',
    filter: 'highpass',
  },
]
export const SWING_STEPS = 5
/** The swing at each charge step (built once). */
export const SWING: readonly Tone[][] = soundSteps(SWING_RECIPE, SWING_STEPS)

/** The release whoosh for a swing charged `charge` (0 = a tap). */
export function swingSound(charge: number): Sound {
  return SWING[levelStep(charge, SWING_STEPS)]
}

export type ActionSoundKind = 'jump' | 'jumpLand' | 'dive' | 'diveLand' | 'bonk'

/**
 * A movement-ability sound + volume (slices 7-8 trigger these). `mine` = it's the local player's own
 * action; for a bonk, the local player is the one bonked or bonking. Others' are a little quieter.
 */
export function actionSound(kind: ActionSoundKind, mine: boolean): { sound: Sound; vol: number } {
  return { sound: SHUTTLE_SOUNDS[kind], vol: mine ? 1 : THEIRS }
}

/** Hops (the button with no target) sound at this share of a jump. */
const HOP_VOL = 0.5

/** An ability start / landing (sim `act` / `actLand`): a lunge dives, a jump or hop jumps (a hop softer). */
export function abilitySound(
  k: 'act' | 'actLand',
  act: AbilityKind,
  mine: boolean,
): { sound: Sound; vol: number } {
  const lunge = act === 'lunge'
  const s = actionSound(k === 'act' ? (lunge ? 'dive' : 'jump') : lunge ? 'diveLand' : 'jumpLand', mine)
  if (act === 'hop') s.vol *= HOP_VOL
  return s
}

const CHARGE_STAGES: readonly Sound[] = [
  SHUTTLE_SOUNDS.charge1,
  SHUTTLE_SOUNDS.charge2,
  SHUTTLE_SOUNDS.chargeFull,
]

/** The sound for reaching charge stage `stage` (charge.ts chargeStage; 0 = nothing yet → null). */
export function chargeSound(stage: number): Sound | null {
  if (stage <= 0) return null
  return CHARGE_STAGES[Math.min(stage, CHARGE.steps.length) - 1]
}

/**
 * The sound for one new sim event, from `localSide`'s point of view (spectators: side 0), with its
 * volume. Null = silent (a whiff: the swing already whooshed). `localId` = the local player's id (a
 * bonk is full volume when they bonked or were bonked; none = spectator, quieter).
 */
export function eventSound(
  e: SpEvent,
  localSide: 0 | 1,
  last?: LastShot | null,
  localId?: string,
): { sound: Sound; vol: number } | null {
  switch (e.k) {
    case 'hit':
      return hitSound(e.shot, e.grade, e.power, e.side === localSide)
    case 'serve':
      return { sound: SHUTTLE_SOUNDS.serve, vol: e.side === localSide ? 1 : THEIRS }
    case 'net':
      return { sound: SHUTTLE_SOUNDS.net, vol: 1 }
    case 'land':
      return {
        sound: last?.shot === 'smash' ? SMASH_LAND[levelStep(last.power, HIT_STEPS)] : SHUTTLE_SOUNDS.land,
        vol: e.in ? 1 : 0.6,
      }
    case 'point':
      return { sound: e.side === localSide ? SHUTTLE_SOUNDS.pointWin : SHUTTLE_SOUNDS.pointLose, vol: 1 }
    case 'act':
    case 'actLand':
      return abilitySound(e.k, e.act, e.side === localSide)
    case 'bonk':
      return actionSound('bonk', localId !== undefined && (e.who === localId || e.by === localId))
    case 'whiff':
      return null
  }
}
