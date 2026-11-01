// Row layouts. Every PATTERN_BLOCK turns the rows switch to a pattern, and as
// rows stack downward the pattern builds a shape: lanes, diagonals, a V, a
// funnel. A pattern only orders the columns; spawnRow still decides how many
// bricks a row gets (and leaves a column for the ball).

export type Pattern = 'scatter' | 'pillars' | 'stairs' | 'vee' | 'walls' | 'core'

const SHAPED: Pattern[] = ['scatter', 'pillars', 'stairs', 'vee', 'walls', 'core']
/** Turns each pattern holds for. */
export const PATTERN_BLOCK = 4
/** Plain scattered rows until this turn, while the player learns. */
const SHAPES_FROM = 9

/** A small integer hash, so patterns follow the run's seed without using its rng. */
function hash(a: number, b: number): number {
  let x = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b, 0xc2b2ae35)) >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d) >>> 0
  x ^= x >>> 15
  return x >>> 0
}

/** The pattern for a turn of the run with this seed. */
export function patternAt(seed: number, turn: number): Pattern {
  if (turn < SHAPES_FROM) return 'scatter'
  return SHAPED[hash(seed, Math.floor(turn / PATTERN_BLOCK)) % SHAPED.length]
}

/** Most bricks a row may have under a pattern, so its gaps (and the shape) show. */
export function patternLimit(p: Pattern, cols: number): number {
  switch (p) {
    case 'scatter':
      return cols - 1
    case 'pillars':
      return Math.ceil(cols / 2)
    case 'stairs':
      return Math.ceil(cols / 2) - 1
    case 'vee':
      return 2
    case 'walls':
      return cols - 3
    case 'core':
      return Math.floor(cols / 2)
  }
}

/** Columns in the order they get bricks; every column appears once. `rand` gives 0..1. */
export function columnOrder(p: Pattern, cols: number, turn: number, rand: () => number): number[] {
  const all = [...Array(cols).keys()]
  const shuffle = (xs: number[]) => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[xs[i], xs[j]] = [xs[j], xs[i]]
    }
    return xs
  }
  const mid = (cols - 1) / 2
  const byDistance = (from: number) =>
    [...all].sort((a, b) => Math.abs(a - from) - Math.abs(b - from) || a - b)
  switch (p) {
    case 'scatter':
      return shuffle(all)
    case 'pillars': {
      // Same lanes every row: bricks on one parity, gaps on the other.
      const lane = Math.floor(turn / PATTERN_BLOCK) % 2
      return [...shuffle(all.filter((c) => c % 2 === lane)), ...shuffle(all.filter((c) => c % 2 !== lane))]
    }
    case 'stairs': {
      // The first brick steps one column per row: a diagonal down the board.
      const start = ((turn % cols) + cols) % cols
      return all.map((i) => (start + i) % cols)
    }
    case 'vee': {
      // Two bricks moving apart from the middle, row by row: a V.
      const d = turn % Math.ceil(cols / 2)
      const left = Math.floor(mid - d + 0.5 * ((cols + 1) % 2))
      const right = cols - 1 - left
      return [...new Set([left, right, ...byDistance(left), ...byDistance(right)])].filter(
        (c) => c >= 0 && c < cols,
      )
    }
    case 'walls':
      // Edges first: a funnel down the middle.
      return [...all].sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid) || a - b)
    case 'core':
      // Middle first: open lanes down both sides for bank shots.
      return byDistance(mid)
  }
}
