// Pure jar logic for Gloop Pop: cells, the falling capsule, matches and gravity.
// No randomness and no state machine here, so every rule is easy to test.

/** Jar size in cells. */
export const W = 8
export const H = 18
/** Lines of this many same-coloured cells pop. */
export const MATCH = 4
export const COLORS = 3

/** Direction from a capsule half to its other half. */
export const Link = { None: 0, Left: 1, Right: 2, Up: 3, Down: 4 } as const
export type Link = (typeof Link)[keyof typeof Link]

/**
 * A cell packed into one small number (cheap to send every tick):
 * 0 = empty; bits 0–1 colour + 1, bit 2 gloop, bits 3–5 link.
 */
export type Cell = number
export type Cells = Cell[]

export const makeCell = (color: number, gloop = false, link: Link = Link.None): Cell =>
  (color + 1) | (gloop ? 4 : 0) | (link << 3)
export const colorOf = (v: Cell) => (v & 3) - 1
export const isGloop = (v: Cell) => (v & 4) !== 0
export const linkOf = (v: Cell) => ((v >> 3) & 7) as Link
export const withLink = (v: Cell, link: Link): Cell => (v & 7) | (link << 3)

export const idx = (x: number, y: number) => y * W + x
export const emptyJar = (): Cells => Array<Cell>(W * H).fill(0)

const LINK_STEP: Record<Link, [number, number]> = {
  [Link.None]: [0, 0],
  [Link.Left]: [-1, 0],
  [Link.Right]: [1, 0],
  [Link.Up]: [0, -1],
  [Link.Down]: [0, 1],
}

/** Index of a linked half's partner, or -1. */
export function partnerOf(i: number, v: Cell): number {
  const link = linkOf(v)
  if (link === Link.None) return -1
  const [dx, dy] = LINK_STEP[link]
  return i + dx + dy * W
}

// ---------- The falling capsule ----------

/**
 * `x, y` is the bottom-left cell. `r` 0: a b (side by side), 1: b over a,
 * 2: b a, 3: a over b. Turning left adds 1, turning right takes 1.
 */
export interface Piece {
  x: number
  y: number
  r: number
  a: number
  b: number
}

export interface PieceCell {
  x: number
  y: number
  color: number
  link: Link
}

export function pieceCells(p: Piece): [PieceCell, PieceCell] {
  const { x, y, a, b } = p
  switch (p.r & 3) {
    case 0:
      return [
        { x, y, color: a, link: Link.Right },
        { x: x + 1, y, color: b, link: Link.Left },
      ]
    case 1:
      return [
        { x, y, color: a, link: Link.Up },
        { x, y: y - 1, color: b, link: Link.Down },
      ]
    case 2:
      return [
        { x, y, color: b, link: Link.Right },
        { x: x + 1, y, color: a, link: Link.Left },
      ]
    default:
      return [
        { x, y, color: b, link: Link.Up },
        { x, y: y - 1, color: a, link: Link.Down },
      ]
  }
}

/** Fits inside the walls and floor and overlaps nothing. The row just above the jar counts as free, so an upright capsule can turn at the top. */
export function fits(cells: Cells, p: Piece): boolean {
  return pieceCells(p).every(
    (c) => c.x >= 0 && c.x < W && c.y >= -1 && c.y < H && (c.y < 0 || cells[idx(c.x, c.y)] === 0),
  )
}

export function tryMove(cells: Cells, p: Piece, dx: number, dy: number): Piece | null {
  const q = { ...p, x: p.x + dx, y: p.y + dy }
  return fits(cells, q) ? q : null
}

/** Turns the capsule (`dir` 1 = left, -1 = right); lying down against the right wall or a block, it nudges one cell left. */
export function tryRotate(cells: Cells, p: Piece, dir: 1 | -1): Piece | null {
  const q = { ...p, r: (p.r + dir + 4) & 3 }
  if (fits(cells, q)) return q
  if ((q.r & 1) === 0) {
    const kicked = { ...q, x: q.x - 1 }
    if (fits(cells, kicked)) return kicked
  }
  return null
}

/** Where the capsule would land if dropped straight down. */
export function landing(cells: Cells, p: Piece): Piece {
  let q = p
  for (let next = tryMove(cells, q, 0, 1); next; next = tryMove(cells, q, 0, 1)) q = next
  return q
}

/** Writes the capsule into the jar. Returns false if part of it is still above the jar (topped out). */
export function lockPiece(cells: Cells, p: Piece): boolean {
  let inside = true
  for (const c of pieceCells(p)) {
    if (c.y < 0) {
      inside = false
      continue
    }
    cells[idx(c.x, c.y)] = makeCell(c.color, false, c.link)
  }
  // A half left above the jar is lost: its partner becomes a single.
  if (!inside) for (const c of pieceCells(p)) if (c.y >= 0) cells[idx(c.x, c.y)] = makeCell(c.color)
  return inside
}

// ---------- Matches ----------

export interface Matches {
  /** Cells that pop. */
  cells: number[]
  /** Separate lines (a cross counts as two). */
  lines: number
}

/** Every horizontal and vertical run of MATCH or more same-coloured cells. */
export function findMatches(cells: Cells): Matches {
  const hit = new Set<number>()
  let lines = 0
  const scan = (start: (k: number) => number, step: number, count: number, len: number) => {
    for (let k = 0; k < count; k++) {
      let run = 0
      let color = -1
      for (let j = 0; j <= len; j++) {
        const i = start(k) + j * step
        const c = j < len && cells[i] ? colorOf(cells[i]) : -1
        if (c >= 0 && c === color) run++
        else {
          if (color >= 0 && run >= MATCH) {
            lines++
            for (let n = 1; n <= run; n++) hit.add(start(k) + (j - n) * step)
          }
          color = c
          run = c >= 0 ? 1 : 0
        }
      }
    }
  }
  scan((y) => idx(0, y), 1, H, W)
  scan((x) => idx(x, 0), W, W, H)
  return { cells: [...hit].sort((a, b) => a - b), lines }
}

/** Empties `which` and turns any surviving partners into singles. Returns the gloops removed, per colour. */
export function removeCells(cells: Cells, which: readonly number[]): number[] {
  const gloops = Array<number>(COLORS).fill(0)
  const gone = new Set(which)
  for (const i of which) {
    const v = cells[i]
    if (!v) continue
    if (isGloop(v)) gloops[colorOf(v)]++
    const p = partnerOf(i, v)
    if (p >= 0 && !gone.has(p) && cells[p]) cells[p] = withLink(cells[p], Link.None)
  }
  for (const i of which) cells[i] = 0
  return gloops
}

// ---------- Gravity ----------

/**
 * Drops every loose capsule piece one row (gloops never fall). A side-by-side
 * capsule falls only when both halves can. Returns whether anything moved.
 */
export function gravityStep(cells: Cells): boolean {
  let moved = false
  for (let y = H - 2; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y)
      const v = cells[i]
      if (!v || isGloop(v)) continue
      const below = i + W
      switch (linkOf(v)) {
        case Link.Left:
        case Link.Down:
          break // moved with its partner
        case Link.Right:
          if (!cells[below] && !cells[below + 1]) {
            cells[below] = v
            cells[below + 1] = cells[i + 1]
            cells[i] = cells[i + 1] = 0
            moved = true
          }
          break
        case Link.Up:
          if (!cells[below]) {
            cells[below] = v
            cells[i] = cells[i - W]
            cells[i - W] = 0
            moved = true
          }
          break
        default:
          if (!cells[below]) {
            cells[below] = v
            cells[i] = 0
            moved = true
          }
      }
    }
  }
  return moved
}

export const countGloops = (cells: Cells) => cells.reduce((n, v) => n + (v && isGloop(v) ? 1 : 0), 0)

/** Gloops left of each colour. */
export function gloopsByColor(cells: Cells): number[] {
  const out = Array<number>(COLORS).fill(0)
  for (const v of cells) if (v && isGloop(v)) out[colorOf(v)]++
  return out
}

/** The new capsule appears here. */
export const SPAWN_X = 3
/** Rows near the top where blocks above the spawn mean danger. */
export const DANGER_ROWS = 3

/** Blocks are piling up near where new capsules appear. */
export function inDanger(cells: Cells): boolean {
  for (let y = 0; y < DANGER_ROWS; y++)
    for (let x = SPAWN_X - 1; x <= SPAWN_X + 2; x++) if (cells[idx(x, y)]) return true
  return false
}
