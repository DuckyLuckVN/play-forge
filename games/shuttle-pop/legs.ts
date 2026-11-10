// Leg joint angles (pure): hip pitch / roll and knee bend per leg, plus how far the rig drops so a bent
// leg still reaches the ground. Badminton footwork (footwork.ts picks the gait): short scissor steps
// forward / back with the back-swing knee folding, a side shuffle (chassé: the lead foot steps out, the
// trail foot closes up behind it, never crossing, a little hop each cycle), the lunge (racket-side knee
// bent in front, back leg extended), splay, mid-air tuck and the knees-bent stance / crouch.
//
// Conventions (rig space, facing +z): hipX > 0 swings the foot back, knee > 0 folds the shin back
// (never negative), hipZ rolls the leg sideways (+ moves the foot toward +x). Index 0 = right leg (−x,
// racket side), 1 = left.

import { HIP_X, LEG } from './model/dims'

export interface LegIn {
  /** sin(2π stride) and stride amplitude (rad). */
  cycle: number
  amp: number
  /** Share of the move along the facing / across it (0..1). */
  along: number
  across: number
  /** Mid-air knees-up (rad). */
  tuck: number
  /** Legs apart (rad). */
  splay: number
  /** Crouch: knees bend, hips flex forward, the body lowers (rad of hip flex). */
  bend: number
  /** Stride phase (cycles) and side of the move (+1 toward local +x, −1 toward −x): the shuffle. */
  phase: number
  dir: number
  /** Lunge weight 0..1. */
  lunge: number
}

export interface LegOut {
  hipX: [number, number]
  hipZ: [number, number]
  knee: [number, number]
  /** Rig lowering (m) that keeps a crouched foot on the ground. */
  drop: number
  /** Rig lift (m): the shuffle's little hop. */
  lift: number
}

/** Knee fold per rad of back swing / tuck / crouch flex. */
const KNEE = { swing: 1.2, tuck: 1.6, bend: 1.7 }
/**
 * Shuffle: hip roll (rad) per rad of stride amplitude, how far (cycles) the trail foot follows the lead
 * one, hop height (m) at full amplitude.
 */
export const SHUFFLE = { roll: 0.36, lag: 0.25, hop: 0.03, fullAmp: 0.5 }
/** Lunge pose: front (right) hip / knee, back (left) hip / knee, hip roll out (rad). */
export const LUNGE_LEGS = { frontHip: -1.3, frontKnee: 1.75, backHip: 0.95, backKnee: 0.1, roll: 0.1 }
const TAU = Math.PI * 2

export function legOut(): LegOut {
  return { hipX: [0, 0], hipZ: [0, 0], knee: [0, 0], drop: 0, lift: 0 }
}

/** How much shorter (vertically) a leg with this hip pitch and knee bend is than a straight one (m). */
export function kneeDrop(hipX: number, knee: number): number {
  return LEG.thigh + LEG.shin - (LEG.thigh * Math.cos(hipX) + LEG.shin * Math.cos(hipX + knee))
}

/** Sideways position (m, rig space) of leg `k`'s foot for these angles (hip order XYZ: roll first). */
export function footX(k: 0 | 1, o: LegOut): number {
  return (k === 0 ? -HIP_X : HIP_X) + (LEG.thigh + LEG.shin * Math.cos(o.knee[k])) * Math.sin(o.hipZ[k])
}

export function legAngles(i: LegIn, out: LegOut): LegOut {
  const swing = i.cycle * i.amp * i.along
  const bend = Math.max(0, i.bend)
  for (let k = 0; k < 2; k++) {
    const sw = k === 0 ? swing : -swing
    const tuck = k === 0 ? i.tuck : i.tuck * 0.5
    out.hipX[k] = sw - tuck - bend
    out.knee[k] = KNEE.swing * Math.max(0, sw) + KNEE.tuck * Math.max(0, tuck) + KNEE.bend * bend
  }
  // Chassé: the lead foot (toward the move) swings out and back each cycle, the trail one does the same
  // `lag` later, so the gap opens then closes but the feet never pass each other.
  const roll = SHUFFLE.roll * i.amp * i.across
  const dir = i.dir < 0 ? -1 : 1
  const lead = dir * roll * Math.sin(TAU * i.phase)
  const trail = dir * roll * Math.sin(TAU * (i.phase - SHUFFLE.lag))
  out.hipZ[0] = -i.splay + (dir > 0 ? trail : lead)
  out.hipZ[1] = i.splay + (dir > 0 ? lead : trail)
  // The hop peaks as the trail foot closes up (the gap is smallest).
  const hopAmp = Math.min(1, i.amp / SHUFFLE.fullAmp) * i.across
  out.lift = SHUFFLE.hop * hopAmp * (1 - Math.cos(TAU * (i.phase - 0.5 - SHUFFLE.lag / 2))) * 0.5
  let drop = kneeDrop(-bend, KNEE.bend * bend)

  const l = Math.min(1, Math.max(0, i.lunge))
  if (l > 0) {
    const L = LUNGE_LEGS
    out.hipX[0] += (L.frontHip - out.hipX[0]) * l
    out.knee[0] += (L.frontKnee - out.knee[0]) * l
    out.hipX[1] += (L.backHip - out.hipX[1]) * l
    out.knee[1] += (L.backKnee - out.knee[1]) * l
    out.hipZ[0] += (-L.roll - out.hipZ[0]) * l
    out.hipZ[1] += (L.roll - out.hipZ[1]) * l
    out.lift *= 1 - l
    // The longer (vertically) leg stands on the ground.
    const stand = Math.min(kneeDrop(out.hipX[0], out.knee[0]), kneeDrop(out.hipX[1], out.knee[1]))
    drop += (stand - drop) * l
  }
  out.drop = drop
  return out
}
