// Note chains: a path of notes to step through in order. Only the next note of
// a chain can be taken; each one plays a higher note, so a chain is a melody.

import { randomInt, type RngState } from '@forge/core/rng'
import { allTiles, neighbours } from './grid'

export interface Note {
  id: number
  tile: number
  chain: number
  /** Order in the chain, 0-based, and the chain's length. */
  index: number
  length: number
  /** Beat it vanishes on. */
  until: number
}

/**
 * A random walk of up to `length` distinct, unblocked, adjacent tiles.
 * May come back shorter when it gets boxed in; null when there is no start.
 */
export function chainPath(rng: RngState, n: number, length: number, blocked: Set<number>): number[] | null {
  const free = allTiles(n).filter((t) => !blocked.has(t))
  if (!free.length) return null
  let best: number[] = []
  for (let attempt = 0; attempt < 6 && best.length < length; attempt++) {
    const path = [free[randomInt(rng, free.length)]]
    while (path.length < length) {
      const next = neighbours(path.at(-1)!, n).filter((t) => !blocked.has(t) && !path.includes(t))
      if (!next.length) break
      path.push(next[randomInt(rng, next.length)])
    }
    if (path.length > best.length) best = path
  }
  return best
}

/** The note that can be taken next in its chain (lowest index left). */
export function isNext(note: Note, notes: readonly Note[]): boolean {
  return !notes.some((o) => o.chain === note.chain && o.index < note.index)
}
