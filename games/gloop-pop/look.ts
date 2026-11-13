// Pure look-and-layout helpers for the renderer (no canvas), so they can be tested.
import { theme } from '@forge/ui/theme'
import { H, W } from './grid'

/** The three gloop colours. Each also has its own shape (spiky, round, boxy), so colour isn't the only clue. */
export const GLOOP_COLORS = [theme.coral, theme.yolk, theme.sky] as const
/** Darker edge per colour, for depth. */
export const GLOOP_EDGES = ['#c0392b', '#c98f00', '#2d7fc4'] as const
export type GloopShape = 'spiky' | 'round' | 'boxy'
export const GLOOP_SHAPES: readonly GloopShape[] = ['spiky', 'round', 'boxy']

// ---------- Layout (logical units; the canvas scales to fit) ----------

export const CELL = 34
export const BOARD_W = W * CELL
export const BOARD_H = H * CELL
/** Room above the jar for the bottle's shoulders and neck (junk on the way waits in the neck). */
const TOP = 86
const PAD = 22
export const PANEL_W = 196

export interface Layout {
  width: number
  height: number
  /** Jar interior (cell 0,0 at top-left). */
  bx: number
  by: number
  /** Side panel. */
  px: number
  py: number
  pw: number
  ph: number
}

export function layout(): Layout {
  const bx = PAD
  const by = TOP
  const px = bx + BOARD_W + PAD + 4
  return {
    width: px + PANEL_W + PAD - 6,
    height: by + BOARD_H + PAD,
    bx,
    by,
    px,
    py: by,
    pw: PANEL_W,
    ph: BOARD_H,
  }
}

/** The bottle around the jar: a body with rounded bottom, sloping shoulders and a neck with a lip. */
export interface Bottle {
  /** Body sides and bottom (outer edge). */
  left: number
  right: number
  bottom: number
  /** Where the shoulders meet the body. */
  shoulderY: number
  /** Neck sides and top. */
  neckL: number
  neckR: number
  neckY: number
  /** Where the neck starts (top of the shoulders). */
  neckBase: number
  lip: number
  radius: number
}

export function bottle(l: Layout): Bottle {
  const wall = 10
  const neckW = CELL * 4 + 12
  const mid = l.bx + BOARD_W / 2
  return {
    left: l.bx - wall,
    right: l.bx + BOARD_W + wall,
    bottom: l.by + BOARD_H + wall,
    shoulderY: l.by + 6,
    neckL: mid - neckW / 2,
    neckR: mid + neckW / 2,
    neckY: l.by - 72,
    neckBase: l.by - 34,
    lip: 8,
    radius: 30,
  }
}

/** Top-left of a cell. */
export const cellXY = (l: Layout, x: number, y: number): [number, number] => [
  l.bx + x * CELL,
  l.by + y * CELL,
]

/** Rival mini-jars in the side panel: up to 3 in a row. */
export function rivalBox(l: Layout, k: number, n: number): { x: number; y: number; cell: number } {
  const cell = 7
  const w = W * cell
  const gap = Math.max(6, (l.pw - n * w) / (n + 1))
  return { x: l.px + gap + k * (w + gap), y: l.py + 330, cell }
}

/** Pitch for a pop: climbs a major scale with the chain, so a chain sounds like it's going somewhere. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16]
export const chainFreq = (chain: number) =>
  523.25 * 2 ** (MAJOR[Math.min(MAJOR.length - 1, Math.max(0, chain - 1))] / 12)

/** Callout for a chain: "Chain ×2!" and friends; bigger chains get bigger words. */
export function chainWord(chain: number): { size: number; burst: boolean } {
  return { size: Math.min(56, 28 + chain * 6), burst: chain >= 3 }
}

/** Cells in one pop burst one after another (pop-pop-pop), never taking longer than 0.3 s in all. */
export const popStagger = (n: number) => Math.min(0.05, 0.3 / Math.max(1, n))

export type ComboWord = 'double' | 'triple' | 'mega'
/** Gloops popped by one capsule passing 2, 3 or 5 earns a word (the biggest one passed). */
export function comboWord(before: number, after: number): ComboWord | null {
  if (before < 5 && after >= 5) return 'mega'
  if (before < 3 && after >= 3) return 'triple'
  if (before < 2 && after >= 2) return 'double'
  return null
}
