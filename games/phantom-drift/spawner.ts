// Row patterns: what comes down the rift next. Pure and seeded.
// Fairness rule: every row leaves at least one lane free.

import { random, randomInt, type RngState } from '@forge/core/rng'

export type RowKind = 'wisps' | 'shard' | 'pair' | 'wall' | 'drop' | 'sweep'

export type HazardPlan =
  | { kind: 'shard'; lane: number }
  | { kind: 'wall'; gap: number }
  /** Slides from `from` to `to`, arriving at the player row on `to`. */
  | { kind: 'sweeper'; from: number; to: number }

export interface RowPlan {
  kind: RowKind
  hazards: HazardPlan[]
  wisps: number[]
  /** Fallers to drop on the player when this (empty) slot arrives. */
  drop?: number
  /** A heart pickup's lane (see {@link placeHeart}). */
  heart?: number
}

/**
 * Maybe put a heart pickup on `row`: a free lane (never a hazard lane), not
 * on a wisp, and never in `avoid` (where the player is or is heading), so
 * grabbing it always takes a lane change. Never on faller rows. Rolls the
 * rng once, plus once more on success. Returns the lane, or undefined.
 */
export function placeHeart(
  rng: RngState,
  row: RowPlan,
  lanes: number,
  avoid: readonly number[],
  chance: number,
): number | undefined {
  if (random(rng) >= chance || row.drop) return undefined
  const options = freeLanes(row, lanes).filter((l) => !avoid.includes(l) && !row.wisps.includes(l))
  if (!options.length) return undefined
  return (row.heart = options[randomInt(rng, options.length)])
}

/** Pattern weights by tier; 0 = locked. */
function weights(tier: number): Record<RowKind, number> {
  return {
    wisps: 3,
    shard: 4,
    pair: tier >= 1 ? 3 : 0,
    drop: tier >= 1 ? 1.5 : 0,
    wall: tier >= 2 ? 1.5 + tier * 0.2 : 0,
    sweep: tier >= 4 ? 2 : 0,
  }
}

function pickKind(rng: RngState, tier: number): RowKind {
  const w = Object.entries(weights(tier)) as [RowKind, number][]
  let roll = random(rng) * w.reduce((sum, [, v]) => sum + v, 0)
  for (const [kind, v] of w) if ((roll -= v) < 0) return kind
  return 'shard'
}

/** Lanes a row's hazards can touch at the player row. */
export function blockedLanes(row: RowPlan): number[] {
  const out = new Set<number>()
  for (const h of row.hazards) {
    if (h.kind === 'shard') out.add(h.lane)
    else if (h.kind === 'sweeper')
      for (let l = Math.min(h.from, h.to); l <= Math.max(h.from, h.to); l++) out.add(l)
  }
  return [...out]
}

export function freeLanes(row: RowPlan, lanes: number): number[] {
  const wall = row.hazards.find((h) => h.kind === 'wall')
  if (wall) return [wall.gap]
  const blocked = new Set(blockedLanes(row))
  return Array.from({ length: lanes }, (_, l) => l).filter((l) => !blocked.has(l))
}

/** Two distinct lanes. */
function twoLanes(rng: RngState, lanes: number): [number, number] {
  const a = randomInt(rng, lanes)
  const b = (a + 1 + randomInt(rng, lanes - 1)) % lanes
  return [a, b]
}

export function pickRow(rng: RngState, tier: number, lanes: number): RowPlan {
  const kind = pickKind(rng, tier)
  const row: RowPlan = { kind, hazards: [], wisps: [] }
  switch (kind) {
    case 'wisps': {
      row.wisps.push(randomInt(rng, lanes))
      if (random(rng) < 0.5) {
        const [, b] = twoLanes(rng, lanes)
        if (b !== row.wisps[0]) row.wisps.push(b)
      }
      return row
    }
    case 'drop':
      row.drop = tier >= 6 ? 2 : 1
      return row
    case 'shard':
      row.hazards.push({ kind: 'shard', lane: randomInt(rng, lanes) })
      break
    case 'pair': {
      const [a, b] = twoLanes(rng, lanes)
      row.hazards.push({ kind: 'shard', lane: a }, { kind: 'shard', lane: b })
      break
    }
    case 'wall':
      row.hazards.push({ kind: 'wall', gap: randomInt(rng, lanes) })
      break
    case 'sweep': {
      // Spans 2 lanes on narrow rifts, up to 3 on wide ones, never all.
      const span = 1 + randomInt(rng, Math.min(2, lanes - 2))
      const lo = randomInt(rng, lanes - span)
      const [from, to] = random(rng) < 0.5 ? [lo, lo + span] : [lo + span, lo]
      row.hazards.push({ kind: 'sweeper', from, to })
      break
    }
  }
  // A wisp in a free lane, often right next to danger (risk → near miss).
  const free = freeLanes(row, lanes)
  if (random(rng) < 0.45) row.wisps.push(free[randomInt(rng, free.length)])
  return row
}
