// Scenery kit: shared helpers and the "prop batch" that keeps the park cheap to draw.
//
// A park prop is plain data (`Prop`: a unit shape, a transform and a colour). `buildProps` turns a
// whole layout into ONE InstancedMesh per shape (box, post, leaf, ball, cone, glow, rock, slab, tuft,
// bloom; plus an unshadowed twin for far props), so adding more trees, fences or flowers costs
// instances, not draw calls. Every unit shape spans 1 m on each axis
// (centred on its origin), so a prop's size is just its scale and its top is `y + sy / 2`.
// Lit props cast and receive the sun's soft shadow (when the graphics look has real shadows); glow bulbs
// are unlit and drawn brighter than white, so only they reach the bloom threshold (look.ts).
// Detail: each prop has a `detail` level (0 core, 1 Medium+, 2 High only). Instances are sorted by it, so a
// graphics look only shortens each mesh's draw count (`showDetail`): no rebuild, no allocation.

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { LOOK } from './look'

/**
 * Unit shapes: box, tapered post (trunks, poles), low-poly leaf blob, ball, cone, unlit glow bulb, an unlit
 * LED panel (a box drawn at its own colour whatever the sun does, under the bloom threshold), a faceted
 * rock, a 7-sided paving slab, a grass tuft (five blades) and a flower head (a five-petal star, centre warm).
 */
export type Shape =
  'box' | 'post' | 'leaf' | 'ball' | 'cone' | 'glow' | 'panel' | 'rock' | 'slab' | 'tuft' | 'bloom'

/** Prop detail level: 0 = every look, 1 = Medium and High, 2 = High only. */
export type Detail = 0 | 1 | 2

export interface Prop {
  shape: Shape
  x: number
  /** Centre height. */
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  /** Turn about y (applied last). */
  yaw: number
  /** Tip about the prop's own x (applied first), e.g. strings leaning toward a balloon. */
  tilt: number
  /** Roll about z (applied first), e.g. a wheel on its side. */
  roll: number
  color: string
  /** Shown from this graphics detail up (default 0: always). */
  detail?: Detail
  /** Far props: no shadow (outside the sun's shadow box anyway; skips the shadow pass). Default true. */
  shadow?: boolean
}

/** Top of a prop (m), ignoring tilt. */
export const topOf = (p: Prop) => p.y + p.sy / 2

/** A prop at (x, y, z) sized (sx, sy, sz). */
export function prop(
  shape: Shape,
  color: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy = sx,
  sz = sx,
  yaw = 0,
): Prop {
  return { shape, x, y, z, sx, sy, sz, yaw, tilt: 0, roll: 0, color }
}

/** A thin post from (x0, y0, z0) to (x1, y1, z1), `w` m thick (strings, struts). */
export function stick(
  color: string,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  w: number,
): Prop {
  const dx = x1 - x0
  const dy = y1 - y0
  const dz = z1 - z0
  const len = Math.hypot(dx, dy, dz)
  const p = prop('post', color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, w, len, w)
  // +y → direction: tip about x by acos(dy), then turn about y toward (dx, dz).
  p.tilt = Math.acos(Math.max(-1, Math.min(1, dy / (len || 1))))
  p.yaw = Math.atan2(dx, dz)
  return p
}

/** Tiny seeded random (placement only; same park every load). */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Yaw that turns model +z toward (tx, tz). */
export const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z)

export function lambert(color = '#ffffff', flatShading = false): MeshLambertMaterial {
  return new MeshLambertMaterial({ color, flatShading })
}

/** An InstancedMesh; shadows off unless asked (`shadows`: cast + receive the sun's shadow). */
export function instanced(
  geo: BufferGeometry,
  mat: MeshLambertMaterial | MeshBasicMaterial,
  count: number,
  shadows = false,
) {
  const m = new InstancedMesh(geo, mat, count)
  m.castShadow = shadows
  m.receiveShadow = shadows
  return m
}

function unitGeometry(shape: Shape): BufferGeometry {
  switch (shape) {
    case 'box':
      return new BoxGeometry(1, 1, 1)
    case 'post':
      return new CylinderGeometry(0.35, 0.5, 1, 6)
    case 'leaf':
      return new IcosahedronGeometry(0.5, 1)
    case 'ball':
      return new SphereGeometry(0.5, 8, 6)
    case 'cone':
      return new ConeGeometry(0.5, 1, 7)
    case 'glow':
      return new SphereGeometry(0.5, 8, 6)
    case 'panel':
      return new BoxGeometry(1, 1, 1)
    case 'rock':
      return new DodecahedronGeometry(0.5, 0)
    case 'slab':
      return new CylinderGeometry(0.5, 0.5, 1, 7)
    case 'tuft':
      return tuftGeometry()
    case 'bloom':
      return bloomGeometry()
  }
}

/** Five grass blades (single triangles) fanned out from a 1 m footprint, base at y = -0.5, tips at +0.5. */
export function tuftGeometry(): BufferGeometry {
  const pos: number[] = []
  const BLADES = 5
  for (let i = 0; i < BLADES; i++) {
    const a = (i / BLADES) * Math.PI * 2 + 0.4
    const lean = i % 2 ? 0.3 : 0.18
    const bx = Math.cos(a) * 0.12
    const bz = Math.sin(a) * 0.12
    const tall = i % 2 ? 1 : 0.8
    // Base edge across the lean direction, tip pushed outward.
    const px = -Math.sin(a) * 0.09
    const pz = Math.cos(a) * 0.09
    pos.push(bx - px, -0.5, bz - pz, bx + px, -0.5, bz + pz)
    pos.push(Math.cos(a) * lean * 1.6, -0.5 + tall, Math.sin(a) * lean * 1.6)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.computeVertexNormals()
  return geo
}

/**
 * A flower head: six rounded petals (notch, shoulder, tip, shoulder) fanned round a raised centre (y = +0.5;
 * petal rims at y = -0.5). Vertex colours: white petals, warm-yellow centre, so the instance colour tints
 * the petals and leaves a golden heart.
 */
export function bloomGeometry(): BufferGeometry {
  const PETALS = 6
  const PER = 4
  const pos: number[] = []
  const col: number[] = []
  const HEART = [1, 0.78, 0.32]
  const SHAPE = [0.16, 0.44, 0.5, 0.44]
  const rim = (k: number) => {
    const a = (k / (PETALS * PER)) * Math.PI * 2
    const r = SHAPE[k % PER]
    return [Math.cos(a) * r, -0.5, Math.sin(a) * r]
  }
  for (let k = 0; k < PETALS * PER; k++) {
    // Counter-clockwise from above (faces up).
    pos.push(0, 0.5, 0, ...rim(k + 1), ...rim(k))
    col.push(...HEART, 1, 1, 1, 1, 1, 1)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new Float32BufferAttribute(col, 3))
  geo.computeVertexNormals()
  return geo
}

const SHAPES: readonly Shape[] = [
  'box',
  'post',
  'leaf',
  'ball',
  'cone',
  'glow',
  'panel',
  'rock',
  'slab',
  'tuft',
  'bloom',
]

/** Ground cover: takes the sun's shadow but casts none (too small to read; saves the shadow pass). */
const NO_CAST: ReadonlySet<Shape> = new Set(['glow', 'tuft', 'bloom', 'slab'])

/** Per prop-mesh: how many instances each detail level shows (cumulative: [0], [0..1], [0..2]). */
const DETAIL_COUNTS = 'detailCounts'

/**
 * One InstancedMesh per shape used in `props` (and an unshadowed twin for its far props): lit + flat-shaded +
 * shadowed; glow bulbs unlit HDR (they bloom); LED panels unlit at their colour (cast a shadow, never take
 * one); tufts double-sided; flower heads keep their vertex colours. Instances sorted by detail (see
 * `showDetail`), every detail shown until then. Build time only.
 */
export function buildProps(props: readonly Prop[]): InstancedMesh[] {
  const m = new Matrix4()
  const q = new Quaternion()
  const e = new Euler(0, 0, 0, 'YXZ')
  const v = new Vector3()
  const s = new Vector3()
  const tint = new Color()
  const meshes: InstancedMesh[] = []
  for (const shape of SHAPES)
    for (const shadowed of [true, false]) {
      const mine = props
        .filter((p) => p.shape === shape && (p.shadow ?? true) === shadowed)
        .map((p, i) => ({ p, i }))
        // Stable sort by detail: build order is kept within a level.
        .sort((a, b) => (a.p.detail ?? 0) - (b.p.detail ?? 0) || a.i - b.i)
        .map(({ p }) => p)
      if (mine.length === 0) continue
      const glow = shape === 'glow'
      const panel = shape === 'panel'
      // Bulbs: no fog, so far lanterns still glow through the haze.
      const mat = glow
        ? new MeshBasicMaterial({ fog: false })
        : panel
          ? new MeshBasicMaterial()
          : lambert('#ffffff', true)
      if (shape === 'tuft') mat.side = DoubleSide
      if (shape === 'bloom') mat.vertexColors = true
      const mesh = instanced(unitGeometry(shape), mat, mine.length, shadowed && !glow && !panel)
      mesh.castShadow = shadowed && !NO_CAST.has(shape)
      mesh.name = shadowed ? shape : `${shape}:far`
      const counts = [0, 0, 0]
      mine.forEach((p, i) => {
        e.set(p.tilt, p.yaw, p.roll)
        mesh.setMatrixAt(i, m.compose(v.set(p.x, p.y, p.z), q.setFromEuler(e), s.set(p.sx, p.sy, p.sz)))
        tint.set(p.color)
        // Same brightness for every bulb whatever its hue (a red lantern is dim by luminance alone).
        if (glow)
          tint.multiplyScalar(LOOK.glow / Math.max(0.05, 0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b))
        mesh.setColorAt(i, tint)
        for (let d = p.detail ?? 0; d < 3; d++) counts[d]++
      })
      mesh.userData[DETAIL_COUNTS] = counts
      meshes.push(mesh)
    }
  return meshes
}

/**
 * Shows only the props at or under `detail` (0 core, 1 Medium, 2 High): a draw-count change per mesh, no
 * rebuild. A mesh with nothing to show is hidden (no empty draw call).
 */
export function showDetail(meshes: readonly InstancedMesh[], detail: Detail) {
  for (const mesh of meshes) {
    const counts = mesh.userData[DETAIL_COUNTS] as number[] | undefined
    if (!counts) continue
    mesh.count = counts[detail]
    mesh.visible = mesh.count > 0
  }
}
