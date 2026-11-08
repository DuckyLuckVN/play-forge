// Skill orbs: one per level-up, on a random free cell. Until a ball collects it
// (banking the skill point), an orb jumps to a new random cell every turn.
import { freeCells, pickCells } from './boss-kit'
import { dims } from './dims'
import { cellCenter } from './rows'
import type { RunState } from './types'

/**
 * Each turn's start: uncollected orbs jump, and orbs due from level-ups appear,
 * each on a random free cell above the last row before the danger line.
 * With no room, an orb waits (back in `orbsDue`) for a later turn.
 */
export function scatterOrbs(s: RunState): void {
  const orbs = s.pickups.filter((p) => p.kind === 'skill')
  s.pickups = s.pickups.filter((p) => p.kind !== 'skill')
  const taken = new Set(s.pickups.map((p) => `${p.col},${p.row}`))
  const last = dims(s).dangerRow - 1
  const cells = freeCells(s, (col, row) => row < last && !taken.has(`${col},${row}`))
  const due = s.orbsDue ?? 0
  const spots = pickCells(s, cells, orbs.length + due)
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
