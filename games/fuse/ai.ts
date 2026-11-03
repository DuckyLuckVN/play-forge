import { random, type RngState } from '@forge/core/rng'
import { bestTier, DIRS, emptyCells, neighbours, ROCK, slide, valueOf, type Cells, type Dir } from './board'

/** Pairs of equal tiles side by side: merges waiting to happen. */
function pairs(cells: Cells, size: number): number {
  let n = 0
  cells.forEach((c, i) => {
    if (!c || c.v === ROCK) return
    if (i % size < size - 1 && cells[i + 1]?.v === c.v) n++
    if (i + size < cells.length && cells[i + size]?.v === c.v) n++
  })
  return n
}

/** Big tiles near a corner keep the board tidy. */
function cornerBonus(cells: Cells, size: number): number {
  const top = bestTier(cells)
  const corners = [0, size - 1, size * (size - 1), size * size - 1]
  return corners.some((c) => cells[c]?.v === top) ? top * 6 : 0
}

/** Scores a position for whoever must move next on it. */
export function evaluate(cells: Cells, size: number): number {
  return emptyCells(cells).length * 14 + pairs(cells, size) * 6 + cornerBonus(cells, size)
}

/**
 * One-step greedy look: the direction with the best points plus position.
 * `wobble` (0..1) adds noise so a rival doesn't play like a machine. Returns null when stuck.
 */
export function chooseDir(cells: Cells, size: number, rng: RngState, wobble = 0.15): Dir | null {
  let best: Dir | null = null
  let bestScore = -Infinity
  let id = 0
  for (const d of DIRS) {
    const r = slide(cells, size, d, () => --id)
    if (!r.moved) continue
    const gained = r.merges.reduce((s, m) => s + valueOf(m.tier), 0)
    const score = Math.log2(1 + gained) * 10 + evaluate(r.cells, size) + random(rng) * 40 * wobble
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

/** What to blast when stuck: a rock if any (most crowded first), else the smallest tile. */
export function blastTarget(cells: Cells, size: number): number {
  let best = -1
  let bestScore = -Infinity
  cells.forEach((c, i) => {
    if (!c) return
    const crowd = neighbours(i, size).filter((n) => cells[n]).length
    const score = c.v === ROCK ? 100 + crowd : 50 - c.v * 3 + crowd
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}
