// What a character looks like, as data. Every body part is picked from a builder table by key (head.ts,
// body.ts, face.ts, extras.ts, racket.ts), so a new character (a new species included: other head shape,
// ears, muzzle, paws, feet, a tail, no legs at all) is a new preset row plus, if needed, a new builder
// under a new key. The rig and the animations never change.

/** Head shape (chibi: the round head with fuller cheeks + a tiny nose). The face decals follow it (face.ts surfaces). */
export type HeadKind = 'round' | 'chibi' | 'box'
/** Static ears merged into the head mesh. Animated ears are extras (extras.ts). */
export type EarKind = 'human' | 'none' | 'panda' | 'bolt'
/** A snout bump on the face (the mouth decal sits on it). */
export type MuzzleKind = 'none' | 'cat' | 'fox' | 'panda' | 'dragon'
/** Hair + headwear (+ anything else worn on the head). */
export type StyleKind =
  | 'bowPigtails'
  | 'capFringe'
  | 'bandSpiky'
  | 'beanie'
  | 'tabby'
  | 'tuft'
  | 'leaf'
  | 'foxFringe'
  | 'horns'
  | 'drop'
  | 'visor'
  | 'wisp'
/**
 * Human chibi (toy eyes; + lashes); animal (nose + cat mouth), + whiskers (kitty), + eye patches (panda); glowing eyes on a
 * dark visor (robot); browless jelly / ghost faces.
 */
export type FaceKind = 'chibi' | 'chibiLash' | 'animal' | 'kitty' | 'panda' | 'visor' | 'jelly' | 'ghost'
export type HandKind = 'mitten' | 'paw' | 'claw' | 'metal' | 'nub'
export type FootKind = 'sneaker' | 'paw' | 'claw' | 'boot'
/** Torso + hips shape. */
export type BodyKind = 'human' | 'chubby' | 'dragon' | 'robot' | 'slime' | 'ghost'
/** Two jointed legs, or none: a hopping blob or a floating sheet (hips chains hidden). */
export type LegKind = 'pair' | 'hop' | 'float'
/** Animated extra bones (own mesh + pose channel): tails, ears, wings, an antenna. */
export type ExtraKind =
  | 'catEars'
  | 'bunnyEars'
  | 'foxEars'
  | 'catTail'
  | 'bunnyTail'
  | 'foxTail'
  | 'dragonTail'
  | 'wings'
  | 'antenna'

/** Badminton kit colours (optional: animals may wear one, creatures don't). */
export interface Kit {
  shirt: number
  /** Collar and sleeve cuffs. */
  trim: number
  /** Contrast stripes: shirt hem + sleeves (human), chest band (animal), shorts hem + sides, skirt hem. */
  stripe: number
  bottom: 'shorts' | 'skirt'
  bottomColor: number
}

/** Socks and sneakers (the 'sneaker' feet). */
export interface Shoes {
  socks: number
  shoe: number
  sole: number
}

export interface Look {
  /** Skin, fur, scales, jelly, metal or sheet. */
  skin: number
  /** Arms + legs when they differ from `skin`. */
  limb?: number
  /** Light patches: belly, muzzle, inner ears, tail tip. */
  belly?: number
  hair: number
  /** Lower iris tint. */
  iris: number
  /** Nose decal colour (animal faces; dark when unset). */
  nose?: number
  /** Headwear accent, wristband, sock ring, racket frame. */
  accent: number
  /** Racket grip tape. */
  grip: number
  body: BodyKind
  legs: LegKind
  head: HeadKind
  ears: EarKind
  muzzle: MuzzleKind
  style: StyleKind
  face: FaceKind
  hands: HandKind
  feet: FootKind
  extras: readonly ExtraKind[]
  kit?: Kit
  shoes?: Shoes
}

/** The arm / leg colour. */
export const limbOf = (l: Look): number => l.limb ?? l.skin
/** The light patch colour. */
export const bellyOf = (l: Look): number => l.belly ?? l.skin
/** No legs: the hips chains are hidden and the body hops or floats. */
export const legless = (l: Look): boolean => l.legs !== 'pair'
