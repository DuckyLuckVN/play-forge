// Saving without stalling the game: every request in a burst (a turn ending,
// a pick, a purchase) becomes one write, made when the browser is idle; a
// pending write is flushed at once when the tab is hidden or closed.

/** Runs a job soon, when the browser is idle (at most ~2 s later). */
export type Schedule = (job: () => void) => void

export const idle: Schedule = (job) => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback
  if (ric) ric(job, { timeout: 2000 })
  else setTimeout(job, 200)
}

export class SaveQueue {
  private pending = false
  private scheduled = false

  constructor(
    private write: () => void,
    private schedule: Schedule = idle,
  ) {}

  /** Asks for a save; it happens once, soon. */
  request(): void {
    this.pending = true
    if (this.scheduled) return
    this.scheduled = true
    this.schedule(() => {
      this.scheduled = false
      this.flush()
    })
  }

  /** Writes now if anything is waiting (the page is hiding or closing). */
  flush(): void {
    if (!this.pending) return
    this.pending = false
    this.write()
  }
}
