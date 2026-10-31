// Run-level actions outside the normal turn loop: revives and run-start helpers.
import { rollChoices } from './boosts'
import { MAX_COLS, MAX_ROWS } from './config'
import { dims } from './dims'
import { killBrick } from './damage'
import { openPickOrAim } from './run'
import type { ActiveHelper, RunState } from './types'

/** Coins for the next revive this run: 100, 200, 300… */
export function reviveCost(s: RunState): number {
  return 100 * (s.revivesUsed + 1)
}

/** After game over: clears the 3 rows nearest the danger line and plays on. The caller has paid. */
export function revive(s: RunState): void {
  if (s.phase !== 'over') return
  const { dangerRow } = dims(s)
  s.bricks = s.bricks.filter((b) => b.row < dangerRow - 2)
  s.pickups = s.pickups.filter((p) => p.row < dangerRow - 2)
  s.revivesUsed++
  s.events.push({ type: 'revive' })
  // Same turn: aim again (the next volley brings the next row).
  openPickOrAim(s)
}

/** Applies helpers the player switched on for this run. */
export function applyHelpers(s: RunState, use: { headStart: boolean; luckyStart: boolean }): void {
  if (use.headStart) s.ballCount += 5
  if (use.luckyStart) {
    s.pendingPicks++
    s.phase = 'pick'
    s.choices = rollChoices(s)
  }
}

/**
 * Spends a mid-run helper. Only while aiming; returns false (and does nothing)
 * otherwise, so the caller only takes it from the inventory on true.
 */
export function useHelper(s: RunState, id: ActiveHelper): boolean {
  if (s.phase !== 'aim') return false
  s.combo = 0 // helper kills pay the base coin rate, not the last volley's combo
  switch (id) {
    case 'pushBack':
      s.bricks = s.bricks.filter((b) => b.row > 0)
      s.pickups = s.pickups.filter((p) => p.row > 0)
      for (const b of s.bricks) b.row--
      for (const p of s.pickups) p.row--
      break
    case 'rowBomb': {
      const lowest = Math.max(-1, ...s.bricks.map((b) => b.row))
      for (const b of s.bricks.filter((b) => b.row === lowest)) killBrick(s, b, 0)
      break
    }
    case 'freeze':
      s.freezeNext = true
      break
    case 'firePack':
      s.fireCharges += 5
      break
    case 'surge':
      s.surgeNext = true
      break
  }
  s.events.push({ type: 'helper', id })
  openPickOrAim(s) // a level-up from Row Bomb opens its pick now
  return true
}

/** Every GROW_EVERY turns: the player adds a column or a row (each axis is capped). */
export function growBoard(s: RunState, axis: 'col' | 'row'): void {
  if (s.phase !== 'grow') return
  if (axis === 'col' && s.cols >= MAX_COLS) return
  if (axis === 'row' && s.rows >= MAX_ROWS) return
  if (axis === 'col') s.cols++
  else s.rows++
  s.growPending = false
  s.events.push({ type: 'grow', axis })
  openPickOrAim(s)
}
