// Pure look-and-layout helpers for the renderer (no canvas), so they can be tested.
import { valueOf } from './board'

/** Tile colours by tier: cool and calm at first, hot and gold as numbers grow. */
const TIERS = [
  '#8ee6c4', // 2
  '#5cd2e6', // 4
  '#5ab8ff', // 8
  '#7c8cff', // 16
  '#b48cff', // 32
  '#e27bff', // 64
  '#ff6fb5', // 128
  '#ff6b6b', // 256
  '#ff9f43', // 512
  '#ffc83d', // 1024
  '#fff06a', // 2048
]
/** Tiers past the palette shimmer through every colour. */
export const RAINBOW_TIER = TIERS.length + 1

export function tileColor(tier: number, time = 0): string {
  if (tier < RAINBOW_TIER) return TIERS[Math.max(0, tier - 1)]
  return `hsl(${Math.round((time * 90 + tier * 40) % 360)}, 95%, 66%)`
}

/** Dark text on the light tiles, white on the rest. */
export const textColor = (tier: number) =>
  tier <= 2 || tier === 10 || tier === 11 || tier >= RAINBOW_TIER ? '#1d1440' : '#ffffff'

/** Tiles from this tier glow. */
export const GLOW_TIER = 9

/** Short label for a tile: 131072 → "131K". */
export function label(tier: number): string {
  const v = valueOf(tier)
  return v >= 100_000 ? `${Math.floor(v / 1000)}K` : String(v)
}

/** Font size for a tile label so long numbers still fit. */
export const fontSize = (text: string, cell: number) =>
  cell * [0.5, 0.5, 0.46, 0.38, 0.31, 0.27][Math.min(5, text.length)]

/** Merge notes climb a major pentatonic scale with the tier: bigger fuse, higher note. */
const PENTA = [0, 2, 4, 7, 9]
export function mergeFreq(tier: number): number {
  const step = Math.max(0, tier - 1)
  const semis = Math.floor(step / 5) * 12 + PENTA[step % 5]
  return 330 * 2 ** (semis / 12)
}

// ---------- Layout (logical units; the canvas scales to fit) ----------

export const WIDTH = 560
const PAD = 20
export const HUD_H = 108
/** Height of the rivals strip in a race. */
export const RIVALS_H = 150

export interface Layout {
  width: number
  height: number
  /** Top of the HUD. */
  hudY: number
  /** Board well (outer box). */
  bx: number
  by: number
  bw: number
  size: number
  cell: number
  gap: number
  rivals: number
}

export function layoutFor(size: number, rivals: number): Layout {
  const bw = WIDTH - PAD * 2
  const gap = size >= 6 ? 8 : 10
  const cell = (bw - gap * (size + 1)) / size
  const top = rivals > 0 ? RIVALS_H : 0
  return {
    width: WIDTH,
    height: top + HUD_H + bw + PAD,
    hudY: top,
    bx: PAD,
    by: top + HUD_H,
    bw,
    size,
    cell,
    gap,
    rivals,
  }
}

/** Top-left corner of a cell. */
export const cellPos = (l: Layout, cell: number): [number, number] => [
  l.bx + l.gap + (cell % l.size) * (l.cell + l.gap),
  l.by + l.gap + Math.floor(cell / l.size) * (l.cell + l.gap),
]

/** Board cell under a logical point, or -1 (gaps count as the nearest cell). */
export function cellAt(l: Layout, px: number, py: number): number {
  const cx = Math.floor((px - l.bx - l.gap / 2) / (l.cell + l.gap))
  const cy = Math.floor((py - l.by - l.gap / 2) / (l.cell + l.gap))
  return cx < 0 || cy < 0 || cx >= l.size || cy >= l.size ? -1 : cy * l.size + cx
}

/** "2:05" for a clock in seconds. */
export const clockText = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
