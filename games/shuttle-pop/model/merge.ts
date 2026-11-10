// Geometry building blocks for the chibi models: place a primitive (`part`), paint it, and merge every
// part rigidly attached to one bone into a single vertex-coloured geometry (one draw call per bone).
// Runs once per look at load time (allocation is fine here; nothing in this file runs per frame).

import { AO_DEFAULTS, bakeAO, type Occluder } from './ao'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type Vector3Like,
} from 'three'

/** A vertex colour: one hex for the whole part, or a function of the placed vertex position. */
export type Paint = number | ((x: number, y: number, z: number) => number)

/**
 * What a surface is made of (toy render): skin (soft, a little sheen), cloth (fabric sheen), knit (matte,
 * rough), hair / plastic (glossy clear coat), rubber (soles), metal.
 */
export type Surf = 'skin' | 'cloth' | 'knit' | 'hair' | 'plastic' | 'rubber' | 'metal'
/** Per surface: roughness, clear-coat weight, sheen weight (the `surf` vertex attribute; actors.ts reads it). */
export const SURFS: Record<Surf, Triple> = {
  skin: [0.5, 0.05, 0.35],
  cloth: [0.72, 0, 0.9],
  knit: [0.97, 0, 0.4],
  hair: [0.55, 0.15, 0],
  plastic: [0.32, 0.5, 0],
  rubber: [0.55, 0.15, 0],
  metal: [0.32, 0.5, 0],
}

/** A placed (already transformed) geometry with its paint (and surface, else the merge's default). */
export interface Part {
  geo: BufferGeometry
  paint: Paint
  surf?: Surf | ((x: number, y: number, z: number) => Surf)
}

/** Marks `parts` as made of `surf` (returns them). */
export function made(surf: Part['surf'], parts: Part[]): Part[] {
  for (const pt of parts) pt.surf = surf
  return parts
}

export type Triple = readonly [number, number, number]

export interface Place {
  /** Position. */
  p?: Triple
  /** Euler rotation (rad, XYZ), or a quaternion. */
  r?: Triple | Quaternion
  /** Uniform or per-axis scale (a negative axis mirrors; winding is fixed up). */
  s?: number | Triple
}

const tmpQ = new Quaternion()
const tmpE = new Euler()

/** The matrix of a placement. */
export function placeMatrix(o: Place = {}): Matrix4 {
  const p = o.p ?? [0, 0, 0]
  const s = o.s ?? 1
  if (o.r instanceof Quaternion) tmpQ.copy(o.r)
  else if (o.r) tmpQ.setFromEuler(tmpE.set(o.r[0], o.r[1], o.r[2]))
  else tmpQ.identity()
  const sv = typeof s === 'number' ? new Vector3(s, s, s) : new Vector3(s[0], s[1], s[2])
  return new Matrix4().compose(new Vector3(p[0], p[1], p[2]), tmpQ, sv)
}

/** Applies `m` to a geometry in place; a mirroring matrix flips the triangle winding back. */
function transform(geo: BufferGeometry, m: Matrix4): void {
  geo.applyMatrix4(m)
  if (m.determinant() < 0) {
    const index = geo.getIndex()
    if (!index) throw new Error('merge: mirrored parts must be indexed')
    const a = index.array
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1]
      a[i + 1] = a[i + 2]
      a[i + 2] = t
    }
    index.needsUpdate = true
  }
}

/** A copy of `geo` placed by `o`, painted `paint`. The source geometry is untouched. */
export function part(geo: BufferGeometry, paint: Paint, o?: Place): Part {
  const g = geo.index ? geo.clone() : indexed(geo)
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  if (o) transform(g, placeMatrix(o))
  return { geo: g, paint }
}

/** Moves already placed parts by `o` (nest a sub-assembly: build it at the origin, then place it). */
export function place(parts: Part[], o: Place): Part[] {
  const m = placeMatrix(o)
  for (const pt of parts) transform(pt.geo, m)
  return parts
}

function indexed(geo: BufferGeometry): BufferGeometry {
  const g = geo.clone()
  const n = g.getAttribute('position').count
  const idx: number[] = []
  for (let i = 0; i < n; i++) idx.push(i)
  g.setIndex(idx)
  return g
}

const col = new Color()

/** Merge options: bake ambient occlusion into the colours (with other bones' rest geometry as occluders). */
export interface MergeOpts {
  /** Extra occluders (other bones at rest) and the darkening of a fully enclosed vertex (ao.ts default). */
  ao?: { extra?: readonly Part[]; strength?: number }
  /** Surface of parts that don't name one (default cloth). */
  surf?: Surf
}

/** A placed part as an AO occluder. */
const occluderOf = (pt: Part): Occluder => ({
  pos: pt.geo.getAttribute('position').array,
  index: pt.geo.getIndex()!.array,
})

/**
 * One geometry from `parts`: position + normal + vertex `color`, the parts' vertices in order (so part
 * k owns a contiguous vertex range). UVs and other attributes are dropped. `opts.ao` darkens the colours
 * in creases (ao.ts).
 */
export function mergeParts(parts: readonly Part[], opts: MergeOpts = {}): BufferGeometry {
  let verts = 0
  let tris = 0
  for (const pt of parts) {
    verts += pt.geo.getAttribute('position').count
    tris += pt.geo.getIndex()!.count
  }
  const pos = new Float32Array(verts * 3)
  const nor = new Float32Array(verts * 3)
  const rgb = new Float32Array(verts * 3)
  const srf = new Float32Array(verts * 3)
  const index = verts > 65535 ? new Uint32Array(tris) : new Uint16Array(tris)
  let v = 0
  let t = 0
  for (const pt of parts) {
    const P = pt.geo.getAttribute('position')
    const N = pt.geo.getAttribute('normal')
    const I = pt.geo.getIndex()!
    const fixed = typeof pt.paint === 'number' ? col.setHex(pt.paint).clone() : null
    const surf = pt.surf ?? opts.surf ?? 'cloth'
    const fixedSurf = typeof surf === 'string' ? SURFS[surf] : null
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i)
      const y = P.getY(i)
      const z = P.getZ(i)
      const k = (v + i) * 3
      pos[k] = x
      pos[k + 1] = y
      pos[k + 2] = z
      nor[k] = N.getX(i)
      nor[k + 1] = N.getY(i)
      nor[k + 2] = N.getZ(i)
      const c = fixed ?? col.setHex((pt.paint as (x: number, y: number, z: number) => number)(x, y, z))
      rgb[k] = c.r
      rgb[k + 1] = c.g
      rgb[k + 2] = c.b
      const sf = fixedSurf ?? SURFS[(surf as (x: number, y: number, z: number) => Surf)(x, y, z)]
      srf[k] = sf[0]
      srf[k + 1] = sf[1]
      srf[k + 2] = sf[2]
    }
    for (let i = 0; i < I.count; i++) index[t + i] = I.getX(i) + v
    v += P.count
    t += I.count
  }
  if (opts.ao) {
    const f = bakeAO({ pos, nor, index }, (opts.ao.extra ?? []).map(occluderOf), {
      ...AO_DEFAULTS,
      strength: opts.ao.strength ?? AO_DEFAULTS.strength,
    })
    for (let i = 0; i < verts; i++) {
      rgb[i * 3] *= f[i]
      rgb[i * 3 + 1] *= f[i]
      rgb[i * 3 + 2] *= f[i]
    }
  }
  const out = new BufferGeometry()
  out.setAttribute('position', new BufferAttribute(pos, 3))
  out.setAttribute('normal', new BufferAttribute(nor, 3))
  out.setAttribute('color', new BufferAttribute(rgb, 3))
  out.setAttribute('surf', new BufferAttribute(srf, 3))
  out.setIndex(new BufferAttribute(index, 1))
  out.computeBoundingSphere()
  return out
}

/** Unit direction for polar angle `polar` (from +y) and azimuth `az` (0 = +z face, + toward +x). */
export function dir(polar: number, az: number): Vector3 {
  return new Vector3(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az))
}

/** Rotation turning `from` (unit) onto `to` (unit). */
export function turn(from: Vector3Like, to: Vector3Like): Quaternion {
  return new Quaternion().setFromUnitVectors(
    new Vector3(from.x, from.y, from.z),
    new Vector3(to.x, to.y, to.z).normalize(),
  )
}

/** `hex` mixed toward black by `k` (0..1). */
export function shade(hex: number, k: number): number {
  return new Color(hex).lerp(new Color(0x000000), k).getHex()
}
/** `hex` mixed toward white by `k` (0..1). */
export function tint(hex: number, k: number): number {
  return new Color(hex).lerp(new Color(0xffffff), k).getHex()
}
