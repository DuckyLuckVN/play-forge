// Ambient life: a bird flock crossing the sky now and then, a kite swaying on its string, and pink
// petals drifting over the park. Three draw calls. Every motion is a pure function of the clock
// (`t`, seconds), so it is frame-rate independent, and nothing allocates per frame.

import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Color,
} from 'three'
import { rng } from './kit'

/** Bird flock: one crossing of `cross` s every `period` s (first at `start`), `span` m each way of centre. */
export const FLOCK = { period: 26, cross: 12, start: 5, birds: 7, span: 110, z: 58, y: 12, flap: 9 } as const

/** Flock progress 0..1 across the sky at time t, or −1 between crossings. */
export function flockProgress(t: number): number {
  const since = t - FLOCK.start
  if (since < 0) return -1
  const u = (since % FLOCK.period) / FLOCK.cross
  return u < 1 ? u : -1
}

/** Crossing direction at time t: alternates left → right and right → left. */
export function flockDir(t: number): 1 | -1 {
  return Math.floor(Math.max(0, t - FLOCK.start) / FLOCK.period) % 2 === 0 ? 1 : -1
}

/**
 * Petals drift in two side bands, |x| ∈ [inner, outer] (never over the court, where a pink speck could
 * pass for the shuttle). Heights / depths (m), fall and wind speeds (m/s), sway (m), and the fade band
 * at the wrap edges (share of a band).
 */
export const PETALS = {
  count: 40,
  inner: 4.4,
  outer: 11,
  y: [0.15, 6.5],
  z: [-8, 14],
  fall: 0.32,
  wind: 0.45,
  sway: 0.35,
  edge: 0.08,
  size: 0.12,
} as const

export interface PetalPose {
  x: number
  y: number
  z: number
  /** Size multiplier: 0 at the wrap edges (petals fade out/in rather than pop). */
  s: number
  rx: number
  rz: number
}

const span = (r: readonly [number, number]) => r[1] - r[0]
/** Fade near both ends of a wrapped 0..1 coordinate. */
const edgeFade = (u: number) => Math.max(0, Math.min(1, u / PETALS.edge, (1 - u) / PETALS.edge))

/**
 * Petals drifting down and downwind through a box around the court. Each petal's pose is a pure
 * function of its seeded start and t: it wraps around the box (scaled to 0 at the seams).
 */
export class PetalField {
  private seed: Float32Array

  constructor(
    readonly count: number,
    seed = 13,
  ) {
    const r = rng(seed)
    // Per petal: x0, y0, z0 (0..1), speed mult, sway phase, spin rate.
    this.seed = new Float32Array(count * 6)
    for (let i = 0; i < this.seed.length; i++) this.seed[i] = r()
  }

  at(i: number, t: number, out: PetalPose): PetalPose {
    const k = i * 6
    const sd = this.seed
    const speed = 0.7 + sd[k + 3] * 0.6
    const phase = sd[k + 4] * Math.PI * 2
    const band = PETALS.outer - PETALS.inner
    // Both bands side by side in one wrapped coordinate (2 × band wide): left band, then right.
    const ux = sd[k] + (PETALS.wind * speed * t) / (2 * band)
    const uy = sd[k + 1] - (PETALS.fall * speed * t) / span(PETALS.y)
    const wx = ux - Math.floor(ux)
    const wy = uy - Math.floor(uy)
    const v = (wx * 2) % 1
    const bx = wx < 0.5 ? -PETALS.outer + v * band : PETALS.inner + v * band
    out.x = bx + PETALS.sway * Math.sin(t * 1.3 + phase)
    out.y = PETALS.y[0] + wy * span(PETALS.y)
    out.z = PETALS.z[0] + sd[k + 2] * span(PETALS.z) + PETALS.sway * Math.sin(t * 0.9 + phase * 2)
    out.s = Math.min(edgeFade(v), edgeFade(wy))
    const spin = 1 + sd[k + 5] * 2
    out.rx = t * spin + phase
    out.rz = Math.sin(t * 1.7 + phase) * 0.8
    return out
  }
}

const COLORS = {
  bird: '#6e5a6c',
  petals: ['#e88aa0', '#ef9d93', '#de8fb4', '#f0a27e'],
  kite: ['#e8877c', '#f3c46e'],
  tail: '#8fb7d8',
  string: '#7a6670',
}

/** Kite: string anchor on the grass behind the left trees, kite offset from it (m). */
const KITE = { anchor: [-18, 0, 24], at: [6, 8.5, 8], h: 1.1, w: 0.75 } as const

/** A flat bird: two swept wings meeting at the body, in the xy plane. */
function birdGeometry(): BufferGeometry {
  const g = new BufferGeometry()
  // prettier-ignore
  g.setAttribute('position', new Float32BufferAttribute([
    0, 0, 0, -0.8, 0.28, 0, -0.25, -0.06, 0,
    0, 0, 0, 0.25, -0.06, 0, 0.8, 0.28, 0,
  ], 3))
  return g
}

/** Kite diamond (two-tone), a bow tail and its string as one vertex-coloured mesh (anchor at origin). */
function kiteGeometry(): BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const c = new Color()
  const tri = (color: string, ...p: number[]) => {
    pos.push(...p)
    c.set(color)
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b)
  }
  const [kx, ky, kz] = KITE.at
  const { h, w } = KITE
  const cy = ky + h * 0.2
  // Diamond: four panels around the cross point.
  tri(COLORS.kite[0], kx, cy, kz, kx, ky + h, kz, kx - w, cy, kz)
  tri(COLORS.kite[1], kx, cy, kz, kx + w, cy, kz, kx, ky + h, kz)
  tri(COLORS.kite[1], kx, cy, kz, kx - w, cy, kz, kx, ky - h, kz)
  tri(COLORS.kite[0], kx, cy, kz, kx, ky - h, kz, kx + w, cy, kz)
  // Tail: a thin ribbon with three bows, curling right.
  let tx: number = kx
  let ty: number = ky - h
  for (let b = 0; b < 3; b++) {
    const nx = tx + 0.35
    const ny = ty - 0.9
    tri(COLORS.tail, tx - 0.03, ty, kz, tx + 0.03, ty, kz, nx, ny, kz)
    tri(COLORS.tail, nx - 0.3, ny + 0.15, kz, nx, ny, kz, nx - 0.3, ny - 0.15, kz)
    tri(COLORS.tail, nx + 0.3, ny + 0.15, kz, nx + 0.3, ny - 0.15, kz, nx, ny, kz)
    tx = nx
    ty = ny
  }
  // String: a thin quad from the anchor to the cross point.
  const len = Math.hypot(kx, cy)
  const ox = (-cy / len) * 0.05
  const oy = (kx / len) * 0.05
  tri(COLORS.string, -ox, -oy, 0, ox, oy, 0, kx + ox, cy + oy, kz)
  tri(COLORS.string, -ox, -oy, 0, kx + ox, cy + oy, kz, kx - ox, cy - oy, kz)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}

/** Birds + kite + petals. Add `root` once; call `update(t)` every frame. */
export class Ambient {
  readonly root = new Group()
  private birds: InstancedMesh
  private kite = new Group()
  private petals: InstancedMesh
  private field = new PetalField(PETALS.count)
  private pose: PetalPose = { x: 0, y: 0, z: 0, s: 0, rx: 0, rz: 0 }
  private dummy = new Object3D()

  constructor() {
    this.birds = new InstancedMesh(
      birdGeometry(),
      new MeshBasicMaterial({ color: COLORS.bird, side: DoubleSide, fog: false }),
      FLOCK.birds,
    )
    this.birds.frustumCulled = false

    const kite = new Mesh(kiteGeometry(), new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }))
    this.kite.position.set(KITE.anchor[0], KITE.anchor[1], KITE.anchor[2])
    this.kite.add(kite)

    this.petals = new InstancedMesh(
      new PlaneGeometry(PETALS.size, PETALS.size * 0.7),
      new MeshBasicMaterial({ side: DoubleSide }),
      PETALS.count,
    )
    this.petals.frustumCulled = false
    const tint = new Color()
    for (let i = 0; i < PETALS.count; i++)
      this.petals.setColorAt(i, tint.set(COLORS.petals[i % COLORS.petals.length]))

    this.root.add(this.birds, this.kite, this.petals)
    // First frame poses (and every material in the scene for warm-up).
    this.update(FLOCK.start + 1)
  }

  /** `t` = seconds. */
  update(t: number) {
    const d = this.dummy

    // Flock: a loose V gliding across, wings flapping out of step.
    const u = flockProgress(t)
    this.birds.visible = u >= 0
    if (u >= 0) {
      const dir = flockDir(t)
      const lead = dir * FLOCK.span * (u * 2 - 1)
      for (let i = 0; i < FLOCK.birds; i++) {
        const rank = Math.ceil(i / 2)
        const wing = i % 2 === 0 ? 1 : -1
        d.position.set(
          lead - dir * rank * 1.8,
          FLOCK.y + wing * rank * 0.8 + Math.sin(t * 1.5 + i) * 0.3,
          FLOCK.z + rank * 0.5,
        )
        d.rotation.set(0, 0, 0)
        d.scale.set(1, Math.sin(t * FLOCK.flap + i * 1.3), 1)
        d.updateMatrix()
        this.birds.setMatrixAt(i, d.matrix)
      }
      this.birds.instanceMatrix.needsUpdate = true
    }

    // Kite: sways about the anchor, a gust now and then.
    this.kite.rotation.z = 0.05 * Math.sin(t * 0.6) + 0.02 * Math.sin(t * 1.7)
    this.kite.rotation.x = 0.03 * Math.sin(t * 0.45)

    const p = this.pose
    for (let i = 0; i < PETALS.count; i++) {
      this.field.at(i, t, p)
      d.position.set(p.x, p.y, p.z)
      d.rotation.set(p.rx, 0, p.rz)
      d.scale.setScalar(p.s)
      d.updateMatrix()
      this.petals.setMatrixAt(i, d.matrix)
    }
    this.petals.instanceMatrix.needsUpdate = true
  }
}
