// Body builders: one Part list per bone (torso, hips, upper arm, forearm, hand, thigh, shin + foot),
// picked by the look's keys (BODIES by body kind, HANDS, FEET). Each bone's parts are merged into one
// mesh by model.ts. The kit is optional: without one, the torso / limbs are bare skin (fur, scales...).

import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  LatheGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three'
import { ARM, HIP_Y, LEG } from './dims'
import { bellyOf, limbOf, type BodyKind, type FootKind, type HandKind, type Look, type Shoes } from './look'
import { part, place, shade, tint, type Part, type Triple } from './merge'
import { PALETTE } from './palette'
import { roundBox } from './shapes'

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

/** Human: chest + polo shirt + collar + neck, in the torso bone's space (origin at the hips). */
function humanTorso(l: Look): Part[] {
  const k = l.kit
  const lathe = new LatheGeometry(
    TORSO_PROFILE.map(([r, y]) => new Vector2(r, y - HIP_Y)),
    28,
  )
  const neckY = NECK_Y - HIP_Y
  if (!k) return [part(lathe, l.skin)]
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

/** Shorts or skirt (bare hips without a kit), in the hips bone's space (origin at the hip joints' height). */
function humanHips(l: Look): Part[] {
  const k = l.kit
  if (k?.bottom === 'skirt')
    return [
      part(new CylinderGeometry(0.15, 0.2, 0.13, 28, 1), k.bottomColor, { p: [0, -0.005, 0] }),
      part(new TorusGeometry(0.198, 0.011, 6, 32), k.trim, { p: [0, -0.068, 0], r: [HALF_PI, 0, 0] }),
    ]
  return [
    part(new SphereGeometry(0.15, 24, 12), k ? k.bottomColor : l.skin, {
      p: [0, 0.03, 0],
      s: [1.08, 0.62, 0.92],
    }),
  ]
}

/** Chubby animal: a rounder chest in a tank jersey (stripe, round trim collar), or bare fur with a belly patch. */
function chubbyTorso(l: Look): Part[] {
  const R = 1.1
  const lathe = new LatheGeometry(
    TORSO_PROFILE.map(([r, y]) => new Vector2(r * (y < NECK_Y ? R : 1.15), y - HIP_Y)),
    28,
  )
  const neckY = NECK_Y - HIP_Y
  const k = l.kit
  const belly = bellyOf(l)
  const fur = (x: number, y: number, z: number) =>
    z > 0.07 && Math.abs(x) < 0.11 && y < neckY - 0.05 ? belly : l.skin
  if (!k) return [part(lathe, fur)]
  const paint = (x: number, y: number, z: number) =>
    y > neckY + 0.0005 ? fur(x, y, z) : y > STRIPE.lo - HIP_Y && y < STRIPE.hi - HIP_Y ? k.stripe : k.shirt
  const v = new CapsuleGeometry(0.012, 0.075, 3, 8)
  return [
    part(lathe, paint),
    // V-neck trim: two strips meeting on the chest, a thin band round the back of the neck.
    part(v, k.trim, { p: [-0.032, neckY - 0.045, 0.142], r: [-0.45, 0, 0.62] }),
    part(v, k.trim, { p: [0.032, neckY - 0.045, 0.142], r: [-0.45, 0, -0.62] }),
    part(new TorusGeometry(0.072, 0.012, 6, 24), k.trim, {
      p: [0, neckY - 0.006, -0.01],
      r: [HALF_PI + 0.25, 0, 0],
    }),
    ...emblem(k.trim === 0xffffff ? PALETTE.emblem : k.trim, [0.075, 0.2, 0.158], [-0.25, 0.35, 0]),
  ]
}

/** Shuttlecock emblem (feather skirt + cork), ~4 cm, lying on a surface at `p` turned by `r`. */
export function emblem(color: number, p: Triple, r: Triple): Part[] {
  return place(
    [
      part(new CylinderGeometry(0.02, 0.008, 0.026, 10), color, { p: [0, 0.008, 0], s: [1, 1, 0.3] }),
      part(new SphereGeometry(0.009, 8, 6), color, { p: [0, -0.009, 0], s: [1, 1, 0.5] }),
    ],
    { p, r },
  )
}

/** Chubby animal hips: rounder shorts (or fur). */
function chubbyHips(l: Look): Part[] {
  return place(humanHips(l), { s: [1.1, 1.05, 1.1] })
}

/** Little dragon: chubby scaly body with cream belly plates. */
function dragonTorso(l: Look): Part[] {
  // Plain scales (no painted patch): the belly is the plates.
  const out = chubbyTorso({ ...l, kit: undefined, belly: l.skin })
  const plate = new SphereGeometry(0.05, 16, 10)
  for (let i = 0; i < 4; i++) {
    const y = 0.03 + i * 0.058
    out.push(
      part(plate, bellyOf(l), {
        p: [0, y, 0.176 - y * 0.08],
        r: [-0.15, 0, 0],
        s: [1.7 - i * 0.15, 0.85, 0.4],
      }),
    )
  }
  return out
}

/** Robot: a rounded box chest (panel, accent light, seams) on a neck post. */
function robotTorso(l: Look): Part[] {
  const dark = shade(l.skin, 0.3)
  const box = new BoxGeometry(1, 1, 1)
  return [
    part(roundBox(0.17, 0.18, 0.135, 4), l.skin, { p: [0, 0.18, 0] }),
    part(new CylinderGeometry(0.05, 0.06, 0.14, 14), dark, { p: [0, 0.38, 0] }),
    part(roundBox(0.1, 0.075, 0.02, 4, 16, 12), shade(l.skin, 0.12), { p: [0, 0.2, 0.128] }),
    part(new CylinderGeometry(0.026, 0.026, 0.02, 16), l.accent, {
      p: [-0.04, 0.21, 0.148],
      r: [HALF_PI, 0, 0],
    }),
    part(new CylinderGeometry(0.014, 0.014, 0.02, 12), tint(l.accent, 0.4), {
      p: [0.035, 0.22, 0.146],
      r: [HALF_PI, 0, 0],
    }),
    part(box, dark, { p: [0, 0.07, 0.134], s: [0.24, 0.008, 0.01] }),
    part(box, dark, { p: [0, 0.31, 0.1], s: [0.2, 0.008, 0.01] }),
  ]
}

/** Robot pelvis block. */
function robotHips(l: Look): Part[] {
  return [part(roundBox(0.15, 0.075, 0.12, 4), shade(l.skin, 0.18), { p: [0, 0.02, 0] })]
}

/** Slime: a jelly blob for the chest (lighter on top) with a couple of bubbles inside. */
function slimeTorso(l: Look): Part[] {
  // Mostly inside the dome (hips): it keeps the twisting chest filled where the dome narrows.
  return [
    part(new SphereGeometry(0.17, 20, 14), l.skin, { p: [0, 0.22, 0], s: [1, 0.95, 0.9] }),
    part(new SphereGeometry(0.028, 10, 8), tint(l.skin, 0.45), { p: [0.09, 0.2, 0.135] }),
  ]
}

/** Slime: the wide jelly dome it sits (and hops) on, darker at the base, a glossy spot. */
function slimeHips(l: Look): Part[] {
  const r = 0.3
  const sy = 0.95
  const cy = -HIP_Y + r * sy
  const base = shade(l.skin, 0.14)
  return [
    part(new SphereGeometry(r, 28, 18), (_x, y) => (y < cy - r * sy * 0.55 ? base : l.skin), {
      p: [0, cy, 0],
      s: [1, sy, 1],
    }),
    part(new SphereGeometry(0.06, 14, 10), tint(l.skin, 0.6), {
      p: [-0.15, cy + 0.12, 0.22],
      r: [0.5, -0.6, 0.5],
      s: [1, 0.45, 0.25],
    }),
  ]
}

/** Ghost: the sheet's upper half (neck to waist), in the torso's space. */
function ghostTorso(l: Look): Part[] {
  const prof: [number, number][] = [
    [0, 0.42],
    [0.08, 0.41],
    [0.11, 0.35],
    [0.15, 0.22],
    [0.19, 0.09],
    [0.205, 0.0],
    [0, -0.02],
  ]
  return [
    part(
      new LatheGeometry(
        prof.map(([r, y]) => new Vector2(r, y)),
        28,
      ),
      l.skin,
    ),
  ]
}

/** Ghost: the flared hem with a wavy edge (a thin closed shell, so it is solid from below too). */
function ghostHips(l: Look): Part[] {
  const prof: [number, number][] = [
    [0.185, 0.06],
    [0.2, 0.06],
    [0.225, -0.04],
    [0.265, -0.13],
    [0.25, -0.135],
    [0.21, -0.045],
    [0.185, 0.06],
  ]
  const g = new LatheGeometry(
    prof.map(([r, y]) => new Vector2(r, y)),
    36,
  )
  const P = g.getAttribute('position')
  for (let i = 0; i < P.count; i++) {
    const y = P.getY(i)
    const w = Math.min(1, Math.max(0, -y / 0.13))
    P.setY(i, y + 0.035 * w * Math.sin(6 * Math.atan2(P.getX(i), P.getZ(i))))
  }
  g.computeVertexNormals()
  const hem = shade(l.skin, 0.08)
  return [part(g, (_x, y) => (y < -0.08 ? hem : l.skin))]
}

/** Torso (upper body: twists and bends) + hips (stays with the legs) per body kind. */
export const BODIES: Record<BodyKind, { torso: (l: Look) => Part[]; hips: (l: Look) => Part[] }> = {
  human: { torso: humanTorso, hips: humanHips },
  chubby: { torso: chubbyTorso, hips: chubbyHips },
  dragon: { torso: dragonTorso, hips: chubbyHips },
  robot: { torso: robotTorso, hips: robotHips },
  slime: { torso: slimeTorso, hips: slimeHips },
  ghost: { torso: ghostTorso, hips: ghostHips },
}

export function torsoParts(l: Look): Part[] {
  return BODIES[l.body].torso(l)
}

export function hipsParts(l: Look): Part[] {
  return BODIES[l.body].hips(l)
}

/** Upper arm hanging from the shoulder (y = 0 → −ARM.upper): puffed short sleeve with a cuff (kit only). */
export function upperArmParts(l: Look): Part[] {
  const k = l.kit
  const arm = new CapsuleGeometry(ARM.upperR, ARM.upper, 4, 12).translate(0, -ARM.upper / 2, 0)
  if (!k) return [part(arm, limbOf(l))]
  return [
    part(arm, limbOf(l)),
    part(new SphereGeometry(0.067, 14, 8, 0, Math.PI * 2, 0, HALF_PI), k.shirt),
    part(new CylinderGeometry(0.067, 0.071, 0.065, 16), k.shirt, { p: [0, -0.0325, 0] }),
    part(new TorusGeometry(0.07, 0.009, 6, 18), k.trim, { p: [0, -0.065, 0], r: [HALF_PI, 0, 0] }),
  ]
}

/** Forearm hanging from the elbow; the racket arm (`side` −1) wears the wristband. */
export function foreArmParts(l: Look, side: number): Part[] {
  const fore = new CapsuleGeometry(ARM.foreR, ARM.fore, 4, 12).translate(0, -ARM.fore / 2, 0)
  const out = [part(fore, limbOf(l))]
  if (side < 0)
    out.push(part(new CylinderGeometry(0.056, 0.056, 0.03, 16), l.accent, { p: [0, -ARM.fore + 0.02, 0] }))
  return out
}

export const HANDS: Record<HandKind, (l: Look, side: number) => Part[]> = {
  paw: (l, side) => pawHand(l, side),
  /** Dragon: a paw with three little cream claws. */
  claw: (l, side) => [
    ...pawHand(l, side),
    ...[-0.03, 0, 0.03].map((dz) =>
      part(new ConeGeometry(0.011, 0.03, 6), l.hair, { p: [0, -ARM.hand - 0.08, dz], r: [Math.PI, 0, 0] }),
    ),
  ],
  /** Robot: a metal mitten with a dark cuff. */
  metal: (l, side) => [
    part(new SphereGeometry(0.062, 16, 12), limbOf(l), { p: [0, -ARM.hand, 0.006], s: [0.95, 1.05, 0.85] }),
    part(new CapsuleGeometry(0.021, 0.022, 3, 8), limbOf(l), {
      p: [-side * 0.046, -ARM.hand + 0.006, 0.028],
      r: [0.4, 0, side * 0.7],
    }),
    part(new TorusGeometry(0.05, 0.012, 6, 16), shade(limbOf(l), 0.35), {
      p: [0, -ARM.hand + 0.03, 0],
      r: [HALF_PI, 0, 0],
    }),
  ],
  /** Slime / ghost: a soft round nub. */
  nub: (l) => [part(new SphereGeometry(0.058, 14, 10), limbOf(l), { p: [0, -ARM.hand, 0.004] })],
  /** Round mitten with a small thumb on the inner (body) side. */
  mitten: (l, side) => [
    part(new SphereGeometry(0.062, 16, 12), limbOf(l), { p: [0, -ARM.hand, 0.006], s: [0.95, 1.05, 0.85] }),
    part(new CapsuleGeometry(0.021, 0.022, 3, 8), limbOf(l), {
      p: [-side * 0.046, -ARM.hand + 0.006, 0.028],
      r: [0.4, 0, side * 0.7],
    }),
  ],
}

/** Paw: a round mitten (no thumb) with a light pad on the palm and three toe bumps. */
function pawHand(l: Look, side: number): Part[] {
  const c = limbOf(l)
  const out = [
    part(new SphereGeometry(0.066, 16, 12), c, { p: [0, -ARM.hand, 0.004], s: [1, 1, 0.9] }),
    part(new SphereGeometry(0.03, 10, 8), bellyOf(l), {
      p: [side * 0.035, -ARM.hand - 0.01, 0.02],
      s: [0.5, 1, 1],
    }),
  ]
  for (const dz of [-0.03, 0, 0.03])
    out.push(part(new SphereGeometry(0.022, 8, 6), c, { p: [0, -ARM.hand - 0.055, dz] }))
  return out
}
/** The hand on the wrist joint. */
export function handParts(l: Look, side: number): Part[] {
  return HANDS[l.hands](l, side)
}

/** Thigh hanging from the hip joint (y = 0 → knee at −LEG.thigh); shorts legs over the top. */
export function thighParts(l: Look): Part[] {
  const thigh = new CapsuleGeometry(0.058, LEG.thigh - 0.05, 4, 12).translate(0, -LEG.thigh / 2, 0)
  const out = [part(thigh, limbOf(l))]
  if (l.kit?.bottom === 'shorts')
    out.push(part(new CylinderGeometry(0.072, 0.075, 0.075, 16), l.kit.bottomColor, { p: [0, -0.022, 0] }))
  return out
}

const DEFAULT_SHOES: Shoes = { socks: 0xffffff, shoe: 0xffffff, sole: 0xffffff }

/** Foot (+ sock) on the shin, in knee space: ground at y = −LEG.shin, toe on +z. */
export const FEET: Record<FootKind, (l: Look) => Part[]> = {
  /** Dragon: a paw foot with cream claws. */
  claw: (l) => [
    ...FEET.paw(l),
    ...[-0.035, 0, 0.035].map((x) =>
      part(new ConeGeometry(0.012, 0.035, 6), l.hair, {
        p: [x, -LEG.shin + 0.02, 0.135],
        r: [HALF_PI, 0, 0],
      }),
    ),
  ],
  /** Robot: a rounded box boot with an accent sole. */
  boot: (l) => [
    part(roundBox(0.065, 0.042, 0.095, 4, 16, 12), shade(limbOf(l), 0.15), {
      p: [0, -LEG.shin + 0.045, 0.03],
    }),
    part(new BoxGeometry(0.12, 0.012, 0.18), l.accent, { p: [0, -LEG.shin + 0.006, 0.03] }),
  ],
  /** Round paw: a soft pad foot with three toe bumps and a light sole. */
  paw: (l) => {
    const c = limbOf(l)
    const g = -LEG.shin
    const out = [
      part(new SphereGeometry(0.066, 18, 10), c, { p: [0, g + 0.034, 0.03], s: [1.05, 0.6, 1.45] }),
      part(new CylinderGeometry(0.058, 0.06, 0.012, 16), bellyOf(l), {
        p: [0, g + 0.006, 0.03],
        s: [1, 1, 1.4],
      }),
    ]
    for (const x of [-0.035, 0, 0.035])
      out.push(part(new SphereGeometry(0.026, 10, 8), c, { p: [x, g + 0.026, 0.105], s: [1, 0.85, 1] }))
    return out
  },
  /** Sock with a ring, sneaker: sole, rounded upper, toe cap, laces. */
  sneaker: (l) => {
    const k = l.shoes ?? DEFAULT_SHOES
    const g = -LEG.shin
    const lace = new CylinderGeometry(0.004, 0.004, 0.05, 4)
    return [
      part(new CylinderGeometry(0.055, 0.056, 0.05, 16), k.socks, { p: [0, -0.078, 0] }),
      part(new TorusGeometry(0.056, 0.006, 4, 16), l.accent, { p: [0, -0.06, 0], r: [HALF_PI, 0, 0] }),
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

/** Shin hanging from the knee with the foot (rigid: no ankle joint yet). */
export function shinParts(l: Look): Part[] {
  const shin = new CapsuleGeometry(0.051, 0.035, 4, 12).translate(0, -0.045, 0)
  return [part(shin, limbOf(l)), ...FEET[l.feet](l)]
}
