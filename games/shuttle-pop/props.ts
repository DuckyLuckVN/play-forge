// The park's mid layer as data: trees, bushes, hedge, picket fence, stepping-stone path, flower beds,
// lamp posts, picnic blankets, lantern poles + lanterns, an ice-cream cart, a balloon bunch, an umpire
// chair and a little scoreboard by the net, and grass tufts. Everything is a `Prop` (kit.ts), so the
// whole layout draws as one InstancedMesh per shape (6 draw calls).
//
// Readability rules (props.test.ts checks them): nothing on the court or its run-off, only the net-side
// furniture inside the surround, nothing taller than a tuft between the camera and the near baseline,
// and nothing pale above the net behind the far baseline (the white shuttle must read there).
//
// Render space: the local player is near (z < 0), the camera behind them looking toward +z.

import { COURT } from './physics'
import { prop, rng, stick, yawTo, type Prop } from './kit'

/** Court surround beyond the lines (m): the warm border around the court surface. */
export const SURROUND = { x: 1.3, z: 1.6 } as const

const COLORS = {
  trunk: '#8f7563',
  canopies: ['#93b07c', '#a1ba86', '#86a576', '#adbf8c', '#cdb07e'],
  /** Far row: hazier, so depth reads. */
  farCanopies: ['#a9b78f', '#b4bd93', '#c2b48f', '#c9a99a'],
  blossomTree: '#d9a6a6',
  hedge: '#6f8f5c',
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

/** Low picket fence along both sides of the surround; low hedge across the far end. */
const FENCE_X = COURT.halfWidth + SURROUND.x + 0.3
const HEDGE_Z = COURT.halfLen + SURROUND.z + 1
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

function hedgeAndFence(out: Prop[]) {
  // Hedge: four low segments across the far end.
  for (let k = 0; k < 4; k++)
    out.push(prop('leaf', COLORS.hedge, -3.3 + k * 2.2, 0.3, HEDGE_Z, 2.5, 0.75, 0.85))
  // Picket fence along both sides: pickets + two rails.
  const z0 = -(COURT.halfLen + SURROUND.z)
  const z1 = COURT.halfLen + SURROUND.z + 0.4
  for (const side of [-1, 1]) {
    const x = side * FENCE_X
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

function picnicAndLanterns(out: Prop[]) {
  BLANKETS.forEach((b, i) => {
    const o = Math.sign(b.x)
    out.push(prop('box', COLORS.blankets[i], b.x, 0.015, b.z, 1.7, 0.03, 1.3, (i - 1.5) * 0.12))
    // Basket, juice box, plate.
    out.push(prop('box', COLORS.picnic[0], b.x + o * 0.5, 0.13, b.z - 0.35, 0.38, 0.22, 0.26, 0.3))
    out.push(prop('box', COLORS.picnic[1], b.x + o * 0.15, 0.08, b.z - 0.45, 0.08, 0.13, 0.06))
    out.push(prop('box', COLORS.picnic[2], b.x + o * 0.55, 0.04, b.z + 0.3, 0.26, 0.015, 0.26, 0.5))
  })
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
}

/** Ice-cream cart under a coral umbrella, parked past the far right corner. */
function iceCreamCart(out: Prop[]) {
  const x = 7.2
  const z = 10.6
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

/** Umpire chair by the right net post; a little flip scoreboard by the left one. */
function netSide(out: Prop[]) {
  const cx = COURT.halfWidth + 0.95
  for (const dx of [-0.2, 0.2])
    for (const dz of [-0.2, 0.2]) out.push(prop('post', COLORS.wood, cx + dx, 0.6, dz, 0.06, 1.2, 0.06))
  out.push(prop('box', COLORS.wood, cx, 1.24, 0, 0.55, 0.08, 0.55))
  out.push(prop('box', COLORS.wood, cx + 0.25, 1.5, 0, 0.06, 0.45, 0.55))
  for (const y of [0.35, 0.75]) out.push(prop('box', COLORS.wood, cx - 0.2, y, 0, 0.05, 0.05, 0.46))
  const sx = -cx
  for (const dx of [-0.32, 0.32]) out.push(prop('post', COLORS.wood, sx + dx, 0.4, 0, 0.05, 0.8, 0.05))
  out.push(prop('box', COLORS.board, sx, 0.95, 0, 0.9, 0.5, 0.08))
  for (const dx of [-0.2, 0.2]) out.push(prop('box', COLORS.card, sx + dx, 0.95, -0.05, 0.3, 0.36, 0.02))
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

/** Every mid-layer prop of the park. Deterministic (same park every load). */
export function parkLayout(): Prop[] {
  const out: Prop[] = []
  const r = rng(7)
  trees(out, r)
  bushesAndBeds(out, r)
  hedgeAndFence(out)
  pathAndLamps(out, r)
  picnicAndLanterns(out)
  iceCreamCart(out)
  balloons(out)
  netSide(out)
  tufts(out, r)
  return out
}
