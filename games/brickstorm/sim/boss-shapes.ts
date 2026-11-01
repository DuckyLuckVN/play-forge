// Boss bodies: each is a set of cells (so the hitbox is exactly what is drawn)
// with a "core" rectangle that holds the face and the health bar.
import type { BossTier } from './types'

export interface BossShape {
  /** Cells as [col, row] offsets from the shape's top-left. */
  cells: Array<[number, number]>
  /** The rectangle (in cells) the face and hp bar are drawn in; always fully filled. */
  core: { col: number; row: number; w: number; h: number }
  tier: BossTier
}

const rect = (w: number, h: number, dc = 0, dr = 0): Array<[number, number]> =>
  Array.from({ length: w * h }, (_, i) => [dc + (i % w), dr + Math.floor(i / w)])

export const BOSS_SHAPES: Record<string, BossShape> = {
  // Small (turn 30).
  cube: { cells: rect(2, 2), core: { col: 0, row: 0, w: 2, h: 2 }, tier: 1 },
  block: { cells: rect(3, 2), core: { col: 0, row: 0, w: 3, h: 2 }, tier: 1 },
  // Medium (turn 60).
  slab: { cells: rect(4, 2), core: { col: 0, row: 0, w: 4, h: 2 }, tier: 2 },
  tower: { cells: rect(2, 3), core: { col: 0, row: 0, w: 2, h: 2 }, tier: 2 },
  horned: { cells: [[0, 0], [2, 0], ...rect(3, 2, 0, 1)], core: { col: 0, row: 1, w: 3, h: 2 }, tier: 2 },
  fang: { cells: [...rect(3, 2), [1, 2]], core: { col: 0, row: 0, w: 3, h: 2 }, tier: 2 },
  // Big (turn 90+).
  giant: { cells: rect(4, 3), core: { col: 0, row: 0, w: 4, h: 3 }, tier: 3 },
  cross: { cells: [[1, 0], ...rect(3, 2, 0, 1), [1, 3]], core: { col: 0, row: 1, w: 3, h: 2 }, tier: 3 },
  fortress: {
    cells: [...rect(1, 3), ...rect(3, 2, 1, 0), ...rect(1, 3, 4, 0)],
    core: { col: 1, row: 0, w: 3, h: 2 },
    tier: 3,
  },
}

/** Saved bosses from before shapes were the 3×2 block. */
export function shapeOf(id: string | undefined): BossShape {
  return BOSS_SHAPES[id ?? 'block'] ?? BOSS_SHAPES.block
}

export function shapeSize(shape: BossShape): { w: number; h: number } {
  return {
    w: Math.max(...shape.cells.map(([c]) => c)) + 1,
    h: Math.max(...shape.cells.map(([, r]) => r)) + 1,
  }
}
