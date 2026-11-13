// The computer rival: tries every place a capsule can reach and scores the jar it would leave.
import { random, type RngState } from '@forge/core/rng'
import {
  colorOf,
  findMatches,
  fits,
  gravityStep,
  H,
  idx,
  isGloop,
  lockPiece,
  pieceCells,
  removeCells,
  tryMove,
  tryRotate,
  W,
  type Cells,
  type Piece,
} from './grid'
import { runAt } from './level'

export interface Plan {
  x: number
  r: number
}

export type AiLevel = 'easy' | 'normal' | 'hard'
export const AI_LEVELS: readonly AiLevel[] = ['easy', 'normal', 'hard']

/** Ticks between the computer's button presses, and how often it settles for a worse spot. */
export const AI_TUNING: Record<AiLevel, { delay: number; sloppy: number; lookahead: boolean }> = {
  easy: { delay: 9, sloppy: 0.45, lookahead: false },
  normal: { delay: 5, sloppy: 0.15, lookahead: true },
  hard: { delay: 3, sloppy: 0, lookahead: true },
}

/** Where `p` ends up if turned to `r`, slid to column `x` along its row, then dropped; null if blocked. */
export function reach(cells: Cells, p: Piece, plan: Plan): Piece | null {
  let q: Piece | null = p
  for (let turns = 0; q && q.r !== plan.r && turns < 4; turns++) q = tryRotate(cells, q, 1)
  if (!q || q.r !== plan.r) return null
  while (q && q.x !== plan.x) q = tryMove(cells, q, Math.sign(plan.x - q.x), 0)
  if (!q) return null
  while (fits(cells, { ...q, y: q.y + 1 })) q = { ...q, y: q.y + 1 }
  return q
}

/** Weights for the computer's judgement (tuned with balance.test.ts). */
const WEIGHT = {
  gloop: 1000,
  cell: 40,
  chain: 300,
  /** Per row lower in the jar. */
  low: 3,
  /** A half over the spawn: about to top out. */
  spawn: 400,
  /** Each empty cell left under a half. */
  hole: 45,
  /** Same-coloured line of 2 / 3 through a half (more when it holds a gloop). */
  run: [0, 0, 40, 110],
  /** A different colour right on top of a gloop / a half. */
  buryGloop: 70,
  buryPill: 20,
}

/** How good the jar is after locking `q` (higher is better). */
export const scorePlacement = (cells: Cells, q: Piece): number => evaluate(cells, q).score

/** Scores locking `q`, and returns the jar after its pops settle. */
function evaluate(cells: Cells, q: Piece): { score: number; jar: Cells } {
  const jar = cells.slice()
  if (!lockPiece(jar, q)) return { score: -1e9, jar }
  let score = 0
  let chain = 0
  for (let m = findMatches(jar); m.cells.length; m = findMatches(jar)) {
    chain++
    const gloops = removeCells(jar, m.cells).reduce((a, b) => a + b, 0)
    score += gloops * WEIGHT.gloop + m.cells.length * WEIGHT.cell
    while (gravityStep(jar));
  }
  if (chain > 1) score += chain * WEIGHT.chain
  for (const c of pieceCells(q)) {
    score += c.y * WEIGHT.low
    if (c.y < 3 && c.x >= 2 && c.x <= 5) score -= WEIGHT.spawn
    const v = jar[idx(c.x, c.y)]
    if (!v) continue // popped
    const color = colorOf(v)
    for (let y = c.y + 1; y < H && !jar[idx(c.x, y)]; y++) score -= WEIGHT.hole
    const run = Math.min(3, runAt(jar, c.x, c.y, color))
    score += WEIGHT.run[run] * (touchesGloop(jar, c.x, c.y, color) ? 1.5 : 1)
    const below = c.y + 1 < H ? jar[idx(c.x, c.y + 1)] : 0
    if (below && colorOf(below) !== color) score -= isGloop(below) ? WEIGHT.buryGloop : WEIGHT.buryPill
  }
  return { score, jar }
}

/** A same-coloured gloop sits right next to (x, y). */
function touchesGloop(jar: Cells, x: number, y: number, color: number): boolean {
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
    const n = jar[idx(nx, ny)]
    if (n && isGloop(n) && colorOf(n) === color) return true
  }
  return false
}

/** How much the best spot for the next capsule counts toward this one. */
const LOOKAHEAD = 0.6

/** Every reachable spot for `p`, best first; with `next`, also counts the best follow-up for it. */
export function rankPlans(cells: Cells, p: Piece, next?: [number, number]): { plan: Plan; score: number }[] {
  const out: { plan: Plan; score: number }[] = []
  for (const plan of plansFor(cells, p)) {
    const { score, jar } = evaluate(cells, plan.q)
    let follow = 0
    if (next && score > -1e8) {
      const p2: Piece = { x: p.x, y: 0, r: 0, a: next[0], b: next[1] }
      follow = -1e9
      for (const second of plansFor(jar, p2)) follow = Math.max(follow, evaluate(jar, second.q).score)
    }
    out.push({ plan: { x: plan.x, r: plan.r }, score: score + LOOKAHEAD * follow })
  }
  return out.sort((a, b) => b.score - a.score)
}

function plansFor(cells: Cells, p: Piece): (Plan & { q: Piece })[] {
  const out: (Plan & { q: Piece })[] = []
  // Turning twice gives the same shape with the colours swapped; skip it when both halves match.
  const poses = p.a === p.b ? 2 : 4
  for (let r = 0; r < poses; r++)
    for (let x = 0; x < W; x++) {
      const q = reach(cells, p, { x, r })
      if (q) out.push({ x, r, q })
    }
  return out
}

/** The computer's pick: usually the best spot, sometimes (easier levels) one of the next few. */
export function choosePlan(
  cells: Cells,
  p: Piece,
  level: AiLevel,
  rng: RngState,
  next?: [number, number],
): Plan | null {
  const ranked = rankPlans(cells, p, AI_TUNING[level].lookahead ? next : undefined)
  if (!ranked.length) return null
  if (random(rng) < AI_TUNING[level].sloppy) {
    const k = Math.min(ranked.length - 1, 1 + Math.floor(random(rng) * 4))
    return ranked[k].plan
  }
  return ranked[0].plan
}
