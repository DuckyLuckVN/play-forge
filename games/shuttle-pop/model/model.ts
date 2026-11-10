// One merged geometry per bone for a look, built once (cached by preset id) and shared by every chibi
// wearing it. Racket geometry is shared by every look with the same frame / grip colours.

import { BufferAttribute, BufferGeometry, SphereGeometry } from 'three'
import { foreArmParts, handParts, hipsParts, shinParts, thighParts, torsoParts, upperArmParts } from './body'
import { EXTRAS, type ExtraSpec } from './extras'
import { faceGeometry } from './face'
import { headParts } from './head'
import { legless, type Look } from './look'
import { mergeParts, part, type MergeOpts, type Part } from './merge'
import { HEAD_R, HEAD_Y, HIP_Y } from './dims'
import { racketParts } from './racket'

/** Twin outline width (m): the far twin's back-faced shell is the head pushed out this much. */
export const OUTLINE_W = 0.022

export interface ExtraGeo {
  spec: ExtraSpec
  geo: BufferGeometry
  /** Unlit light parts (spec.glow), or null. */
  glow: BufferGeometry | null
  /** Twin outline shell (head extras only: ears, antenna), or null. */
  hull: BufferGeometry | null
}

/** Bone geometries. Arm pairs: [0] = right (racket, −x), [1] = left. */
export interface ModelGeos {
  torso: BufferGeometry
  hips: BufferGeometry
  head: BufferGeometry
  /** Morphing face decals (face.ts MORPHS). */
  face: BufferGeometry
  /** Twin outline: the head mesh (hair, hats, ears, horns) pushed out along its normals. */
  hull: BufferGeometry
  upperArm: BufferGeometry
  foreArm: [BufferGeometry, BufferGeometry]
  hand: [BufferGeometry, BufferGeometry]
  /** Empty for a legless look (the hips chains are hidden). */
  thigh: BufferGeometry
  shin: BufferGeometry
  racket: BufferGeometry
  extras: ExtraGeo[]
}

/** The look a model is built from, with the id it is cached under. */
export interface ModelSource {
  id: number
  look: Look
}

const cache = new Map<number, ModelGeos>()
/** Baked creases (ao.ts) on every bone but the racket. */
const AO: MergeOpts = { ao: {} }
/** The head at rest over the torso (torso space), shading the neck. */
const neckShade = (): Part[] => [part(new SphereGeometry(HEAD_R, 24, 16), 0, { p: [0, HEAD_Y - HIP_Y, 0] })]
const rackets = new Map<string, BufferGeometry>()
const EMPTY = new BufferGeometry()
EMPTY.setAttribute('position', new BufferAttribute(new Float32Array(0), 3))

/** A copy of `geo` (position only, same index) with every vertex pushed `w` along its normal. */
export function inflate(geo: BufferGeometry, w: number): BufferGeometry {
  const P = geo.getAttribute('position')
  const N = geo.getAttribute('normal')
  const pos = new Float32Array(P.count * 3)
  for (let i = 0; i < P.count; i++) {
    pos[i * 3] = P.getX(i) + N.getX(i) * w
    pos[i * 3 + 1] = P.getY(i) + N.getY(i) * w
    pos[i * 3 + 2] = P.getZ(i) + N.getZ(i) * w
  }
  const out = new BufferGeometry()
  out.setAttribute('position', new BufferAttribute(pos, 3))
  out.setIndex(geo.getIndex()!.clone())
  out.computeBoundingSphere()
  return out
}

export function modelOf(src: ModelSource): ModelGeos {
  let m = cache.get(src.id)
  if (!m) {
    const l = src.look
    const head = mergeParts(headParts(l), AO)
    const rk = `${l.accent}:${l.grip}`
    let racket = rackets.get(rk)
    if (!racket) rackets.set(rk, (racket = mergeParts(racketParts(l))))
    const legs = !legless(l)
    m = {
      // The neck sits in the head's shadow, the shorts' top under the shirt hem.
      torso: mergeParts(torsoParts(l), { ao: { extra: neckShade() } }),
      hips: mergeParts(hipsParts(l), { ao: { extra: torsoParts(l) } }),
      head,
      face: faceGeometry(l),
      hull: inflate(head, OUTLINE_W),
      upperArm: mergeParts(upperArmParts(l), AO),
      foreArm: [mergeParts(foreArmParts(l, -1), AO), mergeParts(foreArmParts(l, 1), AO)],
      hand: [mergeParts(handParts(l, -1), AO), mergeParts(handParts(l, 1), AO)],
      thigh: legs ? mergeParts(thighParts(l), AO) : EMPTY,
      shin: legs ? mergeParts(shinParts(l), AO) : EMPTY,
      racket,
      extras: l.extras.map((k) => {
        const spec: ExtraSpec = EXTRAS[k]
        const geo = mergeParts(spec.parts(l), AO)
        return {
          spec,
          geo,
          glow: spec.glow ? mergeParts(spec.glow(l)) : null,
          hull: spec.parent === 'head' ? inflate(geo, OUTLINE_W) : null,
        }
      }),
    }
    cache.set(src.id, m)
  }
  return m
}
