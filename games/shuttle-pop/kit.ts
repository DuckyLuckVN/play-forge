// Scenery kit: shared helpers and the "prop batch" that keeps the park cheap to draw.
//
// A park prop is plain data (`Prop`: a unit shape, a transform and a colour). `buildProps` turns a
// whole layout into ONE InstancedMesh per shape (box, post, leaf, ball, cone, glow), so adding more
// trees, fences or flowers costs instances, not draw calls. Every unit shape spans 1 m on each axis
// (centred on its origin), so a prop's size is just its scale and its top is `y + sy / 2`.

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'

/** Unit shapes: box, tapered post (trunks, poles, stones), low-poly leaf blob, ball, cone, unlit glow bulb. */
export type Shape = 'box' | 'post' | 'leaf' | 'ball' | 'cone' | 'glow'

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

/** An InstancedMesh that neither casts nor receives shadows (scenery never does). */
export function instanced(geo: BufferGeometry, mat: MeshLambertMaterial | MeshBasicMaterial, count: number) {
  const m = new InstancedMesh(geo, mat, count)
  m.castShadow = false
  m.receiveShadow = false
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
  }
}

const SHAPES: readonly Shape[] = ['box', 'post', 'leaf', 'ball', 'cone', 'glow']

/** One InstancedMesh per shape used in `props` (lit + flat-shaded, glow bulbs unlit). Build time only. */
export function buildProps(props: readonly Prop[]): InstancedMesh[] {
  const m = new Matrix4()
  const q = new Quaternion()
  const e = new Euler(0, 0, 0, 'YXZ')
  const v = new Vector3()
  const s = new Vector3()
  const tint = new Color()
  const meshes: InstancedMesh[] = []
  for (const shape of SHAPES) {
    const mine = props.filter((p) => p.shape === shape)
    if (mine.length === 0) continue
    const mat = shape === 'glow' ? new MeshBasicMaterial() : lambert('#ffffff', true)
    const mesh = instanced(unitGeometry(shape), mat, mine.length)
    mine.forEach((p, i) => {
      e.set(p.tilt, p.yaw, p.roll)
      mesh.setMatrixAt(i, m.compose(v.set(p.x, p.y, p.z), q.setFromEuler(e), s.set(p.sx, p.sy, p.sz)))
      mesh.setColorAt(i, tint.set(p.color))
    })
    meshes.push(mesh)
  }
  return meshes
}
