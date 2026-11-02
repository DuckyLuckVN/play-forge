// Pure board rules for Caro (five in a row). Boards are flat arrays indexed
// `y * size + x`; 0 is empty, 1 is X, 2 is O.

export type Mark = 0 | 1 | 2
export type Side = 1 | 2
/** 'free': five or more wins. 'blocked': a five closed by the opponent at both ends does not. */
export type Rule = 'free' | 'blocked'

/** The four line directions: →, ↓, ↘, ↗. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]

export const opponent = (m: Side): Side => (m === 1 ? 2 : 1)

export const emptyBoard = (size: number): Mark[] => Array<Mark>(size * size).fill(0)

export const isFull = (board: readonly Mark[]) => board.every((m) => m !== 0)

const inside = (size: number, x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size

/** The unbroken run of `cell`'s mark through `cell` along (dx, dy), in board order. */
function run(board: readonly Mark[], size: number, cell: number, dx: number, dy: number): number[] {
  const mark = board[cell]
  const x0 = cell % size
  const y0 = Math.floor(cell / size)
  const line = [cell]
  for (const s of [-1, 1]) {
    let x = x0 + dx * s
    let y = y0 + dy * s
    while (inside(size, x, y) && board[y * size + x] === mark) {
      if (s < 0) line.unshift(y * size + x)
      else line.push(y * size + x)
      x += dx * s
      y += dy * s
    }
  }
  return line
}

/** Whether the cell just past the run's end, in direction s, holds the opponent's stone. */
function blockedEnd(board: readonly Mark[], size: number, end: number, dx: number, dy: number, s: number) {
  const x = (end % size) + dx * s
  const y = Math.floor(end / size) + dy * s
  return inside(size, x, y) && board[y * size + x] !== 0 && board[y * size + x] !== board[end]
}

/** The winning line through `cell` (the stone just played), or null. */
export function findWin(board: readonly Mark[], size: number, cell: number, rule: Rule): number[] | null {
  if (!board[cell]) return null
  for (const [dx, dy] of DIRS) {
    const line = run(board, size, cell, dx, dy)
    if (line.length < 5) continue
    if (
      rule === 'blocked' &&
      blockedEnd(board, size, line[0], dx, dy, -1) &&
      blockedEnd(board, size, line.at(-1)!, dx, dy, 1)
    )
      continue
    return line
  }
  return null
}

/** Empty cells where `side` would win right now. */
export function winningCells(
  board: Mark[],
  size: number,
  side: Side,
  rule: Rule,
  among?: number[],
): number[] {
  const out: number[] = []
  for (const c of among ?? candidates(board, size)) {
    if (board[c]) continue
    board[c] = side
    if (findWin(board, size, c, rule)) out.push(c)
    board[c] = 0
  }
  return out
}

/** Whether the stone at `cell` leaves its side one move away from winning (a "four"). */
export function makesFour(board: Mark[], size: number, cell: number, rule: Rule): boolean {
  const side = board[cell] as Side
  if (!side) return false
  const x0 = cell % size
  const y0 = Math.floor(cell / size)
  // Only empty cells within four of the stone, on its lines, can complete a five through it.
  const near: number[] = []
  for (const [dx, dy] of DIRS)
    for (let k = -4; k <= 4; k++) {
      const x = x0 + dx * k
      const y = y0 + dy * k
      if (k !== 0 && inside(size, x, y) && board[y * size + x] === 0) near.push(y * size + x)
    }
  return winningCells(board, size, side, rule, near).length > 0
}

/**
 * Cells worth considering for the next move: empty cells within two of any
 * stone (the centre on an empty board).
 */
export function candidates(board: readonly Mark[], size: number): number[] {
  const out: number[] = []
  let any = false
  for (let c = 0; c < board.length; c++) {
    if (board[c]) {
      any = true
      continue
    }
    const x = c % size
    const y = Math.floor(c / size)
    near: for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        if (inside(size, x + dx, y + dy) && board[(y + dy) * size + x + dx]) {
          out.push(c)
          break near
        }
      }
  }
  if (!any) return [Math.floor(size / 2) * size + Math.floor(size / 2)]
  return out
}
