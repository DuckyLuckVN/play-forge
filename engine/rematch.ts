// Rooms: when the rematch starts by itself. Only the host's client starts a match, and only from the
// results screen, once it is ready too and the session would let it start (every guest ready, nobody
// reconnecting). The match's own 3-2-1 countdown follows, so there is no extra wait here.

export interface RematchState {
  isHost: boolean
  phase: string
  /** The local player is still on the results screen (did not press Close). */
  onResults: boolean
  selfReady: boolean
  /** Session.canStart: all connected guests ready, nobody reconnecting, enough players. */
  canStart: boolean
}

export function shouldAutoRematch(s: RematchState): boolean {
  return s.isHost && s.phase === 'finished' && s.onResults && s.selfReady && s.canStart
}
