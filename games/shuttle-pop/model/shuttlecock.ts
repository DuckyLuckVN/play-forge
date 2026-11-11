// The shuttlecock model: a rounded orange cork with a red tape band and a low-poly feather skirt (octagonal
// truncated cone, bright white panels, a thread band and a warm band at the open mouth). Visibility first:
// oversized (~2.6× a real one, its silhouette at least the old ball's from any angle), unlit so lighting
// never greys it, and a dark outline so it reads on court, sand, sky and trees. Built once (allocation is fine here; nothing in this file runs per frame).
//
// Model space: +Y is the cork (the leading end: shuttles fly cork-first), the skirt trails toward −Y. The
// origin is the cork / skirt junction, about where a real shuttle's centre of mass sits, so the halo and
// shadow that sit on the shuttle's position stay on its heavy end (the wind streaks start behind the skirt).
// Two geometries → two draw calls (the same as the old ball + rim): `body` (vertex-coloured, unlit) and
// `outline` (a slightly inflated hull, drawn back-side in a dark colour, like the twin outline).

import { BufferAttribute, BufferGeometry, Color, LatheGeometry, Vector2 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** Metres, model space (see the header). */
/**
 * How much bigger the shuttlecock is drawn than its real size (SHUTTLECOCK): easier to follow on a phone.
 * Look only: the sim's shuttle (contact, net, floor) is a point and never reads this.
 */
export const SHUTTLE_LOOK_SCALE = 1.5

export const SHUTTLECOCK = {
  /** Cork dome radius; the dome's centre sits `neck` above the junction. */
  cork: 0.041,
  /** Straight part of the cork (taped) below the dome. */
  neck: 0.014,
  /** Skirt radius at the cork, and at the open end. */
  skirtTop: 0.036,
  skirtEnd: 0.102,
  /** Skirt length (junction → open end). */
  length: 0.18,
  /** Feather panels around (low-poly facets). */
  sides: 8,
  /** Thread band on the skirt, as fractions of its length. */
  band: [0.32, 0.38] as const,
  /** Warm band at the skirt's mouth: from this fraction of its length to the end. */
  mouth: 0.74,
  /** Dark outline thickness. */
  outline: 0.014,
} as const

export const SHUTTLECOCK_COLORS = {
  cork: '#ff6a00',
  tape: '#d42a3a',
  /** Two alternating feather whites (panels read as facets on an unlit material). */
  feather: ['#ffffff', '#eeeaf3'],
  /** Inside of the skirt: a touch darker, so a shuttle flying away shows its open end. */
  inner: '#d8d2e2',
  thread: '#9aa6c8',
  mouth: '#e8344a',
  outline: '#3b2f4a',
} as const

const S = SHUTTLECOCK

/** Height of the cork tip above the junction (+Y). */
export const CORK_TIP = S.neck + S.cork

/** The cork's lathe profile (radius, y): base cap (closes the skirt's narrow end) → tip, inflated by `t`. */
function corkProfile(t: number): Vector2[] {
  const pts = [new Vector2(0, -t), new Vector2(S.skirtTop + t, -t), new Vector2(S.cork + t, S.neck)]
  for (const deg of [30, 55, 75]) {
    const a = (deg * Math.PI) / 180
    pts.push(new Vector2((S.cork + t) * Math.cos(a), S.neck + (S.cork + t) * Math.sin(a)))
  }
  pts.push(new Vector2(0, CORK_TIP + t))
  return pts
}

/** The skirt's outer profile (radius, y), open end → cork (faces outward), inflated by `t`. */
function skirtProfile(t: number): Vector2[] {
  const at = (f: number) => new Vector2(S.skirtTop + (S.skirtEnd - S.skirtTop) * f + t, -S.length * f)
  return [at(1 + t / S.length), at(S.mouth), at(S.band[1]), at(S.band[0]), new Vector2(S.skirtTop + t, 0)]
}

/** Lathe → non-indexed, position-only (each triangle can then take its own flat colour). */
function lathe(points: Vector2[], sides: number): BufferGeometry {
  const src = new LatheGeometry(points, sides).toNonIndexed()
  const g = new BufferGeometry()
  g.setAttribute('position', src.getAttribute('position'))
  src.dispose()
  return g
}

/** One flat colour per triangle, chosen from its centroid's y and its index. */
function paint(g: BufferGeometry, pick: (y: number, tri: number) => string): BufferGeometry {
  const pos = g.getAttribute('position')
  const col = new Float32Array(pos.count * 3)
  const c = new Color()
  for (let tri = 0; tri < pos.count / 3; tri++) {
    const y = (pos.getY(tri * 3) + pos.getY(tri * 3 + 1) + pos.getY(tri * 3 + 2)) / 3
    c.set(pick(y, tri))
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (tri * 3 + k) * 3)
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
  return g
}

/** Reverse every triangle's winding (the skirt's inside faces inward). */
function flipped(g: BufferGeometry): BufferGeometry {
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i += 3) {
    const x = p.getX(i + 1)
    const y = p.getY(i + 1)
    const z = p.getZ(i + 1)
    p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2))
    p.setXYZ(i + 2, x, y, z)
  }
  return g
}

export interface ShuttlecockGeometry {
  /** Vertex-coloured body: cork + tape, feather skirt outside and in. */
  body: BufferGeometry
  /** Inflated hull (position only), for a dark back-side outline. */
  outline: BufferGeometry
}

/** The shuttlecock geometries (see the header). Pure: a fresh pair per call. */
export function shuttlecockGeometry(): ShuttlecockGeometry {
  const C = SHUTTLECOCK_COLORS
  const [y0, y1] = [-S.length * S.band[0], -S.length * S.band[1]]
  const panels = S.sides
  // Lathe triangles run segment by segment; two per profile quad, (points − 1) quads per segment.
  const skirtQuads = skirtProfile(0).length - 1
  const featherOf = (tri: number) => C.feather[Math.floor(tri / (skirtQuads * 2)) % 2]
  const thread = (y: number) => y < y0 && y > y1
  const mouth = (y: number) => y < -S.length * S.mouth
  const skirt = (y: number, plain: string) => (mouth(y) ? C.mouth : thread(y) ? C.thread : plain)
  const cork = paint(lathe(corkProfile(0), panels * 2), (y) =>
    y < 1e-6 ? C.inner : y < S.neck - 1e-6 ? C.tape : C.cork,
  )
  const outer = paint(lathe(skirtProfile(0), panels), (y, tri) => skirt(y, featherOf(tri)))
  const inner = paint(flipped(lathe(skirtProfile(-0.002), panels)), (y) => skirt(y, C.inner))
  const body = mergeGeometries([cork, outer, inner])!
  const outline = mergeGeometries([
    lathe(corkProfile(S.outline), panels * 2),
    lathe(skirtProfile(S.outline), panels),
  ])!
  for (const g of [cork, outer, inner]) g.dispose()
  body.computeBoundingSphere()
  outline.computeBoundingSphere()
  return { body, outline }
}
