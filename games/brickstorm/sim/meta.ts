// Run-level actions outside the normal turn loop: revives and run-start helpers.
import { rollChoices } from './boosts'
import { DANGER_ROW } from './config'
import { startNextTurn } from './run'
import type { RunState } from './types'

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
