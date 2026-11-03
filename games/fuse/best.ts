// Personal best scores, per board setup, kept in this browser only.
// Storage can be missing (private mode, blocked): then there is just no best.

const KEY = 'play-forge:fuse:best'

export const bestKey = (size: number, rocks: boolean) => `${size}${rocks ? 'r' : ''}`

type Store = Pick<Storage, 'getItem' | 'setItem'>

/** Even touching `localStorage` can throw (sandboxed frames); fall back to nothing. */
const NONE: Store = { getItem: () => null, setItem: () => {} }
function local(): Store {
  try {
    return globalThis.localStorage ?? NONE
  } catch {
    return NONE
  }
}

function read(store: Store): Record<string, number> {
  try {
    const data = JSON.parse(store.getItem(KEY) ?? '{}')
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

export function loadBest(key: string, store: Store = local()): number {
  const v = read(store)[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Saves `score` if it beats the stored best. Returns whether it did. */
export function saveBest(key: string, score: number, store: Store = local()): boolean {
  if (score <= loadBest(key, store)) return false
  try {
    store.setItem(KEY, JSON.stringify({ ...read(store), [key]: score }))
  } catch {
    // storage full or blocked: still a new best for this session
  }
  return true
}
