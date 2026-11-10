/**
 * A game's heavy one-time setup (GameAppOptions.preload), started once at page
 * load. Anything that mounts the game (start buttons, reload rejoin, invite
 * links) waits on `whenReady()`. A failed preload still lets players in.
 */
export interface PreloadGate {
  /** True until the preload has settled (either way). */
  readonly pending: boolean
  /** Resolves once the preload settles; never rejects. */
  whenReady(): Promise<void>
}

export function preloadGate(
  run: (() => Promise<unknown>) | undefined,
  onError: (err: unknown) => void = (err) => console.warn('Preload failed; starting anyway.', err),
): PreloadGate {
  let pending = !!run
  let ready: Promise<void> = Promise.resolve()
  if (run) {
    ready = Promise.resolve()
      .then(run)
      .then(
        () => undefined,
        (err: unknown) => onError(err),
      )
      .finally(() => {
        pending = false
      })
  }
  return {
    get pending() {
      return pending
    },
    whenReady: () => ready,
  }
}
