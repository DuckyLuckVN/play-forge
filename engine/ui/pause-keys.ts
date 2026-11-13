/** What a pause key (Esc / P) does: solo pauses the match, online opens a local menu (the match keeps running). */
export type PauseAction = 'toggle-solo' | 'toggle-menu' | null

/**
 * `key` is a KeyboardEvent.code, matched against `pauseKeys`; only a match in progress reacts.
 * `hostLost`: a guest waiting for the host (the host-lost screen shows), so no menu toggles unseen.
 * `consumed`: the game already used the key (`defaultPrevented`, e.g. Fuse's Esc cancelling an armed
 * blast). The shell asks it online only, after the game's listeners ran; solo decides synchronously.
 */
export function pauseAction(o: {
  key: string
  pauseKeys: readonly string[]
  offline: boolean
  phase: string
  hostLost?: boolean
  consumed?: boolean
}): PauseAction {
  if (o.phase !== 'playing' || o.hostLost || o.consumed || !o.pauseKeys.includes(o.key)) return null
  return o.offline ? 'toggle-solo' : 'toggle-menu'
}
