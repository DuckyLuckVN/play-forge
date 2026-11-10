// Body builders: one Part list per bone (torso, hips, upper arm, forearm, hand, thigh, shin + foot),
// picked by the look's keys. Each bone's parts are merged into one mesh by model.ts.

import {
  CapsuleGeometry,
  CylinderGeometry,
  LatheGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three'
import { ARM, HIP_Y, LEG } from './dims'
import type { FootKind, HandKind, Look, TailKind } from './look'
import { part, type Part } from './merge'

const HALF_PI = Math.PI / 2
/** Collar line (world y): shirt below, neck above. */
const NECK_Y = 0.556
/** Chest stripe band (world y). */
const STRIPE = { lo: 0.406, hi: 0.438 }

/** Torso profile (radius, world y), bottom to top; pairs 1 mm apart give the colour bands hard edges. */
const TORSO_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0.165],
  [0.1, 0.17],
  [0.14, 0.19],
  [0.16, 0.23],
  [0.168, 0.29],
  [0.167, 0.35],
  [0.1622, STRIPE.lo - 0.001],
  [0.1618, STRIPE.lo + 0.001],
  [0.1582, STRIPE.hi - 0.001],
  [0.1578, STRIPE.hi + 0.001],
  [0.15, 0.48],
  [0.138, 0.51],
  [0.118, 0.535],
  [0.088, 0.552],
  [0.07, NECK_Y],
  [0.062, NECK_Y + 0.001],
  [0.06, 0.62],
  [0.058, 0.66],
  [0, 0.68],
]

/** Chest + shirt + collar + neck, in the torso bone's space (origin at the hips). */
export function torsoParts(l: Look): Part[] {
  const k = l.kit
  const lathe = new LatheGeometry(
    TORSO_PROFILE.map(([r, y]) => new Vector2(r, y - HIP_Y)),
    28,
  )
  const neckY = NECK_Y - HIP_Y
  const paint = (_x: number, y: number) =>
    y > neckY + 0.0005 ? l.skin : y > STRIPE.lo - HIP_Y && y < STRIPE.hi - HIP_Y ? k.stripe : k.shirt
  const flap = new SphereGeometry(0.04, 10, 6)
  const button = new SphereGeometry(0.009, 6, 4)
  return [
    part(lathe, paint),
    // Polo collar: a rolled ring plus two flaps meeting at the front.
    part(new TorusGeometry(0.074, 0.016, 8, 24), k.trim, { p: [0, neckY - 0.002, 0], r: [HALF_PI, 0, 0] }),
    part(flap, k.trim, { p: [-0.036, neckY - 0.012, 0.066], r: [0.5, 0, 0.5], s: [1, 0.55, 0.3] }),
    part(flap, k.trim, { p: [0.036, neckY - 0.012, 0.066], r: [0.5, 0, -0.5], s: [1, 0.55, 0.3] }),
    part(button, k.trim, { p: [0, 0.52 - HIP_Y, 0.133] }),
    part(button, k.trim, { p: [0, 0.495 - HIP_Y, 0.145] }),
  ]
}

const TAILS: Record<TailKind, (l: Look) => Part[]> = {
  none: () => [],
}

/** Shorts or skirt (+ tail), in the hips bone's space (rig, origin at the hip joints' height). */
export function hipsParts(l: Look): Part[] {
  const k = l.kit
  const out =
    k.bottom === 'skirt'
      ? [
          part(new CylinderGeometry(0.15, 0.2, 0.13, 28, 1), k.bottomColor, { p: [0, -0.005, 0] }),
          part(new TorusGeometry(0.198, 0.011, 6, 32), k.trim, { p: [0, -0.068, 0], r: [HALF_PI, 0, 0] }),
        ]
      : [part(new SphereGeometry(0.15, 24, 12), k.bottomColor, { p: [0, 0.03, 0], s: [1.08, 0.62, 0.92] })]
  return out.concat(TAILS[l.tail](l))
}

/** Upper arm hanging from the shoulder (y = 0 → −ARM.upper): puffed short sleeve with a cuff. */
export function upperArmParts(l: Look): Part[] {
  const k = l.kit
  const arm = new CapsuleGeometry(ARM.upperR, ARM.upper, 4, 12).translate(0, -ARM.upper / 2, 0)
  return [
    part(arm, l.skin),
    part(new SphereGeometry(0.067, 14, 8, 0, Math.PI * 2, 0, HALF_PI), k.shirt),
    part(new CylinderGeometry(0.067, 0.071, 0.065, 16), k.shirt, { p: [0, -0.0325, 0] }),
    part(new TorusGeometry(0.07, 0.009, 6, 18), k.trim, { p: [0, -0.065, 0], r: [HALF_PI, 0, 0] }),
  ]
}

/** Forearm hanging from the elbow; the racket arm (`side` −1) wears the wristband. */
export function foreArmParts(l: Look, side: number): Part[] {
  const fore = new CapsuleGeometry(ARM.foreR, ARM.fore, 4, 12).translate(0, -ARM.fore / 2, 0)
  const out = [part(fore, l.skin)]
  if (side < 0)
    out.push(
      part(new CylinderGeometry(0.056, 0.056, 0.03, 16), l.kit.stripe, { p: [0, -ARM.fore + 0.02, 0] }),
    )
  return out
}

const HANDS: Record<HandKind, (l: Look, side: number) => Part[]> = {
  /** Round mitten with a small thumb on the inner (body) side. */
  mitten: (l, side) => [
    part(new SphereGeometry(0.062, 16, 12), l.skin, { p: [0, -ARM.hand, 0.006], s: [0.95, 1.05, 0.85] }),
    part(new CapsuleGeometry(0.021, 0.022, 3, 8), l.skin, {
      p: [-side * 0.046, -ARM.hand + 0.006, 0.028],
      r: [0.4, 0, side * 0.7],
    }),
  ],
}

/** The hand on the wrist joint. */
export function handParts(l: Look, side: number): Part[] {
  return HANDS[l.hands](l, side)
}

/** Thigh hanging from the hip joint (y = 0 → knee at −LEG.thigh); shorts legs over the top. */
export function thighParts(l: Look): Part[] {
  const thigh = new CapsuleGeometry(0.058, LEG.thigh - 0.05, 4, 12).translate(0, -LEG.thigh / 2, 0)
  const out = [part(thigh, l.skin)]
  if (l.kit.bottom === 'shorts')
    out.push(part(new CylinderGeometry(0.072, 0.075, 0.075, 16), l.kit.bottomColor, { p: [0, -0.022, 0] }))
  return out
}

/** Sneaker: sole, rounded upper, toe cap, laces. Ground at y = −LEG.shin (knee space), toe on +z. */
const FEET: Record<FootKind, (l: Look) => Part[]> = {
  sneaker: (l) => {
    const k = l.kit
    const g = -LEG.shin
    const lace = new CylinderGeometry(0.004, 0.004, 0.05, 4)
    return [
      part(new CylinderGeometry(0.058, 0.06, 0.024, 18), k.sole, {
        p: [0, g + 0.012, 0.028],
        s: [1, 1, 1.55],
      }),
      part(new SphereGeometry(0.062, 18, 10), k.shoe, { p: [0, g + 0.036, 0.024], s: [0.95, 0.66, 1.45] }),
      part(new SphereGeometry(0.04, 12, 8), k.sole, { p: [0, g + 0.03, 0.095], s: [1.15, 0.6, 0.8] }),
      part(lace, k.sole, { p: [0, g + 0.073, 0.035], r: [0.25, 0, HALF_PI] }),
      part(lace, k.sole, { p: [0, g + 0.068, 0.058], r: [0.45, 0, HALF_PI] }),
    ]
  },
}

/** Shin hanging from the knee with sock and foot (rigid: no ankle joint yet). */
export function shinParts(l: Look): Part[] {
  const k = l.kit
  const shin = new CapsuleGeometry(0.051, 0.035, 4, 12).translate(0, -0.045, 0)
  return [
    part(shin, l.skin),
    part(new CylinderGeometry(0.055, 0.056, 0.05, 16), k.socks, { p: [0, -0.078, 0] }),
    part(new TorusGeometry(0.056, 0.006, 4, 16), k.stripe, { p: [0, -0.06, 0], r: [HALF_PI, 0, 0] }),
    ...FEET[l.feet](l),
  ]
}
