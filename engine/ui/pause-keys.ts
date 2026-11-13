/** What a pause key (Esc / P) does: solo pauses the match, online opens a local menu (the match keeps running). */
export type PauseAction = 'toggle-solo' | 'toggle-menu' | null

/** `key` is a KeyboardEvent.code, matched against `pauseKeys`; only a match in progress reacts. */
export function pauseAction(o: {
  key: string
  pauseKeys: readonly string[]
  offline: boolean
  phase: string
}): PauseAction {
  if (o.phase !== 'playing' || !o.pauseKeys.includes(o.key)) return null
  return o.offline ? 'toggle-solo' : 'toggle-menu'
}
