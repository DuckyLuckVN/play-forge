// Tile maths for an n × n board. A tile is an index: row * n + col.

export const tileAt = (col: number, row: number, n: number) => row * n + col
export const colOf = (t: number, n: number) => t % n
export const rowOf = (t: number, n: number) => Math.floor(t / n)
export const allTiles = (n: number) => Array.from({ length: n * n }, (_, t) => t)

/** Tiles reachable in one step, including staying put. */
export function neighbours(t: number, n: number): number[] {
  const c = colOf(t, n)
  const r = rowOf(t, n)
  const out = [t]
  if (c > 0) out.push(t - 1)
  if (c < n - 1) out.push(t + 1)
  if (r > 0) out.push(t - n)
  if (r < n - 1) out.push(t + n)
  return out
}

/** The same (col, row) on a board of another size. */
export const remap = (t: number, from: number, to: number) => tileAt(colOf(t, from), rowOf(t, from), to)

export type Step = 'up' | 'down' | 'left' | 'right'

/** The tile one step away, or `t` itself at the edge. */
export function stepFrom(t: number, dir: Step, n: number): number {
  const c = colOf(t, n)
  const r = rowOf(t, n)
  if (dir === 'left') return c > 0 ? t - 1 : t
  if (dir === 'right') return c < n - 1 ? t + 1 : t
  if (dir === 'up') return r > 0 ? t - n : t
  return r < n - 1 ? t + n : t
}

/** One step from `from` toward `to` (the longer axis first), or null if they match. */
export function stepToward(from: number, to: number, n: number): Step | null {
  const dc = colOf(to, n) - colOf(from, n)
  const dr = rowOf(to, n) - rowOf(from, n)
  if (dc === 0 && dr === 0) return null
  if (Math.abs(dc) >= Math.abs(dr)) return dc > 0 ? 'right' : 'left'
  return dr > 0 ? 'down' : 'up'
}
