// The park's mid layer as data: trees, bushes, a far tournament backstop, near-corner kit, picket fence, stepping-stone path, flower beds,
// lamp posts, picnic blankets, lantern poles + lanterns, an ice-cream cart, a balloon bunch, an umpire
// chair and a little scoreboard by the net, and grass tufts. Everything is a `Prop` (kit.ts), so the
// whole layout draws as one InstancedMesh per shape (6 draw calls).
//
// Readability rules (props.test.ts checks them): nothing on the court or its run-off, only the net-side
// furniture inside the surround, nothing taller than a tuft between the camera and the near baseline,
// and nothing pale above the net behind the far baseline (the white shuttle must read there).
//
// Render space: the local player is near (z < 0), the camera behind them looking toward +z.

import { courtScale, spreadXZ } from './courtsize'
import { COURT, type CourtDims } from './physics'
import { prop, rng, stick, yawTo, type Prop } from './kit'

/** Court surround beyond the lines (m) on the Normal court: the warm border around the court surface. */
export const SURROUND = { x: 1.3, z: 1.6 } as const
/** The surround on `court`: it scales with the court (a bigger ring, a wider border). */
export function surroundOf(court: CourtDims): { x: number; z: number } {
  return spreadXZ(SURROUND, courtScale(court))
}

const COLORS = {
  trunk: '#8f7563',
  canopies: ['#93b07c', '#a1ba86', '#86a576', '#adbf8c', '#cdb07e'],
  /** Far row: hazier, so depth reads. */
  farCanopies: ['#a9b78f', '#b4bd93', '#c2b48f', '#c9a99a'],
  blossomTree: '#d9a6a6',
  hedge: '#6f8f5c',
  /** Far backstop wood (dark, so the shuttle reads) and its banners (mid tones, never pale). */
  backstop: '#5b4636',
  banners: ['#d9645a', '#3f86b8', '#d79a35', '#7c5cb8', '#2f9a84'],
  cooler: '#4f9bc9',
  cardLid: '#e9e1d2',
  shuttle: '#f6f2ea',
  bag: '#c8524f',
  bottle: '#7cc6e8',
  bottleCap: '#3d6fa8',
  fence: '#b98f6d',
  stone: '#cbb49a',
  flowers: ['#e6918f', '#f0c36a', '#c4a0d8', '#f2a7b5', '#ef9f72'],
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
  scoops: ['#f2a7b5', '#f6e2b8', '#9b6b52'],
  balloons: ['#e88a8a', '#f0c36a', '#8fb7d8', '#b79ad6'],
  string: '#efe6dc',
  wood: '#9a7458',
  /** Mid-tone (not near-black), so the board by the net doesn't pull the eye on a small screen. */
  board: '#7a6f93',
  card: '#efe2c8',
  tufts: ['#7f9f63', '#8fae6b', '#6f8f58'],
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

function trees(out: Prop[], r: () => number) {
  const tree = (x: number, z: number, s: number, color: string) => {
    out.push(prop('post', COLORS.trunk, x, 0.8 * s, z, 0.4 * s, 1.6 * s, 0.4 * s))
    out.push(prop('leaf', color, x, 2.5 * s, z, 2.5 * s, 2.2 * s, 2.5 * s, r() * Math.PI))
  }
  const pick = (list: readonly string[]) => list[Math.floor(r() * list.length)]
  // Far row, well behind the far baseline (mid-green canopies, never pale: the shuttle reads on them).
  for (let x = -18; x <= 18; x += 3.4)
    tree(x + (r() - 0.5) * 1.6, 17 + r() * 7, 1 + r() * 0.5, pick(COLORS.canopies))
  // Back row: bigger and hazier, fills the gaps up to the hills.
  for (let x = -27; x <= 27; x += 4.2)
    tree(x + (r() - 0.5) * 2, 28 + r() * 6, 1.4 + r() * 0.5, pick(COLORS.farCanopies))
  // Side rows, well outside the lanterns; the odd blossom tree for colour.
  for (const side of [-1, 1])
    for (let z = -10; z <= 14; z += 4)
      tree(
        side * (12 + r() * 4),
        z + (r() - 0.5) * 2,
        0.8 + r() * 0.4,
        r() < 0.2 ? COLORS.blossomTree : pick(COLORS.canopies),
      )
  // Far corners, closing the gap between the side and far rows.
  for (const side of [-1, 1])
    for (let k = 0; k < 4; k++)
      tree(side * (17 + k * 2.5 + r()), 10 + k * 3 + r() * 2, 1 + r() * 0.4, pick(COLORS.canopies))
}

function bushesAndBeds(out: Prop[], r: () => number) {
  let n = 0
  for (const side of [-1, 1])
    for (let z = -6; z <= 10; z += 5.5) {
      const s = 0.45 + r() * 0.2
      out.push(
        prop(
          'leaf',
          COLORS.canopies[n++ % 3],
          side * (8 + r() * 0.8),
          0.35 * s,
          z + r() * 2,
          2.8 * s,
          1.8 * s,
          2.4 * s,
          r() * Math.PI,
        ),
      )
    }
  // Flower patches: a cluster of blossoms around a low leafy mound.
  const beds = [
    { x: -5.4, z: 9.9 },
    { x: 5.4, z: 9.9 },
    { x: -8.4, z: -5.6 },
    { x: 8.7, z: 2.4 },
    { x: -9.0, z: 8.6 },
    { x: 8.5, z: -6.4 },
  ]
  for (const b of beds) {
    for (let k = 0; k < 9; k++) {
      const s = 0.16 + r() * 0.08
      out.push(
        prop(
          'ball',
          COLORS.flowers[Math.floor(r() * COLORS.flowers.length)],
          b.x + (r() - 0.5) * 1.4,
          0.12 + r() * 0.06,
          b.z + (r() - 0.5) * 0.65,
          s,
        ),
      )
    }
    out.push(prop('leaf', COLORS.hedge, b.x + (r() - 0.5) * 0.8, 0.1, b.z, 0.7, 0.35, 0.5))
  }
}

/** The far backstop (Normal court): half-length, post spacing, post height, banner drop. */
const BACKSTOP = { half: 4.55, step: 1.1, postH: 1.25, bannerH: 0.55 } as const

/**
 * The far end: a low dark-wood tournament backstop (posts, top rail, kick board) hung with cloth banners
 * in alternating colours, a bunting line along the top. Everything stays under the net's height, so the
 * white shuttle still reads against it.
 */
function farBackstop(out: Prop[], court: CourtDims) {
  const sur = surroundOf(court)
  const kx = courtScale(court).x
  const z = court.halfLen + sur.z + 1
  const half = BACKSTOP.half * kx
  const spans = Math.max(2, Math.round((half * 2) / BACKSTOP.step))
  const step = (half * 2) / spans
  const { postH, bannerH } = BACKSTOP
  for (let i = 0; i <= spans; i++)
    out.push(prop('box', COLORS.backstop, -half + i * step, postH / 2, z, 0.1, postH, 0.1))
  out.push(prop('box', COLORS.backstop, 0, postH - 0.04, z, half * 2 + 0.1, 0.07, 0.08))
  out.push(prop('box', COLORS.backstop, 0, 0.1, z, half * 2, 0.2, 0.06))
  // A banner per span (a small gap at each post), its hem a darker strip; colours cycle.
  for (let i = 0; i < spans; i++) {
    const x = -half + (i + 0.5) * step
    const c = COLORS.banners[i % COLORS.banners.length]
    const y = postH - 0.12 - bannerH / 2
    out.push(prop('box', c, x, y, z - 0.06, step - 0.14, bannerH, 0.03))
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

/** Picket fence along both sides, the far backstop and the near corners: built from the real court (they hug the surround). */
function hedgeAndFence(out: Prop[], court: CourtDims) {
  const sur = surroundOf(court)
  farBackstop(out, court)
  nearCorners(out, court)
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

function pathAndLamps(out: Prop[], r: () => number) {
  const stone = (x: number, z: number) =>
    out.push(prop('post', COLORS.stone, x + (r() - 0.5) * 0.15, 0.02, z, 0.6, 0.04, 0.5, r() * Math.PI))
  for (const side of [-1, 1]) {
    for (let z = PATH.z0; z < PATH.zBack - 1.5; z += PATH.step) stone(side * PATH.x, z)
    // Round the corner on a quarter circle.
    for (let a = 0; a <= Math.PI / 2; a += PATH.step / 1.5)
      stone(side * (PATH.x - 1.5 + 1.5 * Math.cos(a)), PATH.zBack - 1.5 + 1.5 * Math.sin(a))
  }
  for (let x = -PATH.x + 1.5 + PATH.step; x < PATH.x - 1.5; x += PATH.step) stone(x, PATH.zBack)
  // Lamp posts beside the path: post, cap, warm bulb. The near pair stands well out to the sides, at
  // (or past) the screen edges, so they frame the court instead of competing with it.
  const lamps = [
    { x: -11, z: -4 },
    { x: 11, z: -3.5 },
    { x: -9.4, z: 5.5 },
    { x: 9.4, z: 6 },
    { x: -6.6, z: 13.6 },
    { x: 6.6, z: 13.6 },
  ]
  for (const l of lamps) {
    out.push(prop('post', COLORS.lampPost, l.x, 1.5, l.z, 0.12, 3, 0.12))
    out.push(prop('box', COLORS.lampPost, l.x, 0.08, l.z, 0.3, 0.16, 0.3))
    out.push(prop('glow', COLORS.bulb, l.x, 3.1, l.z, 0.36, 0.42, 0.36))
    out.push(prop('cone', COLORS.lampPost, l.x, 3.38, l.z, 0.46, 0.2, 0.46))
  }
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

/** Grass tufts (three blades each) scattered on the lawn, clear of the surround, blankets and beds. */
function tufts(out: Prop[], r: () => number) {
  let n = 0
  while (n < 110) {
    const x = (r() < 0.5 ? -1 : 1) * (FENCE_X + 0.3 + r() * 14)
    const z = -9 + r() * 30
    if (BLANKETS.some((b) => Math.abs(b.x - x) < 1.1 && Math.abs(b.z - z) < 0.9)) continue
    n++
    const c = COLORS.tufts[n % COLORS.tufts.length]
    for (let k = 0; k < 3; k++) {
      const blade = prop(
        'cone',
        c,
        x + (k - 1) * 0.06,
        0.13,
        z + (k % 2) * 0.05,
        0.06,
        0.26 + r() * 0.08,
        0.06,
      )
      blade.roll = (k - 1) * 0.35
      out.push(blade)
    }
  }
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
  spread(() => balloons(out), BENCHES[2])
  netSide(out, k)
  spread(() => tufts(out, r))
  return out
}
