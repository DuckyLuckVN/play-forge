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
import { ARM, HIP_Y } from './dims'
import {
  bellyOf,
  limbOf,
  rigOf,
  type BodyKind,
  type FootKind,
  type HandKind,
  type Look,
  type Shoes,
} from './look'
import { made, part, place, shade, tint, type Part, type Triple } from './merge'
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

/** Human shirt outline (radius, world y), bottom to top: a short boxy tee whose hem flares over the shorts. */
const HUMAN_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0.226],
  [0.16, 0.228],
  [0.184, 0.234],
  [0.19, 0.246],
  [0.192, 0.3],
  [0.193, 0.36],
  [0.19, 0.41],
  [0.18, 0.455],
  [0.165, 0.49],
  [0.142, 0.518],
  [0.115, 0.538],
  [0.088, 0.551],
  [0.07, NECK_Y],
  [0.062, NECK_Y + 0.001],
  [0.06, 0.62],
  [0.058, 0.66],
  [0, 0.68],
]
/** Two contrast stripes round the hem (world y bands). */
const HEM_BANDS: readonly (readonly [number, number])[] = [
  [0.25, 0.262],
  [0.273, 0.285],
]
/** Shirt depth / width share (a tee is wider than deep). */
const TEE = { sx: 1.12, sz: 0.92 }

/** Radius of a (radius, y) outline at height y (linear between points). */
function radiusAt(prof: readonly (readonly [number, number])[], y: number): number {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1]
    const [r1, y1] = prof[i]
    if (y >= y0 && y <= y1) return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0)
  }
  return 0
}

/** The outline with a 1 mm vertex pair at each band edge, so colour bands get hard edges. */
function withBands(
  prof: readonly (readonly [number, number])[],
  bands: readonly (readonly [number, number])[],
): [number, number][] {
  const cuts = bands.flatMap(([lo, hi]) => [lo - 0.0005, lo + 0.0005, hi - 0.0005, hi + 0.0005])
  const ys = [...new Set([...prof.map(([, y]) => y), ...cuts])].sort((a, b) => a - b)
  return ys.map((y) => {
    const exact = prof.find(([, py]) => py === y)
    return [exact ? exact[0] : radiusAt(prof, y), y]
  })
}

/** Human: a boxy tee (hem stripes, V collar, chest emblem) + neck, in the torso bone's space (origin at the hips). */
function humanTorso(l: Look): Part[] {
  const k = l.kit
  const neckY = NECK_Y - HIP_Y
  const lathe = new LatheGeometry(
    withBands(HUMAN_PROFILE, HEM_BANDS).map(([r, y]) => new Vector2(r, y - HIP_Y)),
    28,
  )
  if (!k) return [part(lathe, l.skin)]
  const inBand = (wy: number) => HEM_BANDS.some(([lo, hi]) => wy > lo && wy < hi)
  const paint = (_x: number, y: number) =>
    y > neckY + 0.0005 ? l.skin : inBand(y + HIP_Y) ? k.stripe : k.shirt
  // Front surface depth at a world height (for the decal-like collar + emblem).
  const front = (wy: number) => radiusAt(HUMAN_PROFILE, wy)
  const v = new CapsuleGeometry(0.009, 0.075, 3, 8)
  const vy = 0.515
  const lathePart = part(lathe, paint)
  lathePart.surf = (_x, y) => (y > neckY + 0.0005 ? 'skin' : 'cloth')
  const out: Part[] = [
    lathePart,
    // V collar: two strips meeting on the chest, a band round the back of the neck.
    part(v, k.trim, { p: [-0.033, vy - HIP_Y, front(vy) - 0.004], r: [-0.55, 0, 0.6] }),
    part(v, k.trim, { p: [0.033, vy - HIP_Y, front(vy) - 0.004], r: [-0.55, 0, -0.6] }),
    part(new TorusGeometry(0.073, 0.014, 6, 24), k.trim, {
      p: [0, neckY - 0.008, -0.008],
      r: [HALF_PI + 0.3, 0, 0],
    }),
    ...emblem(PALETTE.emblem, [0, 0.43 - HIP_Y, front(0.43) + 0.001], [-0.3, 0, 0], 1.15),
  ]
  return place(out, { s: [TEE.sx, 1, TEE.sz] })
}

/** Pleated skirt: a flared tube whose rim zigzags (pleats), shaded in the folds. */
function pleatedSkirt(color: number, trim: number): Part[] {
  const PLEATS = 14
  const H = 0.17
  const g = new CylinderGeometry(0.16, 0.232, H, PLEATS * 4, 2, true)
  const P = g.getAttribute('position')
  const fold = (x: number, z: number) => {
    const a = (Math.atan2(x, z) / (Math.PI * 2)) * PLEATS
    return Math.abs((((a % 1) + 1) % 1) - 0.5) * 2 // 0 in a fold, 1 on a crest
  }
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i)
    const z = P.getZ(i)
    const down = 0.5 - P.getY(i) / H // 0 at the waist, 1 at the hem
    const k = 1 + 0.07 * down * (fold(x, z) - 0.5)
    P.setXYZ(i, x * k, P.getY(i), z * k)
  }
  g.computeVertexNormals()
  const valley = shade(color, 0.16)
  return [
    part(g, (x, y, z) => (y < -H / 2 + 0.014 ? trim : fold(x, z) < 0.3 ? valley : color), {
      p: [0, -0.03, 0],
    }),
    // Waistband closes the top.
    part(new CylinderGeometry(0.161, 0.161, 0.02, 32), color, { p: [0, H / 2 - 0.037, 0] }),
  ]
}

/** Shorts or skirt (bare hips without a kit), in the hips bone's space (origin at the hip joints' height). */
function humanHips(l: Look): Part[] {
  const k = l.kit
  if (k?.bottom === 'skirt') return pleatedSkirt(k.bottomColor, k.stripe)
  return [
    part(new SphereGeometry(0.155, 28, 14), k ? k.bottomColor : l.skin, {
      p: [0, 0.03, 0],
      s: [1.2, 0.66, 0.98],
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

/** Shuttlecock emblem (five feathers fanning up from a round cork), ~4 cm, lying on a surface at `p` turned by `r`. */
export function emblem(color: number, p: Triple, r: Triple, s = 1): Part[] {
  const feather = new CapsuleGeometry(0.0042, 0.024, 1, 4)
  const out: Part[] = [
    part(new SphereGeometry(0.0085, 8, 5), color, { p: [0, -0.012, 0], s: [1, 0.85, 0.5] }),
    // Rim band across the feather tops.
    part(new CapsuleGeometry(0.003, 0.03, 1, 4), color, {
      p: [0, 0.014, 0],
      r: [0, 0, HALF_PI],
      s: [1, 1, 0.5],
    }),
  ]
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.3
    out.push(
      part(feather, color, {
        p: [Math.sin(a) * 0.014, -0.002 + Math.cos(a) * 0.006, 0],
        r: [0, 0, -a],
        s: [1, 1, 0.5],
      }),
    )
  }
  return place(out, { p, r, s })
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

/** Upper arm hanging from the shoulder (y = 0 → −ARM.upper): puffed short sleeve, stripe + cuff (kit only). */
export function upperArmParts(l: Look): Part[] {
  const k = l.kit
  const arm = new CapsuleGeometry(ARM.upperR, ARM.upper, 4, 12).translate(0, -ARM.upper / 2, 0)
  if (!k) return [part(arm, limbOf(l))]
  const SLEEVE = 0.077
  return [
    part(arm, limbOf(l)),
    ...made('cloth', [
      part(new SphereGeometry(SLEEVE, 16, 8, 0, Math.PI * 2, 0, HALF_PI), k.shirt),
      part(
        new CylinderGeometry(SLEEVE, SLEEVE + 0.004, 0.07, 18),
        (_x, y) => (y < -0.046 && y > -0.058 ? k.stripe : k.shirt),
        {
          p: [0, -0.035, 0],
        },
      ),
      part(new TorusGeometry(SLEEVE + 0.003, 0.008, 6, 20), k.trim, { p: [0, -0.07, 0], r: [HALF_PI, 0, 0] }),
    ]),
  ]
}

/** Forearm hanging from the elbow, with a wristband (kit or racket arm). */
export function foreArmParts(l: Look, side: number): Part[] {
  const fore = new CapsuleGeometry(ARM.foreR + 0.004, ARM.fore, 4, 12).translate(0, -ARM.fore / 2, 0)
  const out = [part(fore, limbOf(l))]
  if (side < 0 || l.kit) {
    // Terry wristband: light ribbed edges painted on (no extra rings).
    const edge = tint(l.accent, 0.3)
    out.push(
      ...made('cloth', [
        part(
          new CylinderGeometry(0.061, 0.061, 0.036, 18, 4),
          (_x, y) => (Math.abs(y - 0.022 + ARM.fore) > 0.012 ? edge : l.accent),
          {
            p: [0, -ARM.fore + 0.022, 0],
          },
        ),
      ]),
    )
  }
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
  /** Soft round fist with a thumb on the inner (body) side and a knuckle ridge. */
  mitten: (l, side) => [
    part(new SphereGeometry(0.07, 16, 11), limbOf(l), {
      p: [0, -ARM.hand - 0.004, 0.006],
      s: [0.95, 1.02, 0.88],
    }),
    part(new CapsuleGeometry(0.03, 0.06, 4, 10), limbOf(l), {
      p: [0, -ARM.hand - 0.04, 0.012],
      r: [HALF_PI, 0, 0],
      s: [1, 1, 0.9],
    }),
    part(new CapsuleGeometry(0.024, 0.022, 3, 10), limbOf(l), {
      p: [-side * 0.052, -ARM.hand + 0.004, 0.03],
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

/** Thigh hanging from the hip joint (y = 0 → knee at −rigOf(l).thigh); shorts legs (hem + side stripes) over the top. */
export function thighParts(l: Look): Part[] {
  const T = rigOf(l).thigh
  const thigh = new CapsuleGeometry(0.064, T - 0.05, 4, 12).translate(0, -T / 2, 0)
  const out = [part(thigh, limbOf(l))]
  const k = l.kit
  if (k?.bottom === 'shorts') {
    // Shorts legs down to mid-thigh.
    const R = 0.088
    const H = 0.105
    out.push(
      ...made('cloth', [
        part(new CylinderGeometry(R, R + 0.006, H, 20), k.bottomColor, { p: [0, -H / 2 + 0.03, 0] }),
        part(new TorusGeometry(R + 0.005, 0.007, 5, 20), k.stripe, {
          p: [0, -H + 0.035, 0],
          r: [HALF_PI, 0, 0],
        }),
        // Side stripes (both sides: the geometry is shared by the two legs).
        ...[-1, 1].map((s) =>
          part(new BoxGeometry(0.008, H - 0.012, 0.018), k.stripe, {
            p: [s * (R + 0.003), -H / 2 + 0.032, 0],
          }),
        ),
      ]),
    )
  }
  return out
}

/** The sneaker a touch bigger than built (chunky toy trainers), scaled about its sole centre. */
const SHOE_SCALE = (g: number) => {
  const k = 1.14
  return { p: [0, g * (1 - k), 0.03 * (1 - k)] as const, s: k }
}

const DEFAULT_SHOES: Shoes = { socks: 0xffffff, shoe: 0xffffff, sole: 0xffffff }

/** Foot (+ sock) on the shin, in knee space: ground at y = −rigOf(l).shin, toe on +z. */
export const FEET: Record<FootKind, (l: Look) => Part[]> = {
  /** Dragon: a paw foot with cream claws. */
  claw: (l) => [
    ...FEET.paw(l),
    ...[-0.035, 0, 0.035].map((x) =>
      part(new ConeGeometry(0.012, 0.035, 6), l.hair, {
        p: [x, -rigOf(l).shin + 0.02, 0.135],
        r: [HALF_PI, 0, 0],
      }),
    ),
  ],
  /** Robot: a rounded box boot with an accent sole. */
  boot: (l) => [
    part(roundBox(0.065, 0.042, 0.095, 4, 16, 12), shade(limbOf(l), 0.15), {
      p: [0, -rigOf(l).shin + 0.045, 0.03],
    }),
    part(new BoxGeometry(0.12, 0.012, 0.18), l.accent, { p: [0, -rigOf(l).shin + 0.006, 0.03] }),
  ],
  /** Round paw: a soft pad foot with three toe bumps and a light sole. */
  paw: (l) => {
    const c = limbOf(l)
    const g = -rigOf(l).shin
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
  /**
   * Chunky sneaker on a striped sock: thick white rubber sole, a rounded coloured upper with a white toe
   * cap and side stripes, laces, heel tab (the reference's toy trainer).
   */
  sneaker: (l) => {
    const k = l.shoes ?? DEFAULT_SHOES
    const g = -rigOf(l).shin
    const lace = new CapsuleGeometry(0.006, 0.05, 2, 6)
    const sockTop = g + 0.16
    const sock = (_x: number, y: number) =>
      (y > sockTop - 0.022 && y < sockTop - 0.012) || (y > sockTop - 0.038 && y < sockTop - 0.028)
        ? l.accent
        : k.socks
    return [
      ...made('cloth', [
        part(new CylinderGeometry(0.058, 0.058, 0.07, 18, 4), sock, { p: [0, sockTop - 0.035, 0] }),
      ]),
      ...place(
        [
          ...made('rubber', [
            part(roundBox(0.066, 0.02, 0.118, 3, 24, 10), k.sole, { p: [0, g + 0.02, 0.032] }),
          ]),
          ...made('plastic', [
            part(new SphereGeometry(0.07, 20, 12), k.shoe, {
              p: [0, g + 0.055, 0.02],
              s: [0.93, 0.82, 1.42],
            }),
            part(new SphereGeometry(0.05, 14, 8), k.sole, {
              p: [0, g + 0.045, 0.098],
              s: [1.22, 0.78, 0.95],
            }),
            // Side stripes (both sides), laces, heel tab.
            ...[-1, 1].flatMap((s) =>
              [-0.012, 0.016].map((dz) =>
                part(new CapsuleGeometry(0.006, 0.05, 2, 6), k.sole, {
                  p: [s * 0.064, g + 0.06, 0.02 + dz],
                  r: [0.8, 0, 0],
                }),
              ),
            ),
            part(lace, k.sole, { p: [0, g + 0.105, 0.035], r: [0.2, 0, HALF_PI] }),
            part(lace, k.sole, { p: [0, g + 0.096, 0.062], r: [0.45, 0, HALF_PI] }),
            part(new SphereGeometry(0.032, 10, 6), k.shoe, { p: [0, g + 0.1, -0.055], s: [1, 1, 0.55] }),
          ]),
        ],
        SHOE_SCALE(g),
      ),
    ]
  },
}

/** Shin hanging from the knee with the foot (rigid: no ankle joint yet). */
export function shinParts(l: Look): Part[] {
  // Knee down to just above the foot (the sneaker's sock covers the end).
  const len = rigOf(l).shin - 0.095
  const shin = new CapsuleGeometry(0.054, len, 4, 12).translate(0, -0.0275 - len / 2, 0)
  return [part(shin, limbOf(l)), ...FEET[l.feet](l)]
}
