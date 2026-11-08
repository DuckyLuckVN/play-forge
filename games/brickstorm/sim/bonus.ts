// The boss bonus round's board: a socket mid-board guarded by a few ghost
// blocks. Hitting the socket wins a skill slot (see run.ts for the round's flow).
import { randomInt } from '@forge/core/rng'
import { levelPower, runMods } from './boosts'
import { dims } from './dims'
import type { RunState } from './types'

/** Real seconds the player has to hit the socket (aiming counts). */
export const BONUS_TIME = 10
/** Ghost blocks around the socket: at least this many, up to 2 more. */
const GHOSTS_MIN = 4
const GHOSTS_EXTRA = 2
/** A ghost's hp, in the hero's per-ball damage × balls: a volley breaks a few. */
const GHOST_HP = 0.5

/**
 * Places the socket in the free cell nearest the middle of the board and 4-6
 * ghosts on the free cells around it. False (nothing placed) if the board has no free cell.
 */
export function placeBonus(s: RunState): boolean {
  const line = dims(s).dangerRow
  const taken = new Set([...s.bricks, ...s.pickups].map((c) => `${c.col},${c.row}`))
  const free = (col: number, row: number) =>
    col >= 0 && col < s.cols && row >= 0 && row < line && !taken.has(`${col},${row}`)
  const mid = { col: (s.cols - 1) / 2, row: Math.floor((line - 1) / 2) }
  const cells: Array<{ col: number; row: number }> = []
  for (let row = 0; row < line; row++)
    for (let col = 0; col < s.cols; col++) if (free(col, row)) cells.push({ col, row })
  if (!cells.length) return false
  const dist = (c: { col: number; row: number }) => Math.hypot(c.col - mid.col, c.row - mid.row)
  const at = cells.reduce((a, b) => (dist(b) < dist(a) ? b : a))
  s.pickups.push({ id: s.nextId++, ...at, kind: 'socket' })
  taken.add(`${at.col},${at.row}`)
  const around: Array<{ col: number; row: number }> = []
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      if (free(at.col + dc, at.row + dr)) around.push({ col: at.col + dc, row: at.row + dr })
  const mods = runMods(s)
  const hp = Math.max(1, Math.ceil(GHOST_HP * s.ballCount * mods.damageMult * levelPower(s.level)))
  const count = Math.min(around.length, GHOSTS_MIN + randomInt(s.rng, GHOSTS_EXTRA + 1))
  for (let i = 0; i < count; i++) {
    const cell = around.splice(randomInt(s.rng, around.length), 1)[0]
    s.bricks.push({ id: s.nextId++, ...cell, hp, maxHp: hp, kind: 'normal', split: false, ghost: true })
  }
  return true
}

/** The round is over: its ghosts and socket go. */
export function clearBonus(s: RunState): void {
  s.bricks = s.bricks.filter((b) => !b.ghost)
  s.pickups = s.pickups.filter((p) => p.kind !== 'socket')
}
