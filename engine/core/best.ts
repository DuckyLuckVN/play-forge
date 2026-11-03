// Personal best scores per game (and optional setup key), kept in this browser
// only. Storage can be missing (private mode, blocked): then there is no best.

type Store = Pick<Storage, 'getItem' | 'setItem'>

const NONE: Store = { getItem: () => null, setItem: () => {} }
/** Even touching `localStorage` can throw (sandboxed frames). */
function local(): Store {
  try {
    return globalThis.localStorage ?? NONE
  } catch {
    return NONE
  }
}

export interface BestScores {
  load(key?: string): number
  /** Saves `score` if it beats the stored best. Returns whether it did. */
  save(score: number, key?: string): boolean
}

export function bestScores(gameId: string, store: Store = local()): BestScores {
  const storageKey = `play-forge:${gameId}:best`
  const read = (): Record<string, unknown> => {
    try {
      const data = JSON.parse(store.getItem(storageKey) ?? '{}')
      return data && typeof data === 'object' ? data : {}
    } catch {
      return {}
    }
  }
  const load = (key = 'default') => {
    const v = read()[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  return {
    load,
    save(score, key = 'default') {
      if (score <= load(key)) return false
      try {
        store.setItem(storageKey, JSON.stringify({ ...read(), [key]: score }))
      } catch {
        // storage full or blocked: still a new best for this session
      }
      return true
    },
  }
}
