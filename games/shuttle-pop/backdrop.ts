// The far layer: painted, not modelled. One curved panorama (two faceted lavender mountain ranges,
// low-poly rolling hills dotted with tiny trees, a hazy rooftop skyline with warm lit windows, a little
// Ferris wheel and a low sun glow) plus two curved cloud bands
// that drift slowly. Three draw calls; every texture is painted once on a canvas at build time.
//
// All three are open cylinder arcs around the court facing the camera (render space: camera at
// z < 0 looking toward +z). They ignore fog and are painted pre-hazed instead (warm horizon colour
// toward the bottom), and stay lower in contrast than the court so the court and shuttle pop.

import {
  BackSide,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'
import { rng } from './kit'

/** Horizon colour: the far layer hazes into it, and the sky's horizon + fog use it too (scenery.ts). */
export const HAZE = '#eeb08c'

/** Arc half-angle (rad): wide enough for the widest phone aspect plus the camera's side slide. */
const ARC = (85 * Math.PI) / 180

const PANORAMA = {
  radius: 80,
  /** World y range painted (m). */
  bottom: -4,
  top: 18,
  width: 2048,
  height: 256,
}

/** Cloud bands, far → near: radius, y range (m), drift (texture tiles/s), tiles across the arc, seed. */
const CLOUD_BANDS = [
  { radius: 92, bottom: 10, top: 40, drift: 1 / 420, tiles: 1.6, seed: 3, clouds: 5 },
  { radius: 86, bottom: 8, top: 22, drift: 1 / 240, tiles: 1.3, seed: 9, clouds: 3 },
] as const

const PAINT = {
  /** Toned down so a high shuttle near the right edge still reads against it. */
  sun: { u: 0.74, y: 6.5, core: 2.6, glow: 10, coreColor: '#f6c592', glowColor: '250, 184, 134', glowA: 0.6 },
  /** Back + front building rows (hazier at the back). */
  cityBack: '#c99ca2',
  cityFront: '#b08597',
  window: 'rgba(255, 206, 138, 0.75)',
  wheel: '#b98c9b',
  hillFar: '#c89ea0',
  hillNear: '#b3a683',
  /** Tiny round trees along the near hills' crest (a shade deeper than the hill). */
  hillTree: '#a39a76',
  /** Mountain ranges, back → front: lit (sun side, right) and shaded faces; hazier at the back. */
  mountains: [
    { lit: '#d9b4c4', shade: '#c4a3c3' },
    { lit: '#cba7bf', shade: '#b294b8' },
  ],
  cloudLit: '#e4ab9f',
  cloudShade: '#d29bb0',
}

/** v mod 1 into [0, 1) (drifting texture offsets stay small). */
export function wrap01(v: number): number {
  return v - Math.floor(v)
}

export interface Block {
  /** Left edge and width along the arc (m), height (m). */
  x: number
  w: number
  h: number
  /** 0 = back row, 1 = front row. */
  row: 0 | 1
  roof: 'flat' | 'peak' | 'mast'
}

/**
 * Rooftop silhouette for an arc `length` m long: a dense taller core in the middle third, sparse and
 * low at the ends, and none in the outer fifths (open hills there). Heights 5–12 m: at
 * ~90 m that tops out a few degrees over the horizon, inside the thin strip of sky the rally camera
 * shows (it looks down ~23°).
 */
export function skylineBlocks(seed: number, length: number): Block[] {
  const r = rng(seed)
  const out: Block[] = []
  for (const row of [0, 1] as const) {
    let x = length * 0.2 + r() * 4
    while (x < length * 0.8) {
      const w = 3 + r() * 5
      const centre = 1 - Math.abs((x + w / 2) / length - 0.5) / 0.3
      const h = 5 + Math.max(0, centre) * (3 + r() * 4) - row * 1.5
      const roofs = ['flat', 'flat', 'peak', 'mast'] as const
      out.push({ x, w, h: Math.max(5, Math.min(12, h)), row, roof: roofs[Math.floor(r() * roofs.length)] })
      x += w + (centre > 0.3 ? r() * 1.5 : 2 + r() * 6)
    }
  }
  return out
}

/** Rolling hill height (m) at `x` along an arc `length` m long; `far` hills are taller, higher at the ends. */
export function hillHeight(x: number, length: number, far: boolean): number {
  const u = x / length
  if (far) return 3 + 4 * Math.abs(u - 0.5) * 2 + 1.1 * Math.sin(u * 19 + 1) + 0.7 * Math.sin(u * 41)
  return 1.8 + 0.9 * Math.sin(u * 27 + 2) + 0.5 * Math.sin(u * 63 + 0.5)
}

export interface Peak {
  /** Peak position along the arc (m), height (m), half-width of its base (m). */
  x: number
  h: number
  half: number
}

/**
 * A faceted mountain range for an arc `length` m long (`range` 0 = back, 1 = front): peaks 8–15 m high at the
 * back (6–11 m at the front), taller toward the ends so the city sits in a valley. Deterministic.
 */
export function mountainPeaks(seed: number, length: number, range: 0 | 1): Peak[] {
  const r = rng(seed + range * 17)
  const out: Peak[] = []
  let x = -6 + r() * 6
  while (x < length + 6) {
    const end = Math.abs(x / length - 0.5) * 2
    const lo = range === 0 ? 8 : 6
    const h = lo + end * 3 + r() * (range === 0 ? 4 : 2)
    const half = h * (1.3 + r() * 0.6)
    out.push({ x, h, half })
    x += half * (0.9 + r() * 0.5)
  }
  return out
}

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2d canvas unavailable')
  return [c, ctx]
}

/** Paint in metres: x along the arc from the screen-left end, y up from world y = 0. */
function metreSpace(ctx: CanvasRenderingContext2D, length: number, bottom: number, top: number) {
  const { width, height } = ctx.canvas
  const sy = height / (top - bottom)
  ctx.setTransform(width / length, 0, 0, -sy, 0, top * sy)
}

function paintPanorama(): HTMLCanvasElement {
  const P = PANORAMA
  const length = P.radius * ARC * 2
  const [c, ctx] = canvas2d(P.width, P.height)
  metreSpace(ctx, length, P.bottom, P.top)

  // Sun: a soft glow and a warm disc low on the horizon (screen right, the side the light comes from).
  const S = PAINT.sun
  const sx = S.u * length
  const glow = ctx.createRadialGradient(sx, S.y, 0, sx, S.y, S.glow)
  glow.addColorStop(0, `rgba(${S.glowColor}, ${S.glowA})`)
  glow.addColorStop(0.25, `rgba(${S.glowColor}, ${S.glowA * 0.45})`)
  glow.addColorStop(1, `rgba(${S.glowColor}, 0)`)
  ctx.fillStyle = glow
  ctx.fillRect(sx - S.glow, S.y - S.glow, S.glow * 2, S.glow * 2)
  ctx.fillStyle = S.coreColor
  ctx.beginPath()
  ctx.arc(sx, S.y, S.core, 0, Math.PI * 2)
  ctx.fill()

  // Mountain ranges behind everything: each peak a lit right face (toward the sun) and a shaded left face,
  // a small step in the ridge so it reads faceted.
  for (const range of [0, 1] as const) {
    const tone = PAINT.mountains[range]
    for (const p of mountainPeaks(4, length, range)) {
      const mid = p.x + p.half * 0.15
      ctx.fillStyle = tone.shade
      ctx.beginPath()
      ctx.moveTo(p.x - p.half, P.bottom)
      ctx.lineTo(p.x - p.half, 0)
      ctx.lineTo(p.x - p.half * 0.45, p.h * 0.62)
      ctx.lineTo(p.x, p.h)
      ctx.lineTo(mid, P.bottom)
      ctx.fill()
      ctx.fillStyle = tone.lit
      ctx.beginPath()
      ctx.moveTo(p.x, p.h)
      ctx.lineTo(p.x + p.half * 0.5, p.h * 0.55)
      ctx.lineTo(p.x + p.half, 0)
      ctx.lineTo(p.x + p.half, P.bottom)
      ctx.lineTo(mid, P.bottom)
      ctx.fill()
    }
  }
  // Haze the ranges' feet (the city stands in front of a soft valley).
  ctx.globalCompositeOperation = 'source-atop'
  const valley = ctx.createLinearGradient(0, 0, 0, 10)
  valley.addColorStop(0, hexA(HAZE, 0.7))
  valley.addColorStop(1, hexA(HAZE, 0))
  ctx.fillStyle = valley
  ctx.fillRect(0, P.bottom, length, 10 - P.bottom)
  ctx.globalCompositeOperation = 'source-over'

  // Ferris wheel past the left end of the city.
  const wx = length * 0.24
  const wy = 6.5
  const wr = 4.5
  ctx.strokeStyle = PAINT.wheel
  ctx.lineWidth = 0.45
  ctx.beginPath()
  ctx.arc(wx, wy, wr, 0, Math.PI * 2)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    ctx.moveTo(wx, wy)
    ctx.lineTo(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr)
  }
  ctx.moveTo(wx - 2.2, 0)
  ctx.lineTo(wx, wy)
  ctx.lineTo(wx + 2.2, 0)
  ctx.stroke()
  ctx.fillStyle = PAINT.wheel
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2
    ctx.fillRect(wx + Math.cos(a) * wr - 0.45, wy + Math.sin(a) * wr - 0.9, 0.9, 0.8)
  }

  // Skyline: back row hazier; front row with a few warm windows.
  const r = rng(5)
  for (const b of skylineBlocks(21, length)) {
    ctx.fillStyle = b.row === 0 ? PAINT.cityBack : PAINT.cityFront
    ctx.fillRect(b.x, 0, b.w, b.h)
    if (b.roof === 'peak') {
      ctx.beginPath()
      ctx.moveTo(b.x - 0.3, b.h)
      ctx.lineTo(b.x + b.w / 2, b.h + b.w * 0.35)
      ctx.lineTo(b.x + b.w + 0.3, b.h)
      ctx.fill()
    } else if (b.roof === 'mast') ctx.fillRect(b.x + b.w * 0.6, b.h, 0.25, 1.8)
    if (b.row === 0) continue
    ctx.fillStyle = PAINT.window
    for (let y = 2.5; y < b.h - 1; y += 1.6)
      for (let x = b.x + 0.7; x < b.x + b.w - 0.9; x += 1.3) if (r() < 0.32) ctx.fillRect(x, y, 0.6, 0.75)
  }
  // Haze the city's feet into the horizon.
  ctx.globalCompositeOperation = 'source-atop'
  const haze = ctx.createLinearGradient(0, 0, 0, 9)
  haze.addColorStop(0, hexA(HAZE, 0.55))
  haze.addColorStop(1, hexA(HAZE, 0))
  ctx.fillStyle = haze
  ctx.fillRect(0, P.bottom, length, 9 - P.bottom)
  ctx.globalCompositeOperation = 'source-over'

  // Rolling hills, far then near: sampled every few metres, so the crest reads low-poly.
  const HILL_STEP = 3.5
  for (const far of [true, false]) {
    ctx.fillStyle = far ? PAINT.hillFar : PAINT.hillNear
    ctx.beginPath()
    ctx.moveTo(0, P.bottom)
    for (let x = 0; x <= length + HILL_STEP; x += HILL_STEP) ctx.lineTo(x, hillHeight(x, length, far))
    ctx.lineTo(length, P.bottom)
    ctx.fill()
  }
  // Tiny trees on the near crest, in loose groups (none over the city's middle, where the skyline shows).
  ctx.fillStyle = PAINT.hillTree
  const t = rng(8)
  for (let x = 2; x < length; x += 1.2 + t() * 2.5) {
    const u = x / length
    if (u > 0.38 && u < 0.62 && t() < 0.8) continue
    const y = hillHeight(x, length, false) - 0.25
    const rad = 0.55 + t() * 0.5
    ctx.beginPath()
    if (t() < 0.4) {
      // A little pine.
      ctx.moveTo(x - rad, y)
      ctx.lineTo(x, y + rad * 3)
      ctx.lineTo(x + rad, y)
    } else ctx.arc(x, y + rad, rad, 0, Math.PI * 2)
    ctx.fill()
  }
  // Everything melts into the horizon at the bottom (meets the fogged lawn).
  ctx.globalCompositeOperation = 'source-atop'
  const foot = ctx.createLinearGradient(0, P.bottom, 0, 3)
  foot.addColorStop(0, hexA(HAZE, 1))
  foot.addColorStop(1, hexA(HAZE, 0))
  ctx.fillStyle = foot
  ctx.fillRect(0, P.bottom, length, 3 - P.bottom)
  ctx.globalCompositeOperation = 'source-over'
  return c
}

/** One tile of a cloud band: flat-bottomed puffy clouds, lit warm on top, rosy underneath. */
function paintClouds(band: (typeof CLOUD_BANDS)[number], length: number): HTMLCanvasElement {
  const [c, ctx] = canvas2d(1024, 256)
  const tile = length / band.tiles
  metreSpace(ctx, tile, band.bottom, band.top)
  const r = rng(band.seed)
  const height = band.top - band.bottom
  for (let k = 0; k < band.clouds; k++) {
    const cx = ((k + r() * 0.6) / band.clouds) * tile
    const base = band.bottom + height * (0.15 + r() * 0.45)
    const w = 14 + r() * 18
    const puffs = 4 + Math.floor(r() * 3)
    const shape: number[] = []
    for (let p = 0; p < puffs; p++) {
      const t = p / (puffs - 1)
      const rad = (2.2 + r() * 2.2) * (1 - Math.abs(t - 0.5))
      shape.push(cx - w / 2 + t * w, base + rad * 0.5, rad + 1.4)
    }
    // Drawn at x and one tile over so clouds crossing the seam wrap cleanly.
    for (const dx of [0, -tile, tile]) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(cx - w + dx, base, w * 2, height)
      ctx.clip()
      for (const [color, lift] of [
        [PAINT.cloudShade, 0],
        [PAINT.cloudLit, 0.9],
      ] as const) {
        ctx.fillStyle = color
        ctx.beginPath()
        for (let p = 0; p < shape.length; p += 3) {
          const rad = shape[p + 2] - lift * 0.6
          ctx.moveTo(shape[p] + dx + rad, shape[p + 1] + lift)
          ctx.arc(shape[p] + dx, shape[p + 1] + lift, rad, 0, Math.PI * 2)
        }
        ctx.fill()
      }
      ctx.restore()
    }
  }
  return c
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function texture(canvas: HTMLCanvasElement, repeatX: number): CanvasTexture {
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.wrapS = RepeatWrapping
  // Seen from inside the arc, u runs right → left: mirror it so canvas left is screen left.
  t.repeat.x = -repeatX
  t.offset.x = repeatX
  t.anisotropy = 4
  return t
}

/** An open cylinder arc (inside faces) centred on +z, spanning world y [bottom, top]. */
function arc(radius: number, bottom: number, top: number, map: Texture, order: number): Mesh {
  const geo = new CylinderGeometry(radius, radius, top - bottom, 48, 1, true, -ARC, ARC * 2)
  const mesh = new Mesh(
    geo,
    new MeshBasicMaterial({ map, side: BackSide, transparent: true, depthWrite: false, fog: false }),
  )
  mesh.position.y = (top + bottom) / 2
  // Far layers draw first among the transparent things (before the trail, dust and petals).
  mesh.renderOrder = order
  mesh.frustumCulled = false
  return mesh
}

/** Panorama + drifting cloud bands. Add `root` once; call `update(dt)` each frame. */
export class Backdrop {
  readonly root = new Group()
  private clouds: Texture[] = []
  private drift: number[] = []

  constructor() {
    CLOUD_BANDS.forEach((band, i) => {
      const map = texture(paintClouds(band, band.radius * ARC * 2), band.tiles)
      this.clouds.push(map)
      this.drift.push(band.drift)
      this.root.add(arc(band.radius, band.bottom, band.top, map, -4 + i))
    })
    const P = PANORAMA
    this.root.add(arc(P.radius, P.bottom, P.top, texture(paintPanorama(), 1), -2))
  }

  update(dt: number) {
    for (let i = 0; i < this.clouds.length; i++) {
      const t = this.clouds[i]
      t.offset.x = wrap01(t.offset.x + this.drift[i] * dt)
    }
  }
}
