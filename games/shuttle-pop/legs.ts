// Leg joint angles (pure): hip pitch / roll and knee bend per leg, plus how far the rig drops so a bent
// leg still reaches the ground. Simple driving for now (run scissor + back-swing knee, shuffle, splay,
// mid-air tuck, crouch bend); footwork can replace `legAngles` without touching the rig.
//
// Conventions (rig space, facing +z): hipX > 0 swings the foot back, knee > 0 folds the shin back
// (never negative), hipZ rolls the leg sideways. Index 0 = right leg (−x), 1 = left.

import { LEG } from './model/dims'

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
}

export interface LegOut {
  hipX: [number, number]
  hipZ: [number, number]
  knee: [number, number]
  /** Rig lowering (m) that keeps a crouched foot on the ground. */
  drop: number
}

/** Knee fold per rad of back swing / tuck / crouch flex. */
const KNEE = { swing: 1.2, tuck: 1.6, bend: 1.7 }

export function legOut(): LegOut {
  return { hipX: [0, 0], hipZ: [0, 0], knee: [0, 0], drop: 0 }
}

/** How much shorter (vertically) a leg with this hip pitch and knee bend is than a straight one (m). */
export function kneeDrop(hipX: number, knee: number): number {
  return LEG.thigh + LEG.shin - (LEG.thigh * Math.cos(hipX) + LEG.shin * Math.cos(hipX + knee))
}

export function legAngles(i: LegIn, out: LegOut): LegOut {
  const swing = i.cycle * i.amp * i.along
  const shuffle = i.cycle * i.amp * 0.45 * i.across
  const bend = Math.max(0, i.bend)
  for (let k = 0; k < 2; k++) {
    const sw = k === 0 ? swing : -swing
    const tuck = k === 0 ? i.tuck : i.tuck * 0.5
    out.hipX[k] = sw - tuck - bend
    out.knee[k] = KNEE.swing * Math.max(0, sw) + KNEE.tuck * Math.max(0, tuck) + KNEE.bend * bend
  }
  out.hipZ[0] = -i.splay - shuffle
  out.hipZ[1] = i.splay - shuffle
  out.drop = kneeDrop(-bend, KNEE.bend * bend)
  return out
}
