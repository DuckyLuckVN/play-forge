// Computer opponent. A classic five-cell window evaluator: every run of five
// cells through a candidate that holds only one side's stones scores for that
// side, so open lines, split lines and double threats add up on their own.
// Levels differ in how much they defend, how far they look and how often
// they slip, so Easy is beatable by anyone and Hard needs a real plan.

import { random, type RngState } from '@forge/core/rng'
import { candidates, DIRS, opponent, winningCells, type Mark, type Rule, type Side } from './rules'

export type Level = 'easy' | 'normal' | 'hard'

/** Score for completing a window to k own stones (index = stones after placing). */
const ATTACK = [0, 1, 12, 150, 2500, 1e7]
/** Score for spoiling an opponent window holding k stones. */
const DEFENSE = [0, 1, 10, 120, 1e6]

interface LevelTuning {
  /** How much blocking counts next to attacking. */
  defense: number
  /** Pick at random among moves scoring at least this share of the best. */
  slack: number
  /** Chance to overlook the opponent's winning threat (a four). */
  missBlock: number
  /** Reply search: how many top moves to check against the opponent's best answer (0 = off). */
  lookahead: number
}

export const LEVELS: Record<Level, LevelTuning> = {
  easy: { defense: 0.45, slack: 0.35, missBlock: 0.3, lookahead: 0 },
  normal: { defense: 0.9, slack: 0.85, missBlock: 0, lookahead: 0 },
  hard: { defense: 1.05, slack: 1, missBlock: 0, lookahead: 10 },
}

/** How good a move at `cell` is for `side`: its attack value plus `defense` × its block value. */
export function scoreCell(
  board: readonly Mark[],
  size: number,
  cell: number,
  side: Side,
  defense = 1,
): number {
  const foe = opponent(side)
  const x0 = cell % size
  const y0 = Math.floor(cell / size)
  let attack = 0
  let block = 0
  for (const [dx, dy] of DIRS) {
    // Windows of five containing the cell: starting 4..0 steps behind it.
    for (let start = -4; start <= 0; start++) {
      let mine = 0
      let theirs = 0
      let ok = true
      for (let k = start; k < start + 5; k++) {
        const x = x0 + dx * k
        const y = y0 + dy * k
        if (x < 0 || y < 0 || x >= size || y >= size) {
          ok = false
          break
        }
        if (k === 0) continue
        const m = board[y * size + x]
        if (m === side) mine++
        else if (m === foe) theirs++
      }
      if (!ok) continue
      if (theirs === 0) attack += ATTACK[mine + 1]
      if (mine === 0) block += DEFENSE[theirs]
    }
  }
  return attack + defense * block
}

function pick<T>(items: T[], rng: RngState): T {
  return items[Math.floor(random(rng) * items.length)]
}

/** The strongest attack `side` has on this board (used for lookahead). */
function bestAttack(board: Mark[], size: number, side: Side): number {
  let best = 0
  for (const c of candidates(board, size)) best = Math.max(best, scoreCell(board, size, c, side, 0))
  return best
}

/**
 * Choose a move for `side`. Always takes a win; blocks the opponent's win
 * (Easy sometimes misses it); otherwise plays the best-scoring cell with a
 * little level-dependent randomness. Mutates nothing (the board is restored).
 */
export function chooseMove(
  board: Mark[],
  size: number,
  side: Side,
  rule: Rule,
  level: Level,
  rng: RngState,
): number {
  const tune = LEVELS[level]
  const cells = candidates(board, size)
  if (cells.length === 1) return cells[0]

  const wins = winningCells(board, size, side, rule, cells)
  if (wins.length) return pick(wins, rng)

  const foe = opponent(side)
  const threats = winningCells(board, size, foe, rule, cells)
  // A slip: look away from the threat this turn.
  const slip = threats.length && random(rng) < tune.missBlock
  const others = slip ? cells.filter((c) => !threats.includes(c)) : []
  const pool = others.length ? others : cells
  if (threats.length && pool === cells) {
    // Several threats can't all be blocked; take the block that also attacks best.
    return best(
      threats.map((c) => ({ c, s: scoreCell(board, size, c, side, tune.defense) })),
      1,
      rng,
    )
  }

  const scored = pool.map((c) => ({ c, s: scoreCell(board, size, c, side, tune.defense) }))
  if (tune.lookahead > 0) {
    scored.sort((a, b) => b.s - a.s)
    const top = scored.slice(0, tune.lookahead)
    for (const m of top) {
      board[m.c] = side
      // A move that leaves the opponent a strong attack is worth less.
      m.s -= 0.7 * bestAttack(board, size, foe)
      board[m.c] = 0
    }
    return best(top, tune.slack, rng)
  }
  return best(scored, tune.slack, rng)
}

/** A random cell among those scoring within `slack` of the best (slack 1 = only the best). */
function best(values: { c: number; s: number }[], slack: number, rng: RngState): number {
  const top = Math.max(...values.map((v) => v.s))
  // Scores can be negative after lookahead; compare against a shifted floor.
  const floor = top >= 0 ? top * slack : top / Math.max(slack, 1e-6)
  const pool = values.filter((v) => v.s >= floor - 1e-9).map((v) => v.c)
  return pick(pool, rng)
}
