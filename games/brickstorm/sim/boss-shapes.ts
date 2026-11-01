// Boss bodies: each is a set of cells (so the hitbox is exactly what is drawn)
// with a "core" rectangle that holds the face and the health bar.
import type { BossTier, BrickShape } from './types'

export interface BossShape {
  /** Cells as [col, row] offsets from the shape's top-left. */
  cells: Array<[number, number]>
  /** The rectangle (in cells) the face and hp bar are drawn in; always fully filled. */
  core: { col: number; row: number; w: number; h: number }
  tier: BossTier
  /** Cells that are triangles or orbs (shoulders, horns, fists), by "col,row". */
  shaped?: Record<string, BrickShape>
  /** Kept only so saved bosses load; new bosses don't roll it. */
  legacy?: boolean
}

const rect = (w: number, h: number, dc = 0, dr = 0): Array<[number, number]> =>
  Array.from({ length: w * h }, (_, i) => [dc + (i % w), dr + Math.floor(i / w)])

export const BOSS_SHAPES: Record<string, BossShape> = {
  // ----- Built from the new blocks: triangle shoulders and horns, orb fists. -----
  // Turn 30.
  brute: {
    // Sloped shoulders over a 3×2 body.
    cells: [[0, 0], [1, 0], [2, 0], ...rect(3, 2, 0, 1)],
    core: { col: 0, row: 1, w: 3, h: 2 },
    tier: 1,
    shaped: { '0,0': 'tri-br', '2,0': 'tri-bl' },
  },
  brawler: {
    // A 2×2 body with an orb fist at each side.
    cells: [[0, 1], ...rect(2, 2, 1, 0), [3, 1]],
    core: { col: 1, row: 0, w: 2, h: 2 },
    tier: 1,
    shaped: { '0,1': 'orb', '3,1': 'orb' },
  },
  imp: {
    // Two horns on a 3×2 body.
    cells: [[0, 0], [2, 0], ...rect(3, 2, 0, 1)],
    core: { col: 0, row: 1, w: 3, h: 2 },
    tier: 1,
    shaped: { '0,0': 'tri-bl', '2,0': 'tri-br' },
  },
  // Turn 60.
  warlord: {
    // Wide shoulders over a 4×2 body, with orb fists below the arms.
    cells: [[0, 0], [1, 0], [2, 0], [3, 0], ...rect(4, 2, 0, 1)],
    core: { col: 0, row: 1, w: 4, h: 2 },
    tier: 2,
    shaped: { '0,0': 'tri-br', '3,0': 'tri-bl' },
  },
  beetle: {
    // A 4×2 shell on four pointed legs.
    cells: [...rect(4, 2), [0, 2], [3, 2]],
    core: { col: 0, row: 0, w: 4, h: 2 },
    tier: 2,
    shaped: { '0,0': 'tri-br', '3,0': 'tri-bl', '0,2': 'tri-tr', '3,2': 'tri-tl' },
  },
  ogre: {
    // A tall 3×2 body, horns, and orb fists.
    cells: [[0, 0], [2, 0], ...rect(3, 2, 0, 1), [-1, 2], [3, 2]].map(([c, r]) => [c + 1, r]) as Array<
      [number, number]
    >,
    core: { col: 1, row: 1, w: 3, h: 2 },
    tier: 2,
    shaped: { '1,0': 'tri-bl', '3,0': 'tri-br', '0,2': 'orb', '4,2': 'orb' },
  },
  // Turn 90+.
  colossus: {
    // A 5×2 core with shoulders, a crown of horns and orb fists: fills the arena.
    cells: [[0, 0], [2, 0], [4, 0], ...rect(5, 1, 0, 1), ...rect(5, 2, 0, 2)],
    core: { col: 0, row: 2, w: 5, h: 2 },
    tier: 3,
    shaped: { '0,0': 'tri-br', '2,0': 'orb', '4,0': 'tri-bl', '0,1': 'tri-br', '4,1': 'tri-bl' },
  },
  dragon: {
    // Wings of triangles either side of a 3×3 body.
    cells: [[0, 1], [0, 2], ...rect(3, 3, 1, 0), [4, 1], [4, 2]],
    core: { col: 1, row: 0, w: 3, h: 3 },
    tier: 3,
    shaped: { '0,1': 'tri-br', '0,2': 'tri-tr', '4,1': 'tri-bl', '4,2': 'tri-tl' },
  },
  juggernaut: {
    // A 4×3 block with orb shoulders and pointed feet.
    cells: [[0, 0], ...rect(4, 3, 1, 0), [5, 0], [1, 3], [4, 3]],
    core: { col: 1, row: 0, w: 4, h: 3 },
    tier: 3,
    shaped: { '0,0': 'orb', '5,0': 'orb', '1,3': 'tri-tr', '4,3': 'tri-tl' },
  },
  // ----- Older bodies, kept for saved runs. -----
  cube: { cells: rect(2, 2), core: { col: 0, row: 0, w: 2, h: 2 }, tier: 1, legacy: true },
  block: { cells: rect(3, 2), core: { col: 0, row: 0, w: 3, h: 2 }, tier: 1, legacy: true },
  slab: { cells: rect(4, 2), core: { col: 0, row: 0, w: 4, h: 2 }, tier: 2, legacy: true },
  tower: { cells: rect(2, 3), core: { col: 0, row: 0, w: 2, h: 2 }, tier: 2, legacy: true },
  horned: {
    cells: [[0, 0], [2, 0], ...rect(3, 2, 0, 1)],
    core: { col: 0, row: 1, w: 3, h: 2 },
    tier: 2,
    legacy: true,
  },
  fang: { cells: [...rect(3, 2), [1, 2]], core: { col: 0, row: 0, w: 3, h: 2 }, tier: 2, legacy: true },
  giant: { cells: rect(4, 3), core: { col: 0, row: 0, w: 4, h: 3 }, tier: 3, legacy: true },
  cross: {
    cells: [[1, 0], ...rect(3, 2, 0, 1), [1, 3]],
    core: { col: 0, row: 1, w: 3, h: 2 },
    tier: 3,
    legacy: true,
  },
  fortress: {
    cells: [...rect(1, 3), ...rect(3, 2, 1, 0), ...rect(1, 3, 4, 0)],
    core: { col: 1, row: 0, w: 3, h: 2 },
    tier: 3,
    legacy: true,
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
