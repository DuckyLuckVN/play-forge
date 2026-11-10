// What kind of device the player is on, for picking which controls to show.

/** Touch-only devices (no hover, coarse pointer) get touch hints; anything with a keyboard or mouse gets keys. */
export function prefersTouch(): boolean {
  try {
    return globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false
  } catch {
    return false
  }
}
