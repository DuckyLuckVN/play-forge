// Run-level actions outside the normal turn loop: revives and run-start helpers.
import { rollChoices } from './boosts'
import { DANGER_ROW } from './config'
import { killBrick } from './damage'
import { startNextTurn } from './run'
import type { ActiveHelper, RunState } from './types'

/** Coins for the next revive this run: 100, 200, 300… */
export function reviveCost(s: RunState): number {
  return 100 * (s.revivesUsed + 1)
}

/** After game over: clears the 3 rows nearest the danger line and plays on. The caller has paid. */
export function revive(s: RunState): void {
  if (s.phase !== 'over') return
  s.bricks = s.bricks.filter((b) => b.row < DANGER_ROW - 2)
  s.pickups = s.pickups.filter((p) => p.row < DANGER_ROW - 2)
  s.revivesUsed++
  s.events.push({ type: 'revive' })
  startNextTurn(s)
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
  return true
}
