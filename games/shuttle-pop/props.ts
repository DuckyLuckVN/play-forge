// The park's mid layer as data: a mix of trees (round, blossom, autumn, pine, small; flora.ts) with a far
// ring of hazy ones, bushes, flower beds, rocks and grass patches, a far tournament backstop, near-corner
// kit, near courtside kit on the sand behind the local player, a team bench zone and low hedge past it,
// picket fence, a paved stepping-stone path, lamp posts, picnic blankets dressed per spot, lantern
// poles + lanterns, a refreshment stall, an ice-cream cart, a little garden, a park sign, a balloon bunch,
// an umpire chair and a little scoreboard by the net. Everything is a `Prop` (kit.ts), so the whole
// layout draws as one InstancedMesh per shape (~15 draw calls); ground cover and the far ring carry a
// detail level (kit.ts showDetail), so Low draws only the core park.
//
// Readability rules (props.test.ts checks them): nothing on the court or its run-off, only the net-side
// furniture and the near courtside kit (knee-low, past a player's reach: NEAR_KIT) inside the surround,
// nothing between the camera and the court or a player's feet,
// and nothing pale above the net behind the far baseline (the white shuttle must read there).
//
// Render space: the local player is near (z < 0), the camera behind them looking toward +z.

import { courtScale, spreadXZ } from './courtsize'
import { FANS } from './crowd'
import { COURT, type CourtDims } from './physics'
import {
  bush,
  flowers,
  grass,
  rocks,
  slab,
  tree,
  type BushKind,
  type FlowerKind,
  type TreeKind,
} from './flora'
import { prop, rng, stick, yawTo, type Prop } from './kit'

/** Court surround beyond the lines (m) on the Normal court: the warm border around the court surface. */
export const SURROUND = { x: 1.3, z: 1.6 } as const
/** The surround on `court`: it scales with the court (a bigger ring, a wider border). */
export function surroundOf(court: CourtDims): { x: number; z: number } {
  return spreadXZ(SURROUND, courtScale(court))
}

/** Lit, flat-shaded (look.ts sun + sky). Plants and stones: flora.ts FLORA. */
const COLORS = {
  hedge: '#5ea840',
  /** Far backstop wood (dark, so the shuttle reads) and its banners: self-lit LED panels, mid tones, never pale. */
  backstop: '#5b4636',
  banners: ['#e0574a', '#2f9e6a', '#8a4fc4', '#e8952e', '#2f8fb8'],
  /** The backstop's LED strips (glow bulbs: they bloom a little). */
  led: '#ffe4b8',
  cooler: '#4f9bc9',
  cardLid: '#e9e1d2',
  shuttle: '#f6f2ea',
  bag: '#c8524f',
  bottle: '#7cc6e8',
  bottleCap: '#3d6fa8',
  fence: '#c28b55',
  lampPost: '#5e5160',
  /** Soft, not hot: the near bulbs sit at the screen edges on phone and must not out-shine the shuttle. */
  bulb: '#efc795',
  blankets: ['#d98b7e', '#8fa7c9', '#d6b25e', '#a990c4'],
  picnic: ['#b07d4f', '#e07a6a', '#e9d9bd'],
  pole: '#7d6a62',
  lanterns: ['#ffad4d', '#ff7f6e', '#f58fb8', '#ffc25c'],
  cart: '#9cc9b4',
  cartLid: '#f1e3c9',
  wheel: '#5e5160',
  umbrella: '#e4897a',
  /** The blanket's sun umbrella: mint, so it doesn't twin the cart's coral one. */
  parasol: '#8fcfb8',
  scoops: ['#f2a7b5', '#f6e2b8', '#9b6b52'],
  balloons: ['#e88a8a', '#f0c36a', '#8fb7d8', '#b79ad6'],
  string: '#efe6dc',
  wood: '#9a7458',
  /** Mid-tone (not near-black), so the board by the net doesn't pull the eye on a small screen. */
  board: '#7a6f93',
  card: '#efe2c8',
  pot: '#c8714f',
  potFlowers: ['#f2a3b8', '#f5cf5e', '#c4a5e0', '#fbf6ee'],
  cushions: ['#f0b7a4', '#a9c6e0', '#e7c56a', '#c9b0e0'],
  cup: '#f4ece0',
  cake: '#f3d7c9',
  /** Refreshment stall: pastel front panel, coral / cream awning, bottles and cups on the counter. */
  stallFront: '#9fd0c4',
  awning: ['#e47f72', '#f6ead6'],
  stallGoods: ['#7cc6e8', '#f4ece0', '#f0a35e', '#f4ece0', '#9bd17a'],
  signBoard: '#b48a62',
  water: '#8fd0e6',
  /** Near courtside kit (behind the local player): warm mid tones, nothing white near the court. */
  towels: ['#e98a6f', '#f2c35e'],
  /** Team palette: coral (left) and blue (right) mats, bags and their edges. */
  mats: ['#e0877a', '#6f9ccf'],
  matEdge: ['#c96d61', '#5781b4'],
  bags: ['#d0564f', '#3f6fae'],
  bagTrim: '#3b3346',
  tube: '#3f9a6a',
  tubeCap: '#f2c35e',
  racket: '#4a4058',
  grip: '#f2c35e',
  benchFrame: '#5e5160',
  bottleCaps: ['#3d6fa8', '#e0574a', '#2f9e6a'],
}

/** Picnic blanket spots (x, z) beside the court; the crowd sits on them. */
export const BLANKETS = [
  { x: -6.3, z: 1.6 },
  { x: 6.3, z: 2.4 },
  { x: -6.5, z: -5.2 },
  { x: 6.5, z: -4.6 },
] as const
/** Benches (scenery.ts draws them); the balloon bunch is tied to the last one. */
export const BENCHES = [
  { x: -6.9, z: -1.6 },
  { x: 6.9, z: -1.0 },
  { x: -7.0, z: 5.6 },
] as const

/** Lantern strings: poles along both sides, never across the court. */
export const LANTERN = { x: 4.6, poles: [-8, 0, 8], height: 2.6, perSpan: 7, sag: 0.4 } as const
/** Height of a lantern string at t ∈ [0, 1] along a span (a sag, lowest mid-span). */
export const lanternHang = (t: number) => LANTERN.height - 0.05 - LANTERN.sag * 4 * t * (1 - t)

/** Low picket fence along both sides of the surround (Normal court; the real one is built per court). */
const FENCE_X = COURT.halfWidth + SURROUND.x + 0.3
/** Stepping-stone path: up the left, behind the hedge, down the right. */
const PATH = { x: 10.2, z0: -9, zBack: 12.8, step: 0.75 }

/** Spots kept free of trees and lawn clutter (Normal court): the stall, cart, garden and sign, radius (m). */
const KEEP = [
  { x: -7.6, z: 10.8, r: 2 },
  { x: 7.2, z: 10.6, r: 2 },
  { x: 12.6, z: 4.2, r: 2.6 },
  { x: -9.4, z: -7.6, r: 1.2 },
] as const
const kept = (x: number, z: number, pad = 0) => KEEP.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + pad)

/** A tree kind by weights, e.g. `{ round: 3, pine: 1 }`. */
function kindOf(r: () => number, weights: Partial<Record<TreeKind, number>>): TreeKind {
  const list = Object.entries(weights) as [TreeKind, number][]
  let t = r() * list.reduce((n, [, w]) => n + w, 0)
  for (const [k, w] of list) if ((t -= w) < 0) return k
  return list[0][0]
}

/**
 * Trees in layers. Frame: big blossom trees at both sides of the lawn (the picture's soft pink frame). Sides:
 * a varied mix outside the path. Far row: mostly round greens with autumn and pine accents (no blossom
 * behind the court: too pale for the shuttle). Back row and the far ring: pines and hazy greens, no shadow.
 */
function trees(out: Prop[], r: () => number) {
  const at = (kind: TreeKind, x: number, z: number, s: number, far = false) => {
    if (!kept(x, z, 1)) tree(out, r, kind, x, z, s, far ? { shadow: false } : {})
  }
  // Near frame + a few small trees along the path's inner edge.
  for (const side of [-1, 1]) {
    at('blossom', side * (12.8 + r() * 0.6), -0.5 + r(), 1.05 + r() * 0.15)
    at('blossom', side * (14.2 + r() * 0.6), 8.5 + r(), 1 + r() * 0.15)
    at('small', side * 9.1, -1.2 + side * 0.6, 0.8)
    at('small', side * 9.3, 9.4 - side * 0.4, 0.75)
  }
  // Side rows, outside the path.
  for (const side of [-1, 1])
    for (let z = -2; z <= 14; z += 3.2)
      at(
        kindOf(r, { round: 6, blossom: 2, autumn: 1 }),
        side * (12.5 + r() * 3.5),
        z + (r() - 0.5) * 1.6,
        0.8 + r() * 0.4,
      )
  // Far row, well behind the far baseline.
  for (let x = -18; x <= 18; x += 3.4) {
    const tx = x + (r() - 0.5) * 1.6
    const kind = kindOf(
      r,
      Math.abs(tx) > 7 ? { round: 6, autumn: 1, pine: 1, blossom: 1 } : { round: 6, autumn: 1, pine: 1 },
    )
    at(kind, tx, 17 + r() * 6, 1 + r() * 0.45)
  }
  // Far corners, closing the gap between the side and far rows.
  for (const side of [-1, 1])
    for (let k = 0; k < 4; k++)
      at(
        kindOf(r, { pine: 2, autumn: 1, round: 3 }),
        side * (17 + k * 2.5 + r()),
        10 + k * 3 + r() * 2,
        1 + r() * 0.4,
      )
  // Back row: bigger, past the sun's shadow box.
  for (let x = -27; x <= 27; x += 4.2)
    at(kindOf(r, { pine: 2, round: 4, autumn: 1 }), x + (r() - 0.5) * 2, 28 + r() * 6, 1.3 + r() * 0.5, true)
}

/**
 * The far ring: small hazy trees between the park and the painted hills (depth). Medium + High only;
 * no shadow. Kept to the half the camera faces (and its sides).
 */
function farRing(out: Prop[], r: () => number) {
  const from = out.length
  for (let a = -1.75; a <= 1.75; a += 0.15 + r() * 0.1) {
    const d = 46 + r() * 16
    tree(
      out,
      r,
      kindOf(r, { pine: 2, round: 5, autumn: 1, blossom: 1 }),
      Math.sin(a) * d,
      Math.cos(a) * d,
      1.2 + r() * 0.6,
      { shadow: false },
    )
  }
  for (let i = from; i < out.length; i++) out[i].detail = 1
}

function bushesAndBeds(out: Prop[], r: () => number) {
  const kinds: BushKind[] = ['cluster', 'flowering', 'round']
  let n = 0
  for (const side of [-1, 1])
    for (let z = -6; z <= 10; z += 5.5)
      bush(out, r, kinds[n++ % 3], side * (8 + r() * 0.8), z + r() * 2, 0.95 + r() * 0.35)
  // Flower beds: clusters over a low leafy mound; a few rocks at some.
  const beds: { x: number; z: number; kinds: FlowerKind[]; rock?: boolean }[] = [
    { x: -5.4, z: 9.9, kinds: ['pink', 'daisy'] },
    { x: 5.4, z: 9.9, kinds: ['yellow', 'coral'] },
    { x: -8.4, z: -5.6, kinds: ['lilac', 'daisy'], rock: true },
    { x: 8.7, z: 2.4, kinds: ['pink', 'yellow'] },
    { x: -9.0, z: 8.6, kinds: ['daisy', 'yellow'], rock: true },
    { x: 8.5, z: -6.4, kinds: ['coral', 'lilac'] },
    // Foreground: daisy drifts at the near fence ends (the picture's front corners).
    { x: -5.6, z: -8.2, kinds: ['daisy', 'pink'] },
    { x: 5.8, z: -8.0, kinds: ['daisy', 'yellow'] },
  ]
  for (const b of beds) {
    flowers(out, r, b.x, b.z, 9, b.kinds, 0.6, { mound: true })
    // A second, looser drift beside it (Medium+).
    flowers(out, r, b.x + (r() - 0.5) * 1.6, b.z + (r() < 0.5 ? -0.8 : 0.8), 5, b.kinds, 0.4, { detail: 1 })
    if (b.rock) rocks(out, r, b.x + 0.8, b.z - 0.3, 0.45, true, { detail: 1 })
  }
}

/** The far backstop (Normal court): half-length, post spacing, post height, banner drop. */
const BACKSTOP = { half: 4.55, step: 1.1, postH: 1.25, bannerH: 0.55, ledsPerSpan: 4, led: 0.055 } as const

/**
 * The far end: a low dark-wood tournament backstop (posts, top rail, kick board) hung with LED banner panels
 * in alternating colours (self-lit: they stay bright with the sun behind them), warm LED strips along the top
 * rail and the kick board, a bunting line along the top. Everything stays under the net's height, so the
 * white shuttle still reads against it.
 */
function farBackstop(out: Prop[], court: CourtDims) {
  const sur = surroundOf(court)
  const kx = courtScale(court).x
  const z = court.halfLen + sur.z + 1
  const half = BACKSTOP.half * kx
  const spans = Math.max(2, Math.round((half * 2) / BACKSTOP.step))
  const step = (half * 2) / spans
  const { postH, bannerH, ledsPerSpan, led } = BACKSTOP
  for (let i = 0; i <= spans; i++)
    out.push(prop('box', COLORS.backstop, -half + i * step, postH / 2, z, 0.1, postH, 0.1))
  out.push(prop('box', COLORS.backstop, 0, postH - 0.04, z, half * 2 + 0.1, 0.07, 0.08))
  out.push(prop('box', COLORS.backstop, 0, 0.1, z, half * 2, 0.2, 0.06))
  // A banner per span (a small gap at each post), its hem a darker strip; colours cycle.
  for (let i = 0; i < spans; i++) {
    const x = -half + (i + 0.5) * step
    const c = COLORS.banners[i % COLORS.banners.length]
    const y = postH - 0.12 - bannerH / 2
    out.push(prop('panel', c, x, y, z - 0.06, step - 0.14, bannerH, 0.03))
    // LED strips: small warm bulbs on the face of the top rail and the kick board.
    for (let k = 0; k < ledsPerSpan; k++) {
      const lx = x + ((k + 0.5) / ledsPerSpan - 0.5) * step
      out.push(prop('glow', COLORS.led, lx, postH - 0.04, z - 0.06, led))
      out.push(prop('glow', COLORS.led, lx, 0.14, z - 0.05, led))
    }
    out.push(prop('box', COLORS.backstop, x, y - bannerH / 2 + 0.03, z - 0.075, step - 0.14, 0.05, 0.02))
    // Bunting: two little pennants (flat cones, tip down) per span along the top rail.
    for (const f of [-0.25, 0.25]) {
      const flag = prop(
        'cone',
        COLORS.lanterns[(i * 2 + (f > 0 ? 1 : 0)) % COLORS.lanterns.length],
        x + f * step,
        postH + 0.08,
        z - 0.05,
        0.22,
        0.2,
        0.03,
      )
      flag.tilt = Math.PI
      out.push(flag)
    }
  }
}

/**
 * The two near corners, behind the local player but outside the court's sight lines: a cooler and a
 * basket of shuttles on one side, a racket bag and water bottles on the other. All knee-high or lower.
 */
function nearCorners(out: Prop[], court: CourtDims) {
  const sur = surroundOf(court)
  // Just outside the side fences (the surround stays clear), level with the near baseline's run-off.
  const x = court.halfWidth + sur.x + 0.9
  const z = -(court.halfLen + sur.z - 0.6)
  // Left: cooler (body + lid) and a wicker basket of shuttles.
  out.push(prop('box', COLORS.cooler, -x, 0.17, z, 0.55, 0.34, 0.36))
  out.push(prop('box', COLORS.cardLid, -x, 0.37, z, 0.58, 0.07, 0.39))
  out.push(prop('post', COLORS.wood, -x + 0.65, 0.16, z + 0.1, 0.42, 0.32, 0.42))
  for (const [dx, dz] of [
    [-0.08, 0],
    [0.08, 0.05],
    [0, -0.09],
  ])
    out.push(prop('ball', COLORS.shuttle, -x + 0.65 + dx, 0.35, z + 0.1 + dz, 0.12))
  // Right: a racket bag lying down and three water bottles.
  out.push(prop('box', COLORS.bag, x - 0.15, 0.13, z, 0.95, 0.26, 0.3, 0.25))
  out.push(prop('box', COLORS.backstop, x - 0.15, 0.27, z, 0.6, 0.03, 0.05, 0.25))
  for (let i = 0; i < 3; i++) {
    out.push(prop('post', COLORS.bottle, x + 0.5 + i * 0.13, 0.12, z + 0.25, 0.09, 0.24, 0.09))
    out.push(prop('box', COLORS.bottleCap, x + 0.5 + i * 0.13, 0.26, z + 0.25, 0.06, 0.04, 0.06))
  }
}

/**
 * The near apron's courtside kit (behind the local player): only on the sand's outer strip, past where a
 * player can run (sim.ts OUT_MARGIN + a body), and knee-low, so it never hides the near court or a player's
 * feet. `inFrom`: metres past the baseline the strip starts; `cap`: tallest top; `mid`: the centre lane
 * (|x| < mid × half-width) holds only ankle-high bits (`midCap`).
 */
export const NEAR_KIT = { inFrom: 1.1, cap: 0.42, mid: 0.5, midCap: 0.2 } as const

/** A racket lying flat at (x, z), head toward `yaw`: an oval frame of short sticks, strings, throat and grip. */
function flatRacket(out: Prop[], x: number, z: number, yaw: number) {
  const y = 0.02
  const c = Math.cos(yaw)
  const n = Math.sin(yaw)
  // Local (u across, v along the racket, head at +v) → world (x, z).
  const at = (u: number, v: number): [number, number] => [x + u * c + v * n, z - u * n + v * c]
  const rim = (a: number) => at(Math.sin(a) * 0.12, 0.17 + Math.cos(a) * 0.15)
  const SEG = 10
  for (let i = 0; i < SEG; i++) {
    const [x0, z0] = rim((i / SEG) * Math.PI * 2)
    const [x1, z1] = rim(((i + 1) / SEG) * Math.PI * 2)
    out.push(stick(COLORS.racket, x0, y, z0, x1, y, z1, 0.025))
  }
  const [sx, sz] = at(0, 0.17)
  out.push(prop('box', COLORS.string, sx, y - 0.006, sz, 0.21, 0.006, 0.27, yaw))
  const [tx, tz] = at(0, 0.02)
  const [hx, hz] = at(0, -0.09)
  const [gx, gz] = at(0, -0.24)
  out.push(stick(COLORS.racket, tx, y, tz, hx, y, hz, 0.02))
  out.push(stick(COLORS.grip, hx, y, hz, gx, y, gz, 0.035))
}

/** A kit bag lying at (x, z) turned `yaw`: body, a darker end band each side, a handle strap on top. */
function kitBag(out: Prop[], color: string, x: number, z: number, yaw: number, len = 0.62) {
  const c = Math.cos(yaw)
  const n = Math.sin(yaw)
  out.push(prop('box', color, x, 0.12, z, len, 0.24, 0.28, yaw))
  for (const e of [-1, 1]) {
    const d = e * (len / 2 - 0.04)
    out.push(prop('box', COLORS.bagTrim, x + d * c, 0.12, z - d * n, 0.06, 0.25, 0.29, yaw))
  }
  out.push(prop('box', COLORS.bagTrim, x, 0.245, z, len * 0.5, 0.02, 0.06, yaw))
}

/**
 * Courtside kit on the near sand: one mat per side (only on the sand's outer strip, NEAR_KIT), each with a
 * few grounded, knee-low pieces: a kit bag, a folded towel and a racket on the left; a bag and a pair of
 * shuttle tubes and a racket on the right. Colours from the team palette (COLORS.mats / bags). Built from
 * the real court (it hugs the surround); own seed, so the rest of the park keeps its layout.
 */
function nearApron(out: Prop[], court: CourtDims) {
  const sur = surroundOf(court)
  const zIn = -(court.halfLen + NEAR_KIT.inFrom)
  const zOut = -(court.halfLen + sur.z)
  // Hug the sand's outer edge (bigger courts have a deeper surround: further from the player there).
  const z = Math.min((zIn + zOut) / 2, zOut + 0.26)
  const side = (court.halfWidth + sur.x) * 0.62
  for (const s of [-1, 1]) {
    const x = s * side
    const k = s < 0 ? 0 : 1
    out.push(prop('box', COLORS.mats[k], x, 0.01, z, 1.7, 0.02, 0.42))
    out.push(prop('box', COLORS.matEdge[k], x, 0.008, z, 1.78, 0.012, 0.48))
    kitBag(out, COLORS.bags[k], x - s * 0.45, z, s * 0.08)
    flatRacket(out, x + s * 0.22, z - 0.02, Math.PI / 2 + s * 0.35)
  }
  // Left extra: a folded towel stack; right extra: two shuttle tubes lying side by side.
  out.push(prop('box', COLORS.towels[0], -side + 0.62, 0.05, z, 0.32, 0.06, 0.26, 0.12))
  out.push(prop('box', COLORS.towels[1], -side + 0.62, 0.105, z, 0.3, 0.05, 0.24, -0.08))
  for (const dx of [-0.06, 0.06]) {
    const tube = prop('post', COLORS.tube, side - 0.66 + dx, 0.05, z, 0.1, 0.4, 0.1, dx)
    tube.tilt = Math.PI / 2
    out.push(tube)
    out.push(prop('box', COLORS.tubeCap, side - 0.66 + dx, 0.05, z + 0.2, 0.1, 0.1, 0.02))
  }
}

/** The near grass: the team bench zone (`gap` m past the sand), the hedge `hedge` m past the sand. */
export const NEAR_ZONE = { gap: 0.48, hedge: 1.28 } as const

/**
 * The near lawn past the sand: a team bench with a backrest each side (towel draped over one, a bag under
 * the other), a drinks crate by the left one, a towel rack by the right one, then a low hedge row with
 * gaps across the end, flower drifts in front of it (Medium+) and grass tufts (High). Built from the real
 * court; own seed.
 */
function nearGrass(out: Prop[], court: CourtDims) {
  const r = rng(13)
  const sur = surroundOf(court)
  const edge = -(court.halfLen + sur.z)
  const zb = edge - NEAR_ZONE.gap
  const side = (court.halfWidth + sur.x) * 0.62
  for (const s of [-1, 1]) {
    const x = s * side
    // Legs, a two-slat seat, two back posts and a backrest rail (the back sits away from the court).
    for (const dx of [-0.6, 0.6]) {
      out.push(prop('box', COLORS.benchFrame, x + dx, 0.2, zb, 0.07, 0.4, 0.36))
      out.push(prop('box', COLORS.benchFrame, x + dx, 0.55, zb - 0.16, 0.07, 0.3, 0.05))
    }
    for (const dz of [-0.08, 0.08]) out.push(prop('box', COLORS.wood, x, 0.42, zb + dz, 1.5, 0.05, 0.14))
    out.push(prop('box', COLORS.wood, x, 0.6, zb - 0.17, 1.5, 0.14, 0.04))
  }
  // Left bench: a towel over the seat edge; a drinks crate with bottle tops beside it.
  out.push(prop('box', COLORS.towels[0], -side - 0.2, 0.36, zb + 0.15, 0.3, 0.16, 0.03))
  out.push(prop('box', COLORS.towels[0], -side - 0.2, 0.455, zb + 0.06, 0.3, 0.03, 0.2))
  const cx = -side + 1.05
  out.push(prop('box', COLORS.wood, cx, 0.13, zb, 0.4, 0.26, 0.3, 0.1))
  for (let i = 0; i < 6; i++)
    out.push(
      prop(
        'post',
        COLORS.bottleCaps[i % 3],
        cx - 0.12 + (i % 3) * 0.12,
        0.29,
        zb - 0.06 + Math.floor(i / 3) * 0.12,
        0.07,
        0.06,
        0.07,
      ),
    )
  // Right bench: a bag under the seat; a towel rack (two posts, a bar, two hung towels) beside it.
  kitBag(out, COLORS.bags[1], side + 0.15, zb + 0.02, 0, 0.55)
  const rx = side + 1.1
  for (const dx of [-0.32, 0.32])
    out.push(prop('post', COLORS.benchFrame, rx + dx, 0.32, zb - 0.1, 0.05, 0.64, 0.05))
  out.push(prop('post', COLORS.benchFrame, rx, 0.62, zb - 0.1, 0.03, 0.7, 0.03, Math.PI / 2))
  out[out.length - 1].tilt = Math.PI / 2
  for (const [dx, k] of [
    [-0.15, 0],
    [0.15, 1],
  ] as const)
    out.push(prop('box', COLORS.towels[k], rx + dx, 0.46, zb - 0.1, 0.24, 0.32, 0.03))
  // Hedge row with gaps; flowers in front of it (Medium+), tufts between (High).
  const zh = edge - NEAR_ZONE.hedge
  const half = court.halfWidth + sur.x + 1.2
  const kinds: FlowerKind[][] = [
    ['daisy', 'pink'],
    ['yellow', 'coral'],
    ['lilac', 'daisy'],
  ]
  let n = 0
  for (let x = -half; x <= half; x += 0.85) {
    if (r() > 0.15)
      bush(out, r, n % 3 === 0 ? 'flowering' : 'round', x + (r() - 0.5) * 0.2, zh - r() * 0.15, 0.5)
    if (n++ % 2 === 0) flowers(out, r, x + 0.4, zh + 0.35, 4, kinds[n % 3], 0.25, { detail: 1 })
    else grass(out, r, x + 0.4, zh + 0.35, 3, 0.25, { detail: 2 })
  }
}

/** Picket fence along both sides, the far backstop and the near end: built from the real court (they hug the surround). */
function hedgeAndFence(out: Prop[], court: CourtDims) {
  const sur = surroundOf(court)
  farBackstop(out, court)
  nearCorners(out, court)
  nearApron(out, court)
  nearGrass(out, court)
  // Picket fence along both sides: pickets + two rails.
  const z0 = -(court.halfLen + sur.z)
  const z1 = court.halfLen + sur.z + 0.4
  for (const side of [-1, 1]) {
    const x = side * (court.halfWidth + sur.x + 0.3)
    for (let z = z0; z <= z1; z += 0.4) out.push(prop('box', COLORS.fence, x, 0.22, z, 0.05, 0.44, 0.08))
    for (const y of [0.14, 0.32])
      out.push(prop('box', COLORS.fence, x, y, (z0 + z1) / 2, 0.035, 0.05, z1 - z0))
  }
}

/** Every paving-slab spot of the path (Normal court): up the left, round the back, down the right. */
function pathSpots(r: () => number): { x: number; z: number }[] {
  const spots: { x: number; z: number }[] = []
  for (const side of [-1, 1]) {
    for (let z = PATH.z0; z < PATH.zBack - 1.5; z += PATH.step)
      spots.push({ x: side * PATH.x + (r() - 0.5) * 0.18, z })
    // Round the corner on a quarter circle.
    for (let a = 0; a <= Math.PI / 2; a += PATH.step / 1.5)
      spots.push({ x: side * (PATH.x - 1.5 + 1.5 * Math.cos(a)), z: PATH.zBack - 1.5 + 1.5 * Math.sin(a) })
  }
  for (let x = -PATH.x + 1.5 + PATH.step; x < PATH.x - 1.5; x += PATH.step) spots.push({ x, z: PATH.zBack })
  return spots
}

/** Is (x, z) on the path (with `pad` m to spare)? */
const onPath = (x: number, z: number, pad = 0.5) =>
  (Math.abs(Math.abs(x) - PATH.x) < pad && z > PATH.z0 - pad && z < PATH.zBack + pad) ||
  (Math.abs(z - PATH.zBack) < pad && Math.abs(x) < PATH.x + pad)

/** Lamp posts beside the path (Normal court). The near pair frames the court from the screen edges. */
const LAMPS = [
  { x: -11, z: -4 },
  { x: 11, z: -3.5 },
  { x: -9.4, z: 5.5 },
  { x: 9.4, z: 6 },
  { x: -6.6, z: 13.6 },
  { x: 6.6, z: 13.6 },
] as const

/**
 * A park lamp: stepped plinth, slim post with a collar, a four-bar lantern cage round the warm bulb, a
 * roof cap and a little finial.
 */
function lamp(out: Prop[], x: number, z: number) {
  const c = COLORS.lampPost
  out.push(prop('box', c, x, 0.08, z, 0.34, 0.16, 0.34))
  out.push(prop('box', c, x, 0.22, z, 0.22, 0.12, 0.22))
  out.push(prop('post', c, x, 1.45, z, 0.11, 2.5, 0.11))
  out.push(prop('box', c, x, 2.72, z, 0.2, 0.06, 0.2))
  out.push(prop('glow', COLORS.bulb, x, 3.05, z, 0.3, 0.38, 0.3))
  for (const [dx, dz] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ])
    out.push(prop('box', c, x + dx * 0.17, 3.05, z + dz * 0.17, 0.035, 0.5, 0.035))
  out.push(prop('cone', c, x, 3.4, z, 0.52, 0.22, 0.52))
  out.push(prop('ball', c, x, 3.54, z, 0.09))
}

function pathAndLamps(out: Prop[], r: () => number) {
  // Paving slabs, varied in size and tone; every few steps a smaller stone tucked beside one.
  pathSpots(r).forEach((p, i) => {
    slab(out, r, p.x, p.z, 0.58 + r() * 0.16)
    if (i % 5 === 2) slab(out, r, p.x + (r() < 0.5 ? -0.42 : 0.42), p.z + 0.18, 0.26, { detail: 1 })
  })
  for (const l of LAMPS) lamp(out, l.x, l.z)
  // Lamp feet: a small flower ring at the far lamps, grass at the near ones (Medium+).
  LAMPS.forEach((l, i) => {
    if (i < 2) grass(out, r, l.x, l.z, 4, 0.5, { detail: 1 })
    else flowers(out, r, l.x, l.z, 6, i % 2 ? ['yellow', 'daisy'] : ['pink', 'lilac'], 0.5, { detail: 1 })
  })
  // Path edges: rocks and tufts at a few bends.
  const edges = [
    { x: -9.4, z: -2.6 },
    { x: 9.5, z: 0.6 },
    { x: -11.1, z: 3.4 },
    { x: 11.0, z: 9.8 },
    { x: -3.2, z: 13.6 },
    { x: 2.6, z: 11.9 },
  ]
  edges.forEach((e, i) => {
    if (i % 2 === 0) rocks(out, r, e.x, e.z, 0.4 + r() * 0.2, i % 4 === 0, { detail: 1 })
    grass(out, r, e.x + 0.3, e.z + 0.2, 3, 0.4, { detail: 2 })
  })
}

function picnicAndLanterns(out: Prop[], k: Spread) {
  BLANKETS.forEach((b, i) => {
    const from = out.length
    const o = Math.sign(b.x)
    out.push(prop('box', COLORS.blankets[i], b.x, 0.015, b.z, 1.7, 0.03, 1.3, (i - 1.5) * 0.12))
    // Basket, juice box, plate.
    out.push(prop('box', COLORS.picnic[0], b.x + o * 0.5, 0.13, b.z - 0.35, 0.38, 0.22, 0.26, 0.3))
    out.push(prop('box', COLORS.picnic[1], b.x + o * 0.15, 0.08, b.z - 0.45, 0.08, 0.13, 0.06))
    out.push(prop('box', COLORS.picnic[2], b.x + o * 0.55, 0.04, b.z + 0.3, 0.26, 0.015, 0.26, 0.5))
    BLANKET_KITS[i](out, b.x, b.z, o)
    moveSince(out, from, k, b)
  })
  // A flower pot at the outer end of each bench (clear of the fan in the middle).
  BENCHES.forEach((b, i) => {
    const from = out.length
    flowerPot(out, b.x + Math.sign(b.x) * 0.15, b.z + (i === 2 ? -1.05 : 1.05), i)
    moveSince(out, from, k, b)
  })
  const from = out.length
  const { x: PX, poles, height, perSpan } = LANTERN
  let l = 0
  for (const side of [-1, 1]) {
    const x = side * PX
    for (const z of poles) out.push(prop('post', COLORS.pole, x, height / 2, z, 0.12, height, 0.12))
    for (let s = 0; s + 1 < poles.length; s++)
      for (let k = 0; k < perSpan; k++) {
        const t = (k + 1) / (perSpan + 1)
        const z = poles[s] + (poles[s + 1] - poles[s]) * t
        out.push(
          prop(
            'glow',
            COLORS.lanterns[l++ % COLORS.lanterns.length],
            x,
            lanternHang(t) - 0.12,
            z,
            0.18,
            0.216,
            0.18,
          ),
        )
      }
  }
  moveSince(out, from, k)
}

/** A terracotta pot (`i` picks the flower) with a leafy mound and a few heads. */
function flowerPot(out: Prop[], x: number, z: number, i: number) {
  out.push(prop('post', COLORS.pot, x, 0.15, z, 0.3, 0.3, 0.3))
  out.push(prop('box', COLORS.pot, x, 0.31, z, 0.34, 0.04, 0.34))
  out.push(prop('leaf', COLORS.hedge, x, 0.4, z, 0.38, 0.26, 0.38, i))
  for (let k = 0; k < 4; k++) {
    const a = k * 1.6 + i
    out.push(
      prop(
        'bloom',
        COLORS.potFlowers[(i + k) % COLORS.potFlowers.length],
        x + Math.cos(a) * 0.1,
        0.52,
        z + Math.sin(a) * 0.1,
        0.13,
        0.05,
        0.13,
        a,
      ),
    )
  }
}

/** Squashed cushion. */
const cushion = (out: Prop[], c: string, x: number, z: number, yaw: number) =>
  out.push(prop('box', c, x, 0.06, z, 0.4, 0.1, 0.4, yaw), prop('ball', c, x, 0.11, z, 0.36, 0.08, 0.36))

/**
 * Per-blanket extras (Normal-court spots, `o` = side sign), each spot its own scene and clear of its fans:
 * a basket lunch with cushions; a sun umbrella; an empty spot laid with a cake and cushions; a little low
 * table with drinks.
 */
const BLANKET_KITS: readonly ((out: Prop[], x: number, z: number, o: number) => void)[] = [
  // Far left (two fans): a handle on the basket, cushions at the back corner, a teapot.
  (out, x, z, o) => {
    out.push(prop('box', COLORS.picnic[0], x + o * 0.5, 0.3, z - 0.47, 0.32, 0.03, 0.03, 0.3))
    for (const d of [-0.15, 0.15])
      out.push(
        prop('box', COLORS.picnic[0], x + o * 0.5 + d * 0.95, 0.27, z - 0.35 + d * 0.3, 0.03, 0.1, 0.03),
      )
    cushion(out, COLORS.cushions[0], x - o * 0.55, z - 0.4, 0.3)
    out.push(prop('ball', COLORS.cushions[2], x + o * 0.2, 0.1, z + 0.55, 0.2, 0.18, 0.2))
    out.push(prop('cone', COLORS.cushions[2], x + o * 0.2, 0.22, z + 0.55, 0.08, 0.08, 0.08))
  },
  // Far right (two fans): a striped sun umbrella at the outer edge, a cup by the basket.
  (out, x, z, o) => {
    const ux = x + o * 0.95
    const uz = z + 0.55
    out.push(prop('post', COLORS.wood, ux, 0.95, uz, 0.05, 1.9, 0.05))
    out.push(prop('cone', COLORS.parasol, ux, 1.95, uz, 1.9, 0.5, 1.9))
    out.push(prop('cone', COLORS.cartLid, ux, 2.1, uz, 1.0, 0.27, 1.0))
    out.push(prop('ball', COLORS.wood, ux, 2.27, uz, 0.08))
    out.push(prop('post', COLORS.cup, x + o * 0.2, 0.06, z - 0.15, 0.08, 0.1, 0.08))
  },
  // Near left (empty): a cake on its plate, two cushions, a book.
  (out, x, z, o) => {
    out.push(prop('post', COLORS.cake, x + o * 0.55, 0.1, z + 0.3, 0.2, 0.12, 0.2))
    out.push(prop('ball', COLORS.balloons[0], x + o * 0.55, 0.18, z + 0.3, 0.06))
    cushion(out, COLORS.cushions[1], x - o * 0.3, z + 0.2, -0.2)
    cushion(out, COLORS.cushions[3], x - o * 0.1, z - 0.25, 0.5)
    out.push(prop('box', COLORS.bag, x + o * 0.05, 0.03, z + 0.4, 0.3, 0.04, 0.22, 0.4))
  },
  // Near right (one fan): a low table with two drinks and a snack bowl.
  (out, x, z, o) => {
    const tx = x + o * 0.45
    const tz = z + 0.4
    out.push(prop('box', COLORS.wood, tx, 0.24, tz, 0.6, 0.05, 0.42))
    for (const [dx, dz] of [
      [-0.25, -0.16],
      [0.25, -0.16],
      [-0.25, 0.16],
      [0.25, 0.16],
    ])
      out.push(prop('box', COLORS.wood, tx + dx, 0.11, tz + dz, 0.04, 0.22, 0.04))
    out.push(prop('post', COLORS.bottle, tx - 0.14, 0.33, tz, 0.08, 0.13, 0.08))
    out.push(prop('post', COLORS.cup, tx + 0.02, 0.32, tz + 0.05, 0.07, 0.11, 0.07))
    out.push(prop('ball', COLORS.picnic[1], tx + 0.17, 0.29, tz - 0.04, 0.16, 0.08, 0.16))
  },
]

/**
 * Refreshment stall past the far-left corner (mirrors the ice-cream cart): a wooden counter, a striped
 * awning on four posts, bottles and cups on the counter, a little crate beside it.
 */
const STALL = { x: -7.6, z: 10.8 } as const
function refreshmentStall(out: Prop[]) {
  const { x, z } = STALL
  const yaw = yawTo(x, z, 0, 0)
  const at = (dx: number, dz: number) => ({
    x: x + dx * Math.cos(yaw) + dz * Math.sin(yaw),
    z: z - dx * Math.sin(yaw) + dz * Math.cos(yaw),
  })
  out.push(prop('box', COLORS.wood, x, 0.5, z, 1.7, 1, 0.7, yaw))
  const top = at(0, 0.04)
  out.push(prop('box', COLORS.cartLid, top.x, 1.03, top.z, 1.8, 0.07, 0.82, yaw))
  const front = at(0, 0.36)
  out.push(prop('box', COLORS.stallFront, front.x, 0.55, front.z, 1.5, 0.6, 0.02, yaw))
  for (const dx of [-0.82, 0.82])
    for (const dz of [-0.3, 0.3]) {
      const p = at(dx, dz)
      out.push(
        prop(
          'box',
          COLORS.wood,
          p.x,
          1.45 + (dz < 0 ? 0.2 : 0),
          p.z,
          0.07,
          0.9 + (dz < 0 ? 0.4 : 0),
          0.07,
          yaw,
        ),
      )
    }
  // Awning: alternating stripes, tipped down toward the front.
  const STRIPES = 7
  for (let i = 0; i < STRIPES; i++) {
    const p = at(-0.9 + (i + 0.5) * (1.8 / STRIPES), 0.05)
    const strip = prop('box', COLORS.awning[i % 2], p.x, 2.05, p.z, 1.8 / STRIPES, 0.04, 1.05, yaw)
    strip.tilt = 0.28
    out.push(strip)
  }
  // Scalloped valance along the front edge.
  for (let i = 0; i < STRIPES; i++) {
    const p = at(-0.9 + (i + 0.5) * (1.8 / STRIPES), 0.56)
    out.push(prop('box', COLORS.awning[i % 2], p.x, 1.83, p.z, 1.8 / STRIPES, 0.14, 0.02, yaw))
  }
  COLORS.stallGoods.forEach((c, i) => {
    const p = at(-0.6 + i * 0.3, -0.05)
    const h = i % 2 ? 0.12 : 0.26
    out.push(prop('post', c, p.x, 1.07 + h / 2, p.z, i % 2 ? 0.1 : 0.08, h, i % 2 ? 0.1 : 0.08))
  })
  const crate = at(1.25, 0.1)
  out.push(prop('box', COLORS.picnic[0], crate.x, 0.2, crate.z, 0.45, 0.4, 0.45, yaw + 0.3))
  for (const [dx, c] of [
    [-0.1, COLORS.balloons[1]],
    [0.1, COLORS.picnic[1]],
  ] as const)
    out.push(prop('ball', c, crate.x + dx, 0.45, crate.z, 0.16))
}

/**
 * A little walled garden on the right lawn: a low picket square with a bed of mixed flowers, a small tree,
 * a rock group and a bird bath.
 */
const GARDEN = { x: 12.6, z: 4.2, w: 2.6, d: 2.2 } as const
function garden(out: Prop[], r: () => number) {
  const { x, z, w, d } = GARDEN
  for (const [x0, z0, x1, z1] of [
    [x - w / 2, z - d / 2, x + w / 2, z - d / 2],
    [x - w / 2, z + d / 2, x + w / 2, z + d / 2],
    [x - w / 2, z - d / 2, x - w / 2, z + d / 2 - 0.6],
    [x + w / 2, z - d / 2, x + w / 2, z + d / 2],
  ]) {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.round(len / 0.3)
    for (let i = 0; i <= n; i++) {
      const t = i / n
      out.push(prop('box', COLORS.fence, x0 + (x1 - x0) * t, 0.14, z0 + (z1 - z0) * t, 0.05, 0.28, 0.05))
    }
    out.push(
      prop(
        'box',
        COLORS.fence,
        (x0 + x1) / 2,
        0.2,
        (z0 + z1) / 2,
        Math.abs(x1 - x0) + 0.04,
        0.04,
        Math.abs(z1 - z0) + 0.04,
      ),
    )
  }
  tree(out, r, 'small', x + 0.6, z + 0.45, 0.7)
  flowers(out, r, x - 0.4, z - 0.3, 12, ['pink', 'lilac', 'daisy'], 0.6, { mound: true })
  flowers(out, r, x + 0.5, z - 0.5, 7, ['yellow', 'coral'], 0.4, { detail: 1 })
  rocks(out, r, x - 0.8, z + 0.6, 0.35, true)
  // Bird bath.
  out.push(prop('post', COLORS.cartLid, x - 0.1, 0.3, z + 0.55, 0.12, 0.6, 0.12))
  out.push(prop('post', COLORS.cartLid, x - 0.1, 0.63, z + 0.55, 0.5, 0.08, 0.5))
  out.push(prop('box', COLORS.water, x - 0.1, 0.67, z + 0.55, 0.32, 0.01, 0.32, 0.4))
}

/** A wooden park sign by the near-left path end: two posts, a board, a little shuttlecock emblem (no words). */
const SIGN = { x: -9.4, z: -7.6 } as const
function parkSign(out: Prop[]) {
  const { x, z } = SIGN
  const yaw = yawTo(x, z, 0, -14)
  const at = (dx: number) => ({ x: x + dx * Math.cos(yaw), z: z - dx * Math.sin(yaw) })
  for (const dx of [-0.45, 0.45]) {
    const p = at(dx)
    out.push(prop('box', COLORS.wood, p.x, 0.55, p.z, 0.08, 1.1, 0.08, yaw))
  }
  out.push(prop('box', COLORS.signBoard, x, 1.0, z, 1.2, 0.5, 0.07, yaw))
  out.push(prop('cone', COLORS.wood, x, 1.32, z, 1.3, 0.2, 0.12, yaw))
  // Emblem on the face (toward the camera): a feathered cone over a cork ball.
  const fx = x + Math.sin(yaw) * 0.05
  const fz = z + Math.cos(yaw) * 0.05
  const cone = prop('cone', COLORS.card, fx, 1.04, fz, 0.2, 0.22, 0.02, yaw)
  cone.roll = 0.6
  out.push(
    cone,
    prop('ball', COLORS.picnic[1], fx + Math.cos(yaw) * 0.1, 0.96, fz - Math.sin(yaw) * 0.1, 0.1),
  )
  flowers(out, r0(), x + 0.1, z - 0.3, 5, ['yellow', 'daisy'], 0.35)
}
/** A fixed seed for one-off details (keeps the main stream stable when a feature moves). */
const r0 = () => rng(11)

/** Ice-cream cart under a coral umbrella, parked past the far right corner. */
const CART = { x: 7.2, z: 10.6 } as const
function iceCreamCart(out: Prop[]) {
  const { x, z } = CART
  const yaw = yawTo(x, z, 0, 0)
  const at = (dx: number, dz: number) => ({
    x: x + dx * Math.cos(yaw) + dz * Math.sin(yaw),
    z: z - dx * Math.sin(yaw) + dz * Math.cos(yaw),
  })
  out.push(prop('box', COLORS.cart, x, 0.62, z, 1.3, 0.62, 0.7, yaw))
  out.push(prop('box', COLORS.cartLid, x, 0.98, z, 1.36, 0.1, 0.76, yaw))
  for (const dx of [-0.42, 0.42]) {
    const w = at(dx, 0.4)
    const wheel = prop('post', COLORS.wheel, w.x, 0.26, w.z, 0.52, 0.08, 0.52, yaw)
    wheel.tilt = Math.PI / 2
    out.push(wheel)
  }
  const h = at(-0.75, 0)
  out.push(prop('box', COLORS.wood, h.x, 0.85, h.z, 0.3, 0.05, 0.05, yaw))
  out.push(prop('post', COLORS.wood, x, 1.75, z, 0.05, 1.5, 0.05))
  out.push(prop('cone', COLORS.umbrella, x, 2.6, z, 1.8, 0.45, 1.8))
  COLORS.scoops.forEach((c, k) => {
    const s = at(-0.3 + k * 0.3, 0)
    out.push(prop('ball', c, s.x, 1.13, s.z, 0.2))
  })
}

/** Balloon bunch tied to the back of the far-left bench. */
function balloons(out: Prop[]) {
  const b = BENCHES[2]
  const ax = b.x - 0.25
  const ay = 0.75
  const az = b.z + 0.6
  const spots = [
    [-0.35, 2.35, 0.1],
    [0.1, 2.6, 0.3],
    [0.35, 2.3, -0.1],
    [-0.05, 2.15, -0.35],
  ]
  spots.forEach(([dx, y, dz], k) => {
    out.push(prop('ball', COLORS.balloons[k], ax + dx, y, az + dz, 0.42, 0.5, 0.42))
    out.push(stick(COLORS.string, ax, ay, az, ax + dx, y - 0.25, az + dz, 0.015))
  })
}

const CHAIR_X = COURT.halfWidth + 0.95
/**
 * The flip scoreboard: centre (x, y), size, card offset from the middle, and the z of the cards' front
 * (camera side). boardprop.ts writes the live score over the cards.
 */
export const BOARD = { x: -CHAIR_X, y: 0.95, w: 0.9, h: 0.5, card: 0.2, face: -0.06 } as const

/** Umpire chair by the right net post; a little flip scoreboard by the left one. */
function netSide(out: Prop[], k: Spread) {
  const cx = CHAIR_X
  let from = out.length
  for (const dx of [-0.2, 0.2])
    for (const dz of [-0.2, 0.2]) out.push(prop('post', COLORS.wood, cx + dx, 0.6, dz, 0.06, 1.2, 0.06))
  out.push(prop('box', COLORS.wood, cx, 1.24, 0, 0.55, 0.08, 0.55))
  out.push(prop('box', COLORS.wood, cx + 0.25, 1.5, 0, 0.06, 0.45, 0.55))
  for (const y of [0.35, 0.75]) out.push(prop('box', COLORS.wood, cx - 0.2, y, 0, 0.05, 0.05, 0.46))
  moveSince(out, from, k, { x: cx, z: 0 })
  from = out.length
  const sx = BOARD.x
  for (const dx of [-0.32, 0.32]) out.push(prop('post', COLORS.wood, sx + dx, 0.4, 0, 0.05, 0.8, 0.05))
  out.push(prop('box', COLORS.board, sx, BOARD.y, 0, BOARD.w, BOARD.h, 0.08))
  for (const dx of [-BOARD.card, BOARD.card])
    out.push(prop('box', COLORS.card, sx + dx, BOARD.y, BOARD.face + 0.01, 0.3, 0.36, 0.02))
  moveSince(out, from, k, { x: sx, z: 0 })
}

/**
 * Lawn cover in natural clumps: grass patches and the odd wildflower drift and rock, clear of the fence,
 * blankets, benches, path and the kept spots. Core patches on every look; more on Medium, the most on High.
 */
function groundCover(out: Prop[], r: () => number) {
  const PATCHES = [36, 30, 40]
  const spots = [...BLANKETS, ...BENCHES, ...FANS]
  PATCHES.forEach((count, detail) => {
    let n = 0
    while (n < count) {
      const x = (r() < 0.5 ? -1 : 1) * (FENCE_X + 0.4 + r() * 14)
      const z = -9 + r() * 30
      if (spots.some((b) => Math.abs(b.x - x) < 1.2 && Math.abs(b.z - z) < 1)) continue
      if (onPath(x, z) || kept(x, z)) continue
      n++
      const d = detail as 0 | 1 | 2
      grass(out, r, x, z, 2 + Math.floor(r() * 4), 0.45, { detail: d })
      if (d > 0 && r() < 0.3)
        flowers(out, r, x + 0.3, z, 3, r() < 0.5 ? ['daisy'] : ['yellow', 'lilac'], 0.3, { detail: d })
      if (d === 1 && r() < 0.12) rocks(out, r, x - 0.4, z + 0.2, 0.25 + r() * 0.2, false, { detail: d })
    }
  })
}

type Spread = { x: number; z: number }

/**
 * Spreads the props added since `from` out with the court (`k` = courtScale; sizes unchanged). With an
 * `anchor` they move as one rigid piece (the anchor's spread), so a cart, a blanket's picnic or the
 * chair keeps its shape; without, each prop spreads on its own. A no-op on the Normal court.
 */
function moveSince(out: Prop[], from: number, k: Spread, anchor?: Spread) {
  if (k.x === 1 && k.z === 1) return
  for (let i = from; i < out.length; i++) {
    const p = out[i]
    if (anchor) {
      p.x += anchor.x * (k.x - 1)
      p.z += anchor.z * (k.z - 1)
    } else {
      p.x *= k.x
      p.z *= k.z
    }
  }
}

/**
 * Every mid-layer prop of the park around `court` (default Normal). Deterministic (same park every load).
 * The park is laid out for the Normal court and spread out by courtScale (prop sizes unchanged); the hedge
 * and fence are built from the real court, since they hug the surround.
 */
export function parkLayout(court: CourtDims = COURT): Prop[] {
  const k = courtScale(court)
  const out: Prop[] = []
  const r = rng(7)
  const spread = (build: () => void, anchor?: Spread) => {
    const from = out.length
    build()
    moveSince(out, from, k, anchor)
  }
  spread(() => trees(out, r))
  spread(() => bushesAndBeds(out, r))
  hedgeAndFence(out, court)
  spread(() => pathAndLamps(out, r))
  picnicAndLanterns(out, k)
  spread(() => iceCreamCart(out), CART)
  spread(() => refreshmentStall(out), STALL)
  spread(() => garden(out, r), GARDEN)
  spread(() => parkSign(out), SIGN)
  spread(() => balloons(out), BENCHES[2])
  netSide(out, k)
  spread(() => groundCover(out, r))
  spread(() => farRing(out, r))
  return out
}
