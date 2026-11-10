// What a character looks like, as data. Every body part is picked from a builder table by key (head.ts,
// body.ts, face.ts, racket.ts), so a new character (a new species included: other head shape, ears,
// muzzle, paws, feet, a tail) is a new preset row plus, if needed, a new builder under a new key. The
// rig and the animations never change.

export type HeadKind = 'round'
export type EarKind = 'human' | 'none'
export type MuzzleKind = 'none'
/** Hair + headwear. */
export type StyleKind = 'bowPigtails' | 'capFringe' | 'bandSpiky' | 'beanieBob'
export type FaceKind = 'chibi'
export type HandKind = 'mitten'
export type FootKind = 'sneaker'
/** Attached to the hips bone (no extra draw call: merged into the shorts / skirt mesh). */
export type TailKind = 'none'

/** Badminton kit colours. */
export interface Kit {
  shirt: number
  /** Collar, sleeve cuffs, skirt hem. */
  trim: number
  /** Chest stripe, wristband, racket frame. */
  stripe: number
  bottom: 'shorts' | 'skirt'
  bottomColor: number
  socks: number
  shoe: number
  sole: number
  /** Racket grip tape. */
  tape: number
}

export interface Look {
  /** Skin or fur. */
  skin: number
  hair: number
  /** Lower iris tint. */
  iris: number
  head: HeadKind
  ears: EarKind
  muzzle: MuzzleKind
  style: StyleKind
  face: FaceKind
  hands: HandKind
  feet: FootKind
  tail: TailKind
  kit: Kit
}
