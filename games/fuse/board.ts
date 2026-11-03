// Pure slide-and-merge rules. A board is a flat, row-major array of cells.
// Tiles carry an id so renderers can animate them from cell to cell.

export type Dir = 'up' | 'down' | 'left' | 'right'
export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right']

/** Tier of a rock: it never moves or merges, and crumbles when a merge happens next to it. */
export const ROCK = -1

export interface Tile {
  id: number
  /** Tier ≥ 1 (shown as 2^tier), or ROCK. */
  v: number
  /** Rocks only: hits left before it crumbles. */
  hp?: number
}

/** Hits a rock takes: the first cracks it, the second breaks it. */
export const ROCK_HP = 2

export type Cells = (Tile | null)[]

export interface Merge {
  /** Cell the merged tile ends up in. */
  cell: number
  /** Tier of the new tile. */
  tier: number
  /** Ids of the two tiles that fused. */
  from: [number, number]
}

export interface SlideResult {
  cells: Cells
  moved: boolean
  merges: Merge[]
}

export const valueOf = (tier: number) => 2 ** tier

/** Cell indices of one line, ordered from the side tiles slide towards. */
export function lines(size: number, dir: Dir): number[][] {
  const out: number[][] = []
  for (let a = 0; a < size; a++) {
    const line: number[] = []
    for (let b = 0; b < size; b++) {
      const i = dir === 'left' || dir === 'right' ? a * size : a
      const step = dir === 'left' || dir === 'right' ? 1 : size
      const k = dir === 'right' || dir === 'down' ? size - 1 - b : b
      line.push(i + k * step)
    }
    out.push(line)
  }
  return out
}

/**
 * Slides every tile towards `dir`. Equal tiers fuse once per move; rocks stay
 * put and split a line into separate stretches. `newId` hands out ids for
 * merged tiles. Does not touch the input.
 */
export function slide(cells: Cells, size: number, dir: Dir, newId: () => number): SlideResult {
  const out: Cells = cells.slice()
  const merges: Merge[] = []
  let moved = false
  for (const line of lines(size, dir)) {
    let start = 0
    while (start < line.length) {
      // One stretch between rocks (or the edge).
      let end = start
      while (end < line.length && cells[line[end]]?.v !== ROCK) end++
      const tiles = line
        .slice(start, end)
        .map((c) => cells[c])
        .filter((t): t is Tile => !!t)
      const packed: Tile[] = []
      for (let i = 0; i < tiles.length; i++) {
        const a = tiles[i]
        const b = tiles[i + 1]
        if (b && a.v === b.v) {
          const tile = { id: newId(), v: a.v + 1 }
          merges.push({ cell: line[start + packed.length], tier: tile.v, from: [a.id, b.id] })
          packed.push(tile)
          i++
        } else packed.push(a)
      }
      for (let k = start; k < end; k++) {
        const next = packed[k - start] ?? null
        if (next?.id !== cells[line[k]]?.id) moved = true
        out[line[k]] = next
      }
      start = end + 1
    }
  }
  return { cells: out, moved: moved || merges.length > 0, merges }
}

export const emptyCells = (cells: Cells) => cells.flatMap((c, i) => (c ? [] : [i]))

/** Whether any direction would change the board. */
export function canSlide(cells: Cells, size: number): boolean {
  let id = 0
  return DIRS.some((d) => slide(cells, size, d, () => --id).moved)
}

/** Orthogonal neighbours of a cell. */
export function neighbours(cell: number, size: number): number[] {
  const x = cell % size
  const y = Math.floor(cell / size)
  const out: number[] = []
  if (x > 0) out.push(cell - 1)
  if (x < size - 1) out.push(cell + 1)
  if (y > 0) out.push(cell - size)
  if (y < size - 1) out.push(cell + size)
  return out
}

/** Rocks next to any of the merge cells (each is hit once per move, however many merges touch it). */
export function rocksHit(cells: Cells, size: number, mergeCells: number[]): number[] {
  const hit = new Set<number>()
  for (const m of mergeCells) for (const n of neighbours(m, size)) if (cells[n]?.v === ROCK) hit.add(n)
  return [...hit]
}

/**
 * Hits the rocks next to the merges, in place. Returns the cells that cracked
 * and the ones that broke (and are now empty).
 */
export function hitRocks(
  cells: Cells,
  size: number,
  mergeCells: number[],
): { cracked: number[]; broken: number[] } {
  const cracked: number[] = []
  const broken: number[] = []
  for (const c of rocksHit(cells, size, mergeCells)) {
    const rock = cells[c]!
    const hp = (rock.hp ?? ROCK_HP) - 1
    if (hp <= 0) {
      cells[c] = null
      broken.push(c)
    } else {
      cells[c] = { ...rock, hp }
      cracked.push(c)
    }
  }
  return { cracked, broken }
}

export const bestTier = (cells: Cells) => cells.reduce((m, c) => Math.max(m, c?.v ?? 0), 0)
