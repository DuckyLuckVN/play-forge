// Shuttle trail: ONE smooth tapered ribbon along the shuttle's recent path. It starts a gap behind the skirt
// mouth (the shuttlecock also draws after it, render3d), widest near its start and thinning to nothing at the
// tail, with soft edges. Its look tells the shot (trailStyle): the kind sets the shape and base colour
// (drop thin / short / quick to fade, clear long and gentle, drive straight cyan, smash wide and bright), the
// grade tunes it (late dull and smaller, Perfect gold with a sparkle at the tip), power makes it wider,
// longer and orange-red, Perfect + power the widest gold ribbon with a red edge. Length also follows speed.
// TrailSampler keeps the path on a fixed time grid (frame-rate independent); RibbonTrail draws the ribbon as
// ONE mesh whose buffers are rewritten in place. Nothing allocates per frame.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial } from 'three'
import { isPowerHit } from './power'
import type { Grade, ShotKind } from './shots'

/**
 * Path samples every `step` s (time grid), newest first, plus the head (index 0) that always tracks the
 * current position. A long frame fills every skipped sample by lerping along that frame's movement.
 */
export class TrailSampler {
  /** x,y,z per point: [head, newest sample, …, oldest]. */
  readonly pts: Float32Array
  /** Valid points (head included). */
  len = 0
  private time = 0
  private next = 0

  constructor(
    private samples: number,
    private step: number,
  ) {
    this.pts = new Float32Array(samples * 3)
  }

  reset() {
    this.len = 0
  }

  update(dt: number, x: number, y: number, z: number) {
    const p = this.pts
    if (this.len === 0) {
      p[0] = p[3] = x
      p[1] = p[4] = y
      p[2] = p[5] = z
      this.len = 2
      this.time = 0
      this.next = this.step
      return
    }
    const t0 = this.time
    this.time += dt
    const px = p[0]
    const py = p[1]
    const pz = p[2]
    while (this.next < this.time - 1e-9) {
      const u = (this.next - t0) / dt
      p.copyWithin(6, 3, (this.samples - 1) * 3)
      p[3] = px + (x - px) * u
      p[4] = py + (y - py) * u
      p[5] = pz + (z - pz) * u
      this.len = Math.min(this.samples, this.len + 1)
      this.next += this.step
    }
    p[0] = x
    p[1] = y
    p[2] = z
  }
}

/** The trail's look this frame (trailStyle). Colours are linear (three.js Color). */
export interface TrailStyle {
  /** Widest ribbon width (m). */
  width: number
  /** Ribbon length (m) behind the gap; 0 = hidden. */
  length: number
  colorHead: Color
  colorTail: Color
  /** Soft outer edge colour, used when `edged` (a dark rim for contrast on the court; Perfect: brown; Perfect + power: red). */
  colorEdge: Color
  edged: boolean
  /** Alpha (× the centre's) of the inner edge vertices when `edged`: a dark rim stays faint, Perfect + power's red is bolder. */
  edgeAlpha: number
  /** Peak opacity (near the start). */
  opacity: number
  /** How fast the opacity falls toward the tail (exponent; drop fades fastest). */
  fade: number
  /** Perfect: a small sparkle at the trail's tip (near its tail end). */
  sparkle: boolean
}

export const newTrailStyle = (): TrailStyle => ({
  width: 0,
  length: 0,
  colorHead: new Color(),
  colorTail: new Color(),
  colorEdge: new Color(),
  edged: false,
  edgeAlpha: 0,
  opacity: 0,
  fade: 1,
  sparkle: false,
})

/** Base look per shot kind (good grade, no power), tuned to read apart at a glance. */
export const TRAIL_KINDS = {
  drop: { width: 0.12, length: 0.85, head: '#ffffff', tail: '#eef1f6', opacity: 0.78, fade: 1.8 },
  clear: { width: 0.15, length: 1.7, head: '#f4faff', tail: '#a9d8ff', opacity: 0.7, fade: 1.2 },
  drive: { width: 0.15, length: 1.15, head: '#ffffff', tail: '#8ff0ff', opacity: 0.88, fade: 1.3 },
  smash: { width: 0.24, length: 1.9, head: '#ffffff', tail: '#ffa860', opacity: 0.92, fade: 1.1 },
} as const
export type TrailKind = keyof typeof TRAIL_KINDS

export const TRAIL_MODS = {
  late: { width: 0.7, length: 0.7, opacity: 0.75, dull: '#c4c4c8', dullMix: 0.6 },
  perfect: { gold: '#ffc23d', goldHead: '#fffbe6', goldMix: 0.85, opacity: 0.9, edge: '#5a3a00' },
  power: { width: 1.5, length: 1.3, head: '#ffc79a', tail: '#ff4a2e', opacity: 0.9 },
  perfectPower: {
    width: 1.75,
    length: 1.45,
    head: '#ffe27a',
    tail: '#ffb020',
    edge: '#ff3b3b',
    opacity: 0.95,
  },
  /** Dark rim on every ribbon (contrast on the teal court) and its inner-edge alpha. */
  edge: { color: '#1b2a3a', alpha: 0.35, boldAlpha: 0.6 },
} as const

export const TRAIL_SPEED = {
  /** Below this speed (m/s) no trail. */
  min: 1.5,
  /** Length scale = clamp(lo + speed / ref, lo, hi). */
  ref: 14,
  lo: 0.4,
  hi: 1.4,
} as const

/** The kind of a hit / serve for the trail (a short serve shapes like a drop, a long one like a clear). */
export function trailKind(kind: ShotKind | null): TrailKind {
  if (kind === 'serveShort' || kind === 'drop') return 'drop'
  if (kind === 'smash' || kind === 'drive') return kind
  return 'clear'
}

/** Length scale for `speed` (m/s): 0 when (nearly) still, else lo..hi. */
export function speedScale(speed: number): number {
  if (!(speed >= TRAIL_SPEED.min)) return 0
  return Math.min(TRAIL_SPEED.hi, Math.max(TRAIL_SPEED.lo, TRAIL_SPEED.lo + speed / TRAIL_SPEED.ref))
}

// Every colour parsed once (Color.set('#hex') per frame would parse a string and allocate).
const hexes = <T extends Record<string, string>>(o: T) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, new Color(v)])) as Record<keyof T, Color>
const KIND_COLORS = Object.fromEntries(
  Object.entries(TRAIL_KINDS).map(([k, v]) => [k, { head: new Color(v.head), tail: new Color(v.tail) }]),
) as Record<TrailKind, { head: Color; tail: Color }>
const TRAIL_COLORS = {
  late: hexes({ dull: TRAIL_MODS.late.dull }),
  perfect: hexes({
    gold: TRAIL_MODS.perfect.gold,
    goldHead: TRAIL_MODS.perfect.goldHead,
    edge: TRAIL_MODS.perfect.edge,
  }),
  power: hexes({ head: TRAIL_MODS.power.head, tail: TRAIL_MODS.power.tail }),
  perfectPower: hexes({
    head: TRAIL_MODS.perfectPower.head,
    tail: TRAIL_MODS.perfectPower.tail,
    edge: TRAIL_MODS.perfectPower.edge,
  }),
  edge: hexes({ dark: TRAIL_MODS.edge.color }).dark,
}

/**
 * The trail's look for a shot: kind × grade × power, at `speed`. `grade` null = a serve (good). Writes into
 * `out` (allocation-free when one is passed; per frame, pass one).
 */
export function trailStyle(
  kind: ShotKind | null,
  grade: Grade | null,
  power: number,
  speed: number,
  out: TrailStyle = newTrailStyle(),
): TrailStyle {
  const tk = trailKind(kind)
  const K = TRAIL_KINDS[tk]
  const KC = KIND_COLORS[tk]
  let width = K.width
  let length = K.length
  out.opacity = K.opacity
  out.fade = K.fade
  out.colorHead.copy(KC.head)
  out.colorTail.copy(KC.tail)
  out.colorEdge.copy(TRAIL_COLORS.edge)
  out.edged = true
  out.edgeAlpha = TRAIL_MODS.edge.alpha
  out.sparkle = false
  const big = isPowerHit(power)
  if (grade === 'perfect' && big) {
    const M = TRAIL_MODS.perfectPower
    const C = TRAIL_COLORS.perfectPower
    width *= M.width
    length *= M.length
    out.opacity = M.opacity
    out.colorHead.copy(C.head)
    out.colorTail.copy(C.tail)
    out.colorEdge.copy(C.edge)
    out.edgeAlpha = TRAIL_MODS.edge.boldAlpha
    out.sparkle = true
  } else {
    if (big) {
      const M = TRAIL_MODS.power
      width *= M.width
      length *= M.length
      out.opacity = Math.max(out.opacity, M.opacity)
      out.colorHead.copy(TRAIL_COLORS.power.head)
      out.colorTail.copy(TRAIL_COLORS.power.tail)
    }
    if (grade === 'perfect') {
      const M = TRAIL_MODS.perfect
      const C = TRAIL_COLORS.perfect
      out.colorHead.lerp(C.goldHead, M.goldMix)
      out.colorTail.lerp(C.gold, M.goldMix)
      out.colorEdge.copy(C.edge)
      out.opacity = Math.max(out.opacity, M.opacity)
      out.sparkle = true
    } else if (grade === 'late') {
      const M = TRAIL_MODS.late
      width *= M.width
      length *= M.length
      out.opacity *= M.opacity
      out.colorHead.lerp(TRAIL_COLORS.late.dull, M.dullMix)
      out.colorTail.lerp(TRAIL_COLORS.late.dull, M.dullMix)
    }
  }
  out.width = width
  out.length = length * speedScale(speed)
  return out
}

/** Ribbon shape along t ∈ [0, 1] (0 = start, behind the mouth; 1 = tail): width and alpha factors 0..1. */
export function ribbonWidth(t: number): number {
  if (t <= 0 || t >= 1) return 0
  const rise = Math.min(1, t / 0.12)
  return rise * rise * (3 - 2 * rise) * Math.pow(1 - t, 0.8)
}
export function ribbonAlpha(t: number, fade: number): number {
  if (t <= 0 || t >= 1) return 0
  const rise = Math.min(1, t / 0.1)
  return rise * Math.pow(1 - t, fade)
}

/** Across the ribbon: offsets (× half-width) and alpha (× the centre's): soft edges, no hard banding. */
const ACROSS = [-1, -0.45, 0, 0.45, 1] as const
const ACROSS_ALPHA = [0, 0.6, 1, 0.6, 0] as const
/** Indices of the inner edge vertices (their alpha is the style's edgeAlpha when edged). */
const INNER = [1, 3]

/**
 * Screen-space floor on the ribbon's half-width: MIN_HALF_PX pixels per REF_WIDTH metres of style width, so a
 * far or foreshortened trail never thins to a hairline (a drop stays thinner than a smash on screen too).
 */
export const MIN_HALF_PX = 3
export const REF_WIDTH = 0.15

/** Half-width (m) at a point `dist` m from the camera: the style's, or at least the screen floor. */
export function halfWidthAt(width: number, dist: number, pxScale: number): number {
  return Math.max(width / 2, MIN_HALF_PX * (width / REF_WIDTH) * dist * pxScale)
}

/** Ribbon points along the path. */
export const RIBBON_POINTS = 28

/**
 * Lay `n` ribbon centre points along the sampled path `pts` (len points, head = the shuttle first), from
 * `gap` metres behind the head to `gap + length` (cut at the path's end), evenly by arc length. Writes
 * x, y, z, t (0..1 along the ribbon) per point into `out` (n * 4). Returns the ribbon's actual length (0 =
 * nothing to draw yet).
 */
export function layRibbon(
  pts: Float32Array,
  len: number,
  gap: number,
  length: number,
  n: number,
  out: Float32Array,
): number {
  let total = 0
  for (let i = 0; i < len - 1; i++) total += seg(pts, i)
  const span = Math.min(length, total - gap)
  if (n < 2 || !(span > 0.02)) return 0
  let i = 0
  let at = 0
  let l = seg(pts, 0)
  for (let j = 0; j < n; j++) {
    const t = j / (n - 1)
    const d = gap + t * span
    while (at + l < d && i < len - 2) {
      at += l
      i++
      l = seg(pts, i)
    }
    const u = l > 0 ? Math.min(1, (d - at) / l) : 0
    const a = i * 3
    out[j * 4] = pts[a] + (pts[a + 3] - pts[a]) * u
    out[j * 4 + 1] = pts[a + 1] + (pts[a + 4] - pts[a + 1]) * u
    out[j * 4 + 2] = pts[a + 2] + (pts[a + 5] - pts[a + 2]) * u
    out[j * 4 + 3] = t
  }
  return span
}

function seg(p: Float32Array, i: number): number {
  const a = i * 3
  return Math.hypot(p[a + 3] - p[a], p[a + 4] - p[a + 1], p[a + 5] - p[a + 2])
}

/** The ribbon as one camera-facing mesh. */
export class RibbonTrail {
  readonly mesh: Mesh
  /** World position of the ribbon's tip (near its tail end; Perfect sparkles), valid while `shown`. */
  readonly tip = new Float32Array(3)
  shown = false
  private sampler: TrailSampler
  private laid = new Float32Array(RIBBON_POINTS * 4)
  private pos: Float32Array
  private col: Float32Array
  private c = new Color()

  /** `gap` = metres of path left empty behind the shuttle's origin (behind its skirt mouth). */
  constructor(
    samples: number,
    step: number,
    private gap: number,
  ) {
    this.sampler = new TrailSampler(samples, step)
    const verts = RIBBON_POINTS * ACROSS.length
    this.pos = new Float32Array(verts * 3)
    this.col = new Float32Array(verts * 4)
    const idx: number[] = []
    const W = ACROSS.length
    for (let i = 0; i < RIBBON_POINTS - 1; i++)
      for (let c = 0; c < W - 1; c++) {
        const a = i * W + c
        const b = a + W
        idx.push(a, a + 1, b, a + 1, b + 1, b)
      }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(this.pos, 3))
    g.setAttribute('color', new BufferAttribute(this.col, 4))
    g.setIndex(idx)
    // Always transparent with per-vertex alpha (no recompiles).
    const mat = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    })
    this.mesh = new Mesh(g, mat)
    this.mesh.frustumCulled = false
    this.mesh.visible = false
  }

  /** A new hit / serve: the ribbon regrows from the contact (no bend back along the old path). */
  restart() {
    this.sampler.reset()
    this.hide()
  }

  reset() {
    this.restart()
  }

  private hide() {
    this.mesh.visible = false
    this.shown = false
  }

  /**
   * `flying` false hides it and forgets the path. (x, y, z) = the shuttle's origin, `style` this frame's look
   * (trailStyle), (cx, cy, cz) the camera (the ribbon faces it), `pxScale` = metres per pixel per metre of
   * distance (2·tan(fov/2) / viewport height px; 0 = no screen floor).
   */
  update(
    flying: boolean,
    x: number,
    y: number,
    z: number,
    dt: number,
    style: TrailStyle,
    cx: number,
    cy: number,
    cz: number,
    pxScale = 0,
  ) {
    if (!flying) return this.reset()
    const s = this.sampler
    s.update(dt, x, y, z)
    if (style.length <= 0 || layRibbon(s.pts, s.len, this.gap, style.length, RIBBON_POINTS, this.laid) === 0)
      return this.hide()
    const q = this.laid
    const W = ACROSS.length
    const P = RIBBON_POINTS
    for (let i = 0; i < P; i++) {
      const a = Math.max(0, i - 1) * 4
      const b = Math.min(P - 1, i + 1) * 4
      const px = q[i * 4]
      const py = q[i * 4 + 1]
      const pz = q[i * 4 + 2]
      const t = q[i * 4 + 3]
      // Side = tangent × (to camera), scaled to the half-width here.
      const tx = q[b] - q[a]
      const ty = q[b + 1] - q[a + 1]
      const tz = q[b + 2] - q[a + 2]
      const ex = cx - px
      const ey = cy - py
      const ez = cz - pz
      let sx = ty * ez - tz * ey
      let sy = tz * ex - tx * ez
      let sz = tx * ey - ty * ex
      const hw = halfWidthAt(style.width, Math.hypot(ex, ey, ez), pxScale) * ribbonWidth(t)
      const sl = (Math.hypot(sx, sy, sz) || 1) / Math.max(hw, 1e-6)
      sx /= sl
      sy /= sl
      sz /= sl
      const alpha = style.opacity * ribbonAlpha(t, style.fade)
      this.c.copy(style.colorHead).lerp(style.colorTail, t)
      for (let c = 0; c < W; c++) {
        const v = i * W + c
        const o = ACROSS[c]
        this.pos[v * 3] = px + sx * o
        this.pos[v * 3 + 1] = py + sy * o
        this.pos[v * 3 + 2] = pz + sz * o
        const col = o !== 0 && style.edged ? style.colorEdge : this.c
        this.col[v * 4] = col.r
        this.col[v * 4 + 1] = col.g
        this.col[v * 4 + 2] = col.b
        this.col[v * 4 + 3] = alpha * (style.edged && INNER.includes(c) ? style.edgeAlpha : ACROSS_ALPHA[c])
      }
    }
    // Sparkle tip: 85% along the ribbon.
    const k = Math.round(0.85 * (P - 1)) * 4
    this.tip[0] = q[k]
    this.tip[1] = q[k + 1]
    this.tip[2] = q[k + 2]
    const geo = this.mesh.geometry
    geo.getAttribute('position').needsUpdate = true
    geo.getAttribute('color').needsUpdate = true
    this.mesh.visible = true
    this.shown = true
  }
}
