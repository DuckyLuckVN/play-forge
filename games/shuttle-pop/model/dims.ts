// Chibi proportions (metres, model space: feet at y = 0, facing +z, right hand on −x). Total height ≈
// 1.32 m, head ≈ 55% of it. Shared by the builders and the rig (actors.ts).

export const HEAD_R = 0.36
/** Head centre. */
export const HEAD_Y = 0.96
/** Hip joints (legs) and the torso pivot. */
export const HIP_Y = 0.24
export const HIP_X = 0.085
export const SHOULDER_Y = 0.535
export const SHOULDER_X = 0.2
/** Arm chain: upper arm / forearm length and radius, mitten centre past the wrist. Short + chubby. */
export const ARM = { upper: 0.1, upperR: 0.056, fore: 0.088, foreR: 0.049, hand: 0.035 }
/** Leg chain: hip → knee, knee → ground (the sole). */
export const LEG = { thigh: 0.11, shin: 0.13 }
/**
 * Racket in the mitten: handle → frame axis tipped `mount` rad forward of the forearm; frame centre and
 * far rim along the handle axis.
 */
export const RACKET = { mount: 0.35, head: 0.42, tip: 0.59 }
/** The joint layout a look's rig is built on (model space, m). */
export interface Rig {
  /** Hip joints + torso pivot height, hip joints' half spacing. */
  hipY: number
  hipX: number
  /** Hip → knee, knee → sole (thigh + shin = hipY: feet on the ground). */
  thigh: number
  shin: number
  shoulderY: number
  shoulderX: number
  /** Head centre. */
  headY: number
}
/** Default rig (animals, creatures). */
export const RIG: Rig = {
  hipY: HIP_Y,
  hipX: HIP_X,
  thigh: LEG.thigh,
  shin: LEG.shin,
  shoulderY: SHOULDER_Y,
  shoulderX: SHOULDER_X,
  headY: HEAD_Y,
}
/**
 * Human rig (the toy reference): longer legs and a wider stance; everything above the hips rides up by
 * the same 7 cm, so the torso, arms and head keep their layout relative to the hips.
 */
export const TALL_RIG: Rig = {
  hipY: 0.31,
  hipX: 0.098,
  thigh: 0.145,
  shin: 0.165,
  shoulderY: SHOULDER_Y + 0.07,
  shoulderX: SHOULDER_X + 0.008,
  headY: HEAD_Y + 0.07,
}

/** Robot head: a rounded box (superellipsoid half sizes, exponent), centred like the round head. */
export const BOX_HEAD = { a: 0.37, b: 0.33, c: 0.34, n: 4 }
