// Arenas: the animated backdrop behind the board. Each arena is a colour scheme
// plus a scene (stars, rain, aurora, a synthwave grid…) drawn in code.
import { prefersReducedMotion } from '@forge/fx/tween'
import { theme } from '@forge/ui/theme'
import { BOARD_H, BOARD_W, FLOOR_Y } from './sim/config'

export type ArenaId = string

export interface Arena {
  name: string
  top: string
  bottom: string
  /** Main detail colour (stars, drops, petals…). */
  star: string
  /** Glow around the launch point and the scene's highlights. */
  glow: string
  scene: SceneId
}

export const ARENAS: Record<ArenaId, Arena> = {
  indigo: {
    name: 'Indigo Night',
    top: '#1b2050',
    bottom: '#0c0f26',
    star: '#c9ccff',
    glow: '#5ab8ff',
    scene: 'stars',
  },
  skies: {
    name: 'Sky High',
    top: '#3a7bd5',
    bottom: '#86c5ff',
    star: '#ffffff',
    glow: '#fff3b0',
    scene: 'clouds',
  },
  candy: {
    name: 'Candy Land',
    top: '#ff9fcf',
    bottom: '#7a4fd6',
    star: '#ffffff',
    glow: '#fff3b0',
    scene: 'candy',
  },
  space: {
    name: 'Deep Space',
    top: '#05060f',
    bottom: '#120a24',
    star: '#ffffff',
    glow: '#b48cff',
    scene: 'nebula',
  },
  winter: {
    name: 'Winter Peak',
    top: '#1d2b4f',
    bottom: '#5a7bb0',
    star: '#ffffff',
    glow: '#bfe4ff',
    scene: 'snow',
  },
  forest: {
    name: 'Firefly Forest',
    top: '#0b1f1a',
    bottom: '#04100c',
    star: '#d4ff6b',
    glow: '#4be3a0',
    scene: 'fireflies',
  },
  blossom: {
    name: 'Blossom Moon',
    top: '#2a1838',
    bottom: '#120a1c',
    star: '#ffb7d5',
    glow: '#ff6fb5',
    scene: 'petals',
  },
  ocean: {
    name: 'Deep Ocean',
    top: '#06324a',
    bottom: '#020d18',
    star: '#7fe7ff',
    glow: '#2ed3d3',
    scene: 'ocean',
  },
  desert: {
    name: 'Dune Sea',
    top: '#f08a4b',
    bottom: '#5a2a3a',
    star: '#ffe0a3',
    glow: '#ffc83d',
    scene: 'dunes',
  },
  storm: {
    name: 'Thunderstorm',
    top: '#1a1f2e',
    bottom: '#0a0d14',
    star: '#9fb4d9',
    glow: '#d0e2ff',
    scene: 'rain',
  },
  aurora: {
    name: 'Aurora',
    top: '#04121f',
    bottom: '#0a2433',
    star: '#4be3a0',
    glow: '#b48cff',
    scene: 'aurora',
  },
  sunset: {
    name: 'Sunset Grid',
    top: '#3a1248',
    bottom: '#120618',
    star: '#ffc83d',
    glow: '#ff6fb5',
    scene: 'grid',
  },
  abyss: {
    name: 'The Abyss',
    top: '#020812',
    bottom: '#000306',
    star: '#5ab8ff',
    glow: '#ff6fb5',
    scene: 'jellies',
  },
  circuit: {
    name: 'Circuit Board',
    top: '#06140f',
    bottom: '#020806',
    star: '#4be3a0',
    glow: '#7fe7ff',
    scene: 'circuit',
  },
  matrix: {
    name: 'Code Rain',
    top: '#020a04',
    bottom: '#000000',
    star: '#4be3a0',
    glow: '#b8ff3d',
    scene: 'code',
  },
  volcano: {
    name: 'Volcano',
    top: '#2a0a0a',
    bottom: '#120202',
    star: '#ff9f43',
    glow: '#ff6b35',
    scene: 'lava',
  },
  meteor: {
    name: 'Meteor Shower',
    top: '#0a0820',
    bottom: '#1d0f33',
    star: '#ffffff',
    glow: '#ffc83d',
    scene: 'meteors',
  },
  neon: {
    name: 'Neon City',
    top: '#140726',
    bottom: '#05010c',
    star: '#4be3a0',
    glow: '#ff6fb5',
    scene: 'city',
  },
  galaxy: {
    name: 'Spiral Galaxy',
    top: '#07031a',
    bottom: '#020108',
    star: '#e0d4ff',
    glow: '#b48cff',
    scene: 'spiral',
  },
  warp: {
    name: 'Hyperspace',
    top: '#050314',
    bottom: '#000000',
    star: '#bfe4ff',
    glow: '#5ab8ff',
    scene: 'warp',
  },
}

/** Every 10 turns the storm grows: warmer colours, faster scenes. 0..5. */
export function stormLevel(turn: number): number {
  return Math.min(5, Math.floor((turn - 1) / 10))
}

function mix(a: string, b: string, f: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * f)
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')
}

const alpha = (hex: string, a: number) =>
  hex +
  Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0')

interface Dot {
  x: number
  y: number
  size: number
  phase: number
}

/** Fixed pseudo-random points (LCG), so a scene looks the same every load. Positions are 0..1. */
function dots(count: number, seed: number, size = 1): Dot[] {
  let s = seed
  const next = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  return Array.from({ length: count }, () => ({
    x: next(),
    y: next(),
    size: size * (0.6 + next() * 0.8),
    phase: next() * Math.PI * 2,
  }))
}

const FAR = dots(46, 7, 1.7)
const NEAR = dots(24, 99, 2.8)
const MANY = dots(90, 21, 1)

/** What a scene gets: the canvas, board size, time (already sped up by the storm), and the arena. */
interface View {
  ctx: CanvasRenderingContext2D
  W: number
  H: number
  floorY: number
  t: number
  a: Arena
  /** Reduced motion: hold everything still. */
  still: boolean
}

type Scene = (v: View) => void

const wrap = (v: number, max: number) => ((v % max) + max) % max

function starfield({ ctx, W, H, t, a, still }: View, drift = 1): void {
  const layer = (stars: Dot[], speed: number, alphaMax: number) => {
    ctx.fillStyle = a.star
    for (const st of stars) {
      const y = still ? st.y * H : wrap(st.y * H + t * speed * drift, H)
      ctx.globalAlpha = alphaMax * (0.55 + 0.45 * Math.sin(t * 2 + st.phase))
      ctx.fillRect(st.x * W, y, st.size, st.size)
    }
  }
  layer(FAR, 6, 0.5)
  layer(NEAR, 16, 0.8)
  ctx.globalAlpha = 1
}

function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  a: number,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, alpha(color, a))
  g.addColorStop(1, alpha(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

export const SCENES = {
  stars: (v: View) => starfield(v),

  nebula: (v: View) => {
    const { ctx, W, H, t, a } = v
    blob(ctx, W * (0.3 + 0.1 * Math.sin(t * 0.1)), H * 0.3, W * 0.6, a.glow, 0.28)
    blob(ctx, W * (0.75 + 0.08 * Math.cos(t * 0.13)), H * 0.6, W * 0.5, '#ff6fb5', 0.18)
    blob(ctx, W * 0.5, H * (0.85 + 0.05 * Math.sin(t * 0.2)), W * 0.45, '#5ab8ff', 0.15)
    starfield(v, 0.6)
  },

  clouds: ({ ctx, W, H, t, a, still }: View) => {
    blob(ctx, W * 0.82, H * 0.12, W * 0.35, '#fff3b0', 0.7)
    ctx.fillStyle = alpha(a.star, 0.85)
    for (const [i, d] of dots(7, 5).entries()) {
      const x = wrap(d.x * W * 1.4 + (still ? 0 : t * (8 + i * 3)), W * 1.4) - W * 0.2
      const y = H * (0.1 + d.y * 0.75)
      const s = 22 + d.size * 18
      ctx.globalAlpha = 0.35 + 0.4 * d.size
      ctx.beginPath()
      ctx.arc(x, y, s, 0, Math.PI * 2)
      ctx.arc(x + s * 0.9, y + s * 0.2, s * 0.8, 0, Math.PI * 2)
      ctx.arc(x - s * 0.9, y + s * 0.25, s * 0.7, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  },

  candy: ({ ctx, W, H, t, still }: View) => {
    const colours = ['#ffffff', '#fff3b0', '#7fe7ff', '#ffd1e8']
    for (const [i, d] of MANY.slice(0, 30).entries()) {
      const y = wrap(d.y * H - (still ? 0 : t * (10 + d.size * 12)), H)
      const x = d.x * W + Math.sin(t + d.phase) * 8
      ctx.globalAlpha = 0.35
      ctx.fillStyle = colours[i % colours.length]
      ctx.beginPath()
      ctx.arc(x, y, 4 + d.size * 6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 0.18
    ctx.fillStyle = '#ffffff'
    for (let i = -2; i < 10; i++) {
      const x = wrap(i * 70 + (still ? 0 : t * 12), W + 140) - 70
      ctx.beginPath()
      ctx.moveTo(x, H)
      ctx.lineTo(x + 30, H)
      ctx.lineTo(x + 130, 0)
      ctx.lineTo(x + 100, 0)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  },

  snow: (v: View) => {
    const { ctx, W, H, t, a, still } = v
    ctx.fillStyle = alpha('#ffffff', 0.12)
    for (const [k, base] of [
      [0.78, 0.25],
      [0.86, 0.6],
    ]) {
      ctx.beginPath()
      ctx.moveTo(0, H)
      for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H * k - Math.sin(x / 60 + base * 9) * 40 - base * 60)
      ctx.lineTo(W, H)
      ctx.fill()
    }
    ctx.fillStyle = a.star
    for (const d of MANY) {
      const y = still ? d.y * H : wrap(d.y * H + t * (20 + d.size * 25), H)
      const x = wrap(d.x * W + Math.sin(t * 0.8 + d.phase) * 14, W)
      ctx.globalAlpha = 0.5 + 0.4 * d.size
      ctx.beginPath()
      ctx.arc(x, y, 1 + d.size * 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  },

  fireflies: ({ ctx, W, H, t, a, still }: View) => {
    ctx.fillStyle = '#020a07'
    for (const [i, d] of dots(9, 13).entries()) {
      const x = d.x * W
      const h = H * (0.25 + d.size * 0.25)
      ctx.beginPath()
      ctx.moveTo(x, H)
      ctx.lineTo(x - 26 - i * 2, H)
      ctx.lineTo(x - 13, H - h)
      ctx.fill()
    }
    for (const d of MANY.slice(0, 40)) {
      const x = d.x * W + (still ? 0 : Math.sin(t * 0.6 + d.phase) * 30)
      const y = d.y * H + (still ? 0 : Math.cos(t * 0.5 + d.phase * 2) * 20)
      const glow = 0.5 + 0.5 * Math.sin(t * 3 + d.phase * 3)
      blob(ctx, x, y, 10, a.glow, 0.35 * glow)
      ctx.fillStyle = alpha(a.star, glow)
      ctx.fillRect(x - 1, y - 1, 2.5, 2.5)
    }
  },

  petals: ({ ctx, W, H, t, a, still }: View) => {
    blob(ctx, W * 0.7, H * 0.2, W * 0.3, '#fff3e0', 0.35)
    ctx.fillStyle = '#fff3e0'
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.arc(W * 0.7, H * 0.2, W * 0.09, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = a.star
    for (const d of MANY.slice(0, 45)) {
      const y = still ? d.y * H : wrap(d.y * H + t * (18 + d.size * 14), H)
      const x = wrap(d.x * W + (still ? 0 : t * 10) + Math.sin(t + d.phase) * 20, W)
      ctx.globalAlpha = 0.5 + 0.4 * d.size
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(t * 2 + d.phase)
      ctx.beginPath()
      ctx.ellipse(0, 0, 4 * d.size + 2, 2 * d.size + 1, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.globalAlpha = 1
  },

  ocean: ({ ctx, W, H, t, a, still }: View) => {
    ctx.globalAlpha = 0.07
    ctx.fillStyle = a.star
    for (let i = 0; i < 5; i++) {
      const x = W * (0.1 + i * 0.22) + Math.sin(t * 0.4 + i) * 30
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + 50, 0)
      ctx.lineTo(x + 140, H)
      ctx.lineTo(x + 60, H)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = a.star
    for (const d of MANY.slice(0, 35)) {
      const y = still ? d.y * H : wrap(d.y * H - t * (25 + d.size * 30), H)
      const x = d.x * W + Math.sin(t * 2 + d.phase) * 5
      ctx.globalAlpha = 0.3 + 0.3 * d.size
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(x, y, 2 + d.size * 3, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  },

  dunes: ({ ctx, W, H, t, a }: View) => {
    blob(ctx, W * 0.5, H * 0.32, W * 0.55, a.glow, 0.55)
    ctx.fillStyle = '#ffe9a8'
    ctx.beginPath()
    ctx.arc(W * 0.5, H * 0.32 + Math.sin(t * 0.3) * 4, W * 0.14, 0, Math.PI * 2)
    ctx.fill()
    const layers: Array<[number, string]> = [
      [0.55, '#b5523b'],
      [0.68, '#8a3a3a'],
      [0.82, '#5a2a3a'],
    ]
    for (const [i, [k, col]] of layers.entries()) {
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.moveTo(0, H)
      for (let x = 0; x <= W; x += 16) {
        const shimmer = i === 0 ? Math.sin(t * 3 + x / 10) * 1.5 : 0
        ctx.lineTo(x, H * k + Math.sin(x / (90 - i * 15) + i * 2 + t * 0.05 * (i + 1)) * 26 + shimmer)
      }
      ctx.lineTo(W, H)
      ctx.fill()
    }
  },

  rain: (v: View) => {
    const { ctx, W, H, t, a, still } = v
    blob(ctx, W * 0.3, H * 0.1, W * 0.6, '#3a4a6a', 0.5)
    blob(ctx, W * 0.8, H * 0.15, W * 0.5, '#2a3550', 0.5)
    ctx.strokeStyle = a.star
    ctx.lineWidth = 1
    for (const d of MANY) {
      const y = still ? d.y * H : wrap(d.y * H + t * (420 + d.size * 160), H + 40) - 20
      const x = wrap(d.x * W + (still ? 0 : t * 60), W)
      ctx.globalAlpha = 0.2 + 0.25 * d.size
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - 4, y + 14 + d.size * 8)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    // Lightning: a flash for a moment every few seconds.
    const cycle = wrap(t, 6.5)
    if (!still && cycle < 0.18) {
      ctx.fillStyle = alpha(a.glow, 0.35 * (1 - cycle / 0.18))
      ctx.fillRect(0, 0, W, H)
      ctx.strokeStyle = alpha('#ffffff', 0.9)
      ctx.lineWidth = 2.5
      ctx.beginPath()
      let x = W * (0.2 + 0.6 * ((Math.floor(t / 6.5) * 0.37) % 1))
      ctx.moveTo(x, 0)
      for (let y = 0; y < H * 0.55; y += 30) {
        x += ((y * 7919) % 41) - 20
        ctx.lineTo(x, y + 30)
      }
      ctx.stroke()
    }
  },

  aurora: (v: View) => {
    const { ctx, W, H, t, a } = v
    starfield(v, 0.2)
    const bands: Array<[string, number]> = [
      [a.star, 0.22],
      [a.glow, 0.3],
      ['#5ab8ff', 0.4],
    ]
    for (const [i, [col, k]] of bands.entries()) {
      const g = ctx.createLinearGradient(0, H * (k - 0.12), 0, H * (k + 0.18))
      g.addColorStop(0, alpha(col, 0))
      g.addColorStop(0.5, alpha(col, 0.35))
      g.addColorStop(1, alpha(col, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.moveTo(0, H)
      for (let x = 0; x <= W; x += 12) {
        ctx.lineTo(x, H * k + Math.sin(x / 70 + t * (0.5 + i * 0.2) + i) * 30 + Math.sin(x / 23 + t) * 8)
      }
      for (let x = W; x >= 0; x -= 12) {
        ctx.lineTo(x, H * (k + 0.2) + Math.sin(x / 60 + t * 0.4 + i * 2) * 20)
      }
      ctx.fill()
    }
  },

  grid: ({ ctx, W, H, floorY, t, a, still }: View) => {
    const horizon = H * 0.42
    // Striped sun.
    const sun = ctx.createLinearGradient(0, horizon - W * 0.3, 0, horizon)
    sun.addColorStop(0, a.star)
    sun.addColorStop(1, a.glow)
    ctx.fillStyle = sun
    ctx.beginPath()
    ctx.arc(W / 2, horizon, W * 0.28, Math.PI, 0)
    ctx.fill()
    ctx.fillStyle = mix(theme.night, '#3a1248', 0.5)
    for (let i = 0; i < 5; i++) ctx.fillRect(0, horizon - 14 - i * 16, W, 3 + i * 0.6)
    // Perspective grid scrolling toward the player.
    ctx.strokeStyle = alpha(a.glow, 0.55)
    ctx.lineWidth = 1.2
    for (let i = -10; i <= 10; i++) {
      ctx.beginPath()
      ctx.moveTo(W / 2 + i * 8, horizon)
      ctx.lineTo(W / 2 + i * W * 0.22, floorY + 40)
      ctx.stroke()
    }
    const scroll = still ? 0 : wrap(t * 0.6, 1)
    for (let i = 0; i < 12; i++) {
      const k = (i + scroll) / 12
      const y = horizon + (floorY + 40 - horizon) * k * k
      ctx.globalAlpha = k
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  },

  jellies: ({ ctx, W, H, t, a, still }: View) => {
    for (const d of MANY) {
      ctx.globalAlpha = 0.25 + 0.3 * Math.sin(t + d.phase)
      ctx.fillStyle = a.star
      ctx.fillRect(d.x * W, wrap(d.y * H - (still ? 0 : t * 6), H), 1.5, 1.5)
    }
    ctx.globalAlpha = 1
    for (const [i, d] of dots(5, 77).entries()) {
      const x = d.x * W + Math.sin(t * 0.3 + i) * 20
      const y = still ? d.y * H : wrap(d.y * H - t * (12 + i * 3), H + 120) - 60
      const pulse = 1 + 0.12 * Math.sin(t * 3 + i)
      const col = i % 2 ? a.glow : a.star
      blob(ctx, x, y, 34, col, 0.25)
      ctx.fillStyle = alpha(col, 0.55)
      ctx.beginPath()
      ctx.ellipse(x, y, 16 * pulse, 11 / pulse, 0, Math.PI, 0)
      ctx.fill()
      ctx.strokeStyle = alpha(col, 0.45)
      ctx.lineWidth = 1.5
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath()
        ctx.moveTo(x + k * 5, y)
        for (let s = 1; s <= 4; s++) ctx.lineTo(x + k * 5 + Math.sin(t * 4 + s + k) * 3, y + s * 9)
        ctx.stroke()
      }
    }
  },

  circuit: ({ ctx, W, H, t, a }: View) => {
    ctx.lineWidth = 2
    for (const [i, d] of dots(16, 41).entries()) {
      const x0 = Math.round(d.x * 10) * (W / 10)
      const y0 = Math.round(d.y * 14) * (H / 14)
      const len = 60 + d.size * 80
      const turn = i % 2 ? 1 : -1
      const pulse = wrap(t * 0.5 + d.phase, 1)
      ctx.strokeStyle = alpha(a.star, 0.18)
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x0, y0 + len)
      ctx.lineTo(x0 + turn * len * 0.6, y0 + len * 1.4)
      ctx.stroke()
      ctx.fillStyle = alpha(a.star, 0.35)
      ctx.beginPath()
      ctx.arc(x0, y0, 3, 0, Math.PI * 2)
      ctx.fill()
      // A spark running along the trace.
      const k = pulse * 1.6
      const [px, py] =
        k < 1
          ? [x0, y0 + len * k]
          : [x0 + (turn * len * 0.6 * (k - 1)) / 0.6, y0 + len + (len * 0.4 * (k - 1)) / 0.6]
      blob(ctx, px, py, 10, a.glow, 0.8)
    }
  },

  code: ({ ctx, W, H, t, a, still }: View) => {
    const cols = Math.floor(W / 14)
    ctx.font = '700 12px monospace'
    ctx.textAlign = 'center'
    for (let c = 0; c < cols; c++) {
      const speed = 60 + ((c * 37) % 50)
      const head = still ? (c * 97) % H : wrap(t * speed + c * 113, H + 200)
      for (let k = 0; k < 14; k++) {
        const y = head - k * 15
        if (y < 0 || y > H) continue
        const glyph = String.fromCharCode(0x30a0 + ((c * 13 + k * 7 + Math.floor(t * 8)) % 90))
        ctx.fillStyle = k === 0 ? '#e0ffe0' : alpha(a.star, 0.7 * (1 - k / 14))
        ctx.fillText(glyph, c * 14 + 7, y)
      }
    }
  },

  lava: ({ ctx, W, H, floorY, t, a, still }: View) => {
    const g = ctx.createLinearGradient(0, floorY - 60, 0, H)
    g.addColorStop(0, alpha(a.glow, 0))
    g.addColorStop(1, alpha(a.glow, 0.55 + 0.15 * Math.sin(t * 2)))
    ctx.fillStyle = g
    ctx.fillRect(0, floorY - 60, W, H)
    ctx.strokeStyle = alpha('#ffc83d', 0.25)
    ctx.lineWidth = 2
    for (const d of dots(8, 3)) {
      ctx.beginPath()
      ctx.moveTo(d.x * W, H)
      ctx.lineTo(d.x * W + 20, H - 40 - d.size * 30)
      ctx.lineTo(d.x * W - 10, H - 70 - d.size * 50)
      ctx.stroke()
    }
    for (const d of MANY.slice(0, 50)) {
      const y = still ? d.y * H : wrap(d.y * H - t * (40 + d.size * 50), H)
      const x = d.x * W + Math.sin(t * 2 + d.phase) * 10
      ctx.globalAlpha = (y / H) * (0.6 + 0.4 * d.size)
      ctx.fillStyle = d.size > 1 ? '#ffc83d' : a.star
      ctx.fillRect(x, y, 2 + d.size, 2 + d.size)
    }
    ctx.globalAlpha = 1
  },

  meteors: (v: View) => {
    const { ctx, W, H, t, a, still } = v
    starfield(v, 0.3)
    if (still) return
    for (const [i, d] of dots(6, 55).entries()) {
      const k = wrap(t * 0.35 + d.phase, 1.6)
      if (k > 1) continue
      const x = d.x * W * 1.2 - k * W * 0.6
      const y = d.y * H * 0.5 + k * H * 0.5
      const g = ctx.createLinearGradient(x, y, x + 70, y - 70)
      g.addColorStop(0, a.star)
      g.addColorStop(1, alpha(i % 2 ? a.glow : a.star, 0))
      ctx.strokeStyle = g
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 70, y - 70)
      ctx.stroke()
    }
  },

  city: (v: View) => {
    const { ctx, W, H, t, a } = v
    starfield(v, 0.3)
    blob(ctx, W / 2, H * 0.75, W * 0.7, a.glow, 0.25)
    for (const [layer, shade, speed] of [
      [0, '#1a0b33', 4],
      [1, '#0d0520', 9],
    ] as const) {
      const buildings = dots(14, 31 + layer * 7)
      const width = W / 7
      for (const [i, b] of buildings.entries()) {
        const x = wrap(i * width * 0.9 - t * speed, W + width * 2) - width
        const h = H * (0.18 + b.size * 0.22 + layer * 0.06)
        ctx.fillStyle = shade
        ctx.fillRect(x, H - h, width * 0.8, h)
        for (let wy = H - h + 10; wy < H - 10; wy += 14) {
          for (let wx = x + 6; wx < x + width * 0.8 - 8; wx += 12) {
            const on = Math.sin(wx * 3.1 + wy * 1.7 + Math.floor(t / 2) * 1.3) > 0.4
            if (!on) continue
            ctx.fillStyle = alpha((wx + wy) % 3 < 1 ? a.glow : a.star, layer ? 0.75 : 0.4)
            ctx.fillRect(wx, wy, 5, 6)
          }
        }
      }
    }
  },

  spiral: ({ ctx, W, H, t, a, still }: View) => {
    const cx = W / 2
    const cy = H * 0.38
    blob(ctx, cx, cy, W * 0.25, a.glow, 0.6)
    blob(ctx, cx, cy, W * 0.08, '#ffffff', 0.9)
    const spin = still ? 0 : t * 0.15
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i < 70; i++) {
        const r = 6 + i * (W / 110)
        const ang = spin + arm * ((Math.PI * 2) / 3) + i * 0.09
        const jitter = Math.sin(i * 12.9 + arm) * 6
        ctx.globalAlpha = 0.8 * (1 - i / 70)
        ctx.fillStyle = i % 4 ? a.star : a.glow
        ctx.fillRect(cx + Math.cos(ang) * (r + jitter), cy + Math.sin(ang) * (r + jitter) * 0.55, 2, 2)
      }
    }
    ctx.globalAlpha = 1
  },

  warp: ({ ctx, W, H, t, a, still }: View) => {
    const cx = W / 2
    const cy = H * 0.4
    blob(ctx, cx, cy, W * 0.3, a.glow, 0.35)
    for (const d of MANY) {
      const k = still ? d.y : wrap(d.y + t * (0.25 + d.size * 0.2), 1)
      const ang = d.x * Math.PI * 2
      const r0 = k * k * W
      const r1 = r0 + 6 + k * 40
      ctx.strokeStyle = alpha(d.size > 1 ? a.glow : a.star, Math.min(1, k * 1.5))
      ctx.lineWidth = 1 + k * 1.5
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0)
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1)
      ctx.stroke()
    }
  },
} satisfies Record<string, Scene>

export type SceneId = keyof typeof SCENES

const STORM = '#ff6b6b'

/** Draws the arena: gradient sky, its animated scene, the launch glow and the fever pulse. */
export class ArenaPainter {
  draw(
    ctx: CanvasRenderingContext2D,
    arena: ArenaId,
    turn: number,
    fever: boolean,
    time: number,
    size: { boardW: number; boardH: number; floorY: number } = {
      boardW: BOARD_W,
      boardH: BOARD_H,
      floorY: FLOOR_Y,
    },
  ): void {
    const { boardW: W, boardH: H, floorY } = size
    const a = ARENAS[arena] ?? ARENAS.indigo
    const level = stormLevel(turn)
    const warm = 0.07 * level
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, mix(a.top, STORM, warm))
    sky.addColorStop(1, mix(a.bottom, STORM, warm * 0.5))
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, H)

    ctx.save()
    SCENES[a.scene]({ ctx, W, H, floorY, t: time * (1 + 0.3 * level), a, still: prefersReducedMotion() })
    ctx.restore()
    ctx.globalAlpha = 1

    const glow = ctx.createRadialGradient(W / 2, floorY, 10, W / 2, floorY, W * 0.7)
    glow.addColorStop(0, a.glow + '40')
    glow.addColorStop(1, a.glow + '00')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)

    if (fever) {
      ctx.fillStyle = theme.yolk
      ctx.globalAlpha = 0.12 * (0.5 + 0.5 * Math.sin((time * 2 * Math.PI) / 0.5))
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
    }
  }
}
