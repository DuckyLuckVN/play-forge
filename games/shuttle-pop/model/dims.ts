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
