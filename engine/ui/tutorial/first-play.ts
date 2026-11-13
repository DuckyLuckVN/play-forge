// First-play rules for the tutorial deck, kept apart from app.ts so they're testable on their own.
// The deck reuses the guide's "seen" flag (engine/ui/guide.ts), so its in-memory fallback applies.
import { guideSeen } from '../guide'
import type { DeckEnd } from './deck'

/** Finished or skipped by the player counts as seen; closed by code (a match starting) does not. */
export function shouldMarkSeen(end: DeckEnd): boolean {
  return end !== 'dismissed'
}

/** Open the help on its own before game `id`'s first match? `has`: the game has help to show. */
export function shouldAutoOpen(
  id: string,
  has: boolean,
  store?: Pick<Storage, 'getItem' | 'setItem'>,
): boolean {
  return has && !guideSeen(id, store)
}
