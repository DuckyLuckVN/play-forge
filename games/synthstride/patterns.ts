// Hazards: what a strike covers, when it lands, and the fairness check that
// every new pattern must pass before it is warned.

import { random, randomInt, type RngState } from '@forge/core/rng'
import { allTiles, colOf, neighbours, rowOf, tileAt } from './grid'

export type StrikeKind = 'tiles' | 'row' | 'col' | 'cross' | 'checker' | 'bomb' | 'sweep' | 'hole'

export interface Strike {
  id: number
  kind: StrikeKind
  tiles: number[]
  /** Beat it was warned on. */
  warnBeat: number
  /** Beat it lands on; x.5 lands halfway between beats (off-beat). */
  beat: number
  /** Extra beats it stays (holes block their tiles for a bar). */
  hold: number
  /** Strikes of one sweep share a group (drawn as one moving laser). */
  group?: number
  /** Tick it landed. */
  firedAt?: number
  /** Dancers who stood in it during the warning (escaping counts as a dodge). */
  threatened?: string[]
  /** Dancers it has been settled for (hit or not). */
  settled?: string[]
}

export type StrikePlan = Omit<Strike, 'id'>

export const isOffBeat = (st: Pick<Strike, 'beat'>) => st.beat % 1 !== 0

/** Whole beats a strike makes unsafe to stand on (off-beats count on both sides). */
export function dangerBeats(st: Pick<Strike, 'beat' | 'hold'>): number[] {
  const out: number[] = []
  for (let b = Math.floor(st.beat); b <= Math.ceil(st.beat) + st.hold; b++) out.push(b)
  return out
}

/** Unsafe tiles per whole beat. */
export function dangerByBeat(strikes: readonly StrikePlan[]): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>()
  for (const st of strikes)
    for (const b of dangerBeats(st)) {
      const set = map.get(b) ?? new Set<number>()
      for (const t of st.tiles) set.add(t)
      map.set(b, set)
    }
  return map
}

/**
 * Can someone on `from` survive every strike, moving at most one tile per
 * beat? (Real players can do more: this is the conservative bound.)
 * `moved`: they already used this beat's step to get to `from`.
 */
export function survivable(
  from: number,
  nowBeat: number,
  strikes: readonly StrikePlan[],
  n: number,
  moved = false,
): boolean {
  const danger = dangerByBeat(strikes)
  const last = Math.max(nowBeat, ...danger.keys())
  let reach = new Set([from])
  for (let b = nowBeat + 1; b <= last; b++) {
    const stay = b === nowBeat + 1 && moved
    const next = new Set<number>()
    for (const t of reach) for (const nb of stay ? [t] : neighbours(t, n)) next.add(nb)
    const bad = danger.get(b)
    if (bad) for (const t of bad) next.delete(t)
    if (next.size === 0) return false
    reach = next
  }
  return true
}

const line = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i))

/** Tiles of one pattern on an n × n board. */
export function patternTiles(kind: Exclude<StrikeKind, 'sweep'>, rng: RngState, n: number): number[] {
  switch (kind) {
    case 'row': {
      const r = randomInt(rng, n)
      return line(n, (c) => tileAt(c, r, n))
    }
    case 'col': {
      const c = randomInt(rng, n)
      return line(n, (r) => tileAt(c, r, n))
    }
    case 'cross': {
      const c = randomInt(rng, n)
      const r = randomInt(rng, n)
      return [...new Set([...line(n, (i) => tileAt(i, r, n)), ...line(n, (i) => tileAt(c, i, n))])]
    }
    case 'checker': {
      const parity = randomInt(rng, 2)
      return allTiles(n).filter((t) => (colOf(t, n) + rowOf(t, n)) % 2 === parity)
    }
    case 'bomb':
      return neighbours(randomInt(rng, n * n), n)
    case 'hole': {
      const set = new Set<number>()
      const count = 1 + randomInt(rng, 2)
      while (set.size < count) set.add(randomInt(rng, n * n))
      return [...set]
    }
    case 'tiles': {
      const set = new Set<number>()
      const count = 1 + randomInt(rng, n >= 5 ? 4 : 3)
      while (set.size < count) set.add(randomInt(rng, n * n))
      return [...set]
    }
  }
}

/** Which pattern, from an effective difficulty level (tier, plus more during drops). */
export function pickKind(level: number, rng: RngState): StrikeKind {
  const options: [StrikeKind, number][] = [['tiles', 3]]
  if (level >= 1) options.push(['row', 1.5], ['col', 1.5])
  if (level >= 2) options.push(['bomb', 1.5])
  if (level >= 3) options.push(['cross', 1], ['sweep', 0.8])
  if (level >= 5) options.push(['checker', 0.6], ['hole', 1])
  const total = options.reduce((a, [, w]) => a + w, 0)
  let r = random(rng) * total
  for (const [k, w] of options) if ((r -= w) < 0) return k
  return 'tiles'
}

/**
 * The strikes for one pattern landing on `beat`: one strike, or one per line
 * for a sweep (a laser walking across the board, a beat per row/column).
 */
export function makePattern(
  kind: StrikeKind,
  rng: RngState,
  n: number,
  warnBeat: number,
  beat: number,
  offBeat: boolean,
): StrikePlan[] {
  if (kind === 'sweep') {
    const rows = random(rng) < 0.5
    const forward = random(rng) < 0.5
    return line(n, (i) => {
      const k = forward ? i : n - 1 - i
      return {
        kind,
        tiles: line(n, (j) => (rows ? tileAt(j, k, n) : tileAt(k, j, n))),
        warnBeat,
        beat: beat + i,
        hold: 0,
      }
    })
  }
  const small = kind === 'tiles' || kind === 'bomb'
  return [
    {
      kind,
      tiles: patternTiles(kind, rng, n),
      warnBeat,
      beat: offBeat && small ? beat + 0.5 : beat,
      hold: kind === 'hole' ? 3 : 0,
    },
  ]
}
