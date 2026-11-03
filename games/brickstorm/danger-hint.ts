// When bricks are about to reach the line, point the player at a helper that
// could save the run: one they own, or the shop if they have none.
import { dims } from './sim/dims'
import type { ActiveHelper, RunState } from './sim/types'

/** Helpers that buy time or clear space, best first. */
export const RESCUE_HELPERS = [
  'pushBack',
  'freeze',
  'megaBomb',
  'rowBomb',
] as const satisfies readonly ActiveHelper[]
/** Rows above the danger line at which the hint shows. */
const NEAR = 2

export type DangerHint = { use: (typeof RESCUE_HELPERS)[number] } | { shop: true }

export function dangerHint(
  s: RunState,
  helpers: Record<(typeof RESCUE_HELPERS)[number], number>,
): DangerHint | null {
  if (s.phase !== 'aim') return null
  const line = dims(s).dangerRow
  if (!s.bricks.some((b) => b.row >= line - NEAR)) return null
  const use = RESCUE_HELPERS.find((id) => helpers[id] > 0)
  return use ? { use } : { shop: true }
}
