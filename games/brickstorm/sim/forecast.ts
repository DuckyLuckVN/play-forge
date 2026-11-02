// The crash forecast: which bricks will reach the line when this turn ends
// (and the turn after), and what each will cost the hero. It reuses the crash
// formula, so the warning always matches the hit.
import { dims } from './dims'
import { crashShares } from './health'
import { rowDrops } from './run'
import type { Brick, RunState } from './types'

export interface CrashForecast {
  /** Health the hero loses when this turn ends, if nothing else breaks. */
  damage: number
  /** Of that, the boss's hit (0 if no boss crashes). */
  boss: number
  /** Bricks crashing when this turn ends: id → their part of `damage`. */
  next: Map<number, number>
  /** Bricks crashing the turn after: id → what they would cost then. */
  soon: Map<number, number>
}

export function crashForecast(s: RunState): CrashForecast {
  const { dangerRow } = dims(s)
  const drops = rowDrops(s)
  const next: Brick[] = []
  const soon: Brick[] = []
  for (const b of s.bricks) {
    if (b.row + drops >= dangerRow) next.push(b)
    else if (b.row + drops + 1 >= dangerRow) soon.push(b)
  }
  const now = crashShares(s, next)
  const later = crashShares(
    s,
    soon.filter((b) => b.kind !== 'boss'),
  )
  return { damage: next.length ? now.total : 0, boss: now.boss, next: now.bricks, soon: later.bricks }
}
