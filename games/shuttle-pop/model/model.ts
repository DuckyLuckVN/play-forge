// One merged geometry per bone for a look, built once and shared by every chibi wearing it.

import type { BufferGeometry } from 'three'
import { foreArmParts, handParts, hipsParts, shinParts, thighParts, torsoParts, upperArmParts } from './body'
import { faceGeometry } from './face'
import { headParts } from './head'
import type { Look } from './look'
import { mergeParts } from './merge'
import { racketParts } from './racket'

/** Bone geometries. Arm pairs: [0] = right (racket, −x), [1] = left. */
export interface ModelGeos {
  torso: BufferGeometry
  hips: BufferGeometry
  head: BufferGeometry
  /** Morphing face decals (face.ts MORPHS). */
  face: BufferGeometry
  upperArm: BufferGeometry
  foreArm: [BufferGeometry, BufferGeometry]
  hand: [BufferGeometry, BufferGeometry]
  thigh: BufferGeometry
  shin: BufferGeometry
  racket: BufferGeometry
}

const cache = new Map<Look, ModelGeos>()

export function modelOf(l: Look): ModelGeos {
  let m = cache.get(l)
  if (!m) {
    m = {
      torso: mergeParts(torsoParts(l)),
      hips: mergeParts(hipsParts(l)),
      head: mergeParts(headParts(l)),
      face: faceGeometry(l),
      upperArm: mergeParts(upperArmParts(l)),
      foreArm: [mergeParts(foreArmParts(l, -1)), mergeParts(foreArmParts(l, 1))],
      hand: [mergeParts(handParts(l, -1)), mergeParts(handParts(l, 1))],
      thigh: mergeParts(thighParts(l)),
      shin: mergeParts(shinParts(l)),
      racket: mergeParts(racketParts(l)),
    }
    cache.set(l, m)
  }
  return m
}
