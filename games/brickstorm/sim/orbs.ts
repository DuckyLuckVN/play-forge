// Skill orbs: one per level-up, on a random free cell. Until a ball collects it
// (banking the skill point), an orb jumps to a new random cell every turn.
import { freeCells, pickCells } from './boss-kit'
import { dims } from './dims'
import { cellCenter } from './rows'
import type { RunState } from './types'

/**
 * Each turn's start: uncollected orbs jump, and orbs due from level-ups appear,
 * each on a random free cell above the last row before the danger line, among
 * the bricks where possible (see pickNearBricks).
 * With no room, an orb waits (back in `orbsDue`) for a later turn.
 */
export function scatterOrbs(s: RunState): void {
  const orbs = s.pickups.filter((p) => p.kind === 'skill')
  s.pickups = s.pickups.filter((p) => p.kind !== 'skill')
  const taken = new Set(s.pickups.map((p) => `${p.col},${p.row}`))
  const last = dims(s).dangerRow - 1
  const cells = freeCells(s, (col, row) => row < last && !taken.has(`${col},${row}`))
  const due = s.orbsDue ?? 0
  const spots = pickNearBricks(s, cells, orbs.length + due)
  s.orbsDue = Math.max(0, orbs.length + due - spots.length)
  spots.forEach(([col, row], i) => {
    const orb = orbs[i] ?? { id: s.nextId++, col, row, kind: 'skill' as const }
    const from = orbs[i] ? cellCenter(orb.col, orb.row) : null
    orb.col = col
    orb.row = row
    s.pickups.push(orb)
    s.events.push({ type: 'orbHop', ...cellCenter(col, row), from })
  })
}

/**
 * Up to `n` random cells, best first: cells touching a brick (diagonals too), then
 * cells within the rows the bricks span, then any. So orbs sit in the action, not open space.
 */
function pickNearBricks(s: RunState, cells: Array<[number, number]>, n: number): Array<[number, number]> {
  const touches = ([col, row]: [number, number]) =>
    s.bricks.some((b) => Math.max(Math.abs(b.col - col), Math.abs(b.row - row)) === 1)
  const rows = s.bricks.map((b) => b.row)
  const top = Math.min(...rows)
  const bottom = Math.max(...rows)
  const near = cells.filter(touches)
  const zone = cells.filter((c) => !touches(c) && c[1] >= top && c[1] <= bottom)
  const rest = cells.filter((c) => !touches(c) && !(c[1] >= top && c[1] <= bottom))
  const out: Array<[number, number]> = []
  for (const tier of [near, zone, rest]) out.push(...pickCells(s, tier, n - out.length))
  return out
}
