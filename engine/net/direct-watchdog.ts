/**
 * When to try the direct (WebRTC) links again: while some peer is reachable only through the relay.
 * Both browsers can start a connection at once and each keep a different one (each then checks a
 * connection the other already closed, until it times out a minute later); a fresh attempt
 * (Transport.retryDirect) almost always settles it. Pure: the owner ticks it with the time.
 */
export const WATCHDOG = {
  /**
   * Ms on the relay before the first retry (a direct link normally opens well within this). The first
   * attempt has no TURN (trystero.ts), so this is also how long a TURN-only pair waits for TURN.
   */
  firstMs: 8_000,
  /** Retries per stuck spell; each waits twice as long as the one before. */
  maxRetries: 3,
  /** Up to this many ms added at random: both peers' watchdogs start together, retrying in step could collide again. */
  jitterMs: 3000,
} as const

export class DirectWatchdog {
  private since = -1
  private retries = 0
  private next = 0

  constructor(private readonly random: () => number = Math.random) {}

  private wait(ms: number) {
    return ms + this.random() * WATCHDOG.jitterMs
  }

  /** A retry just happened by hand: the automatic ones start over from it. */
  restart(now: number): void {
    this.since = now
    this.retries = 0
    this.next = now + this.wait(WATCHDOG.firstMs)
  }

  /** `relayOnly`: some peer is reached only through the relay now. True = retry now. */
  tick(now: number, relayOnly: boolean): boolean {
    if (!relayOnly) {
      // All direct: a later stuck spell starts over with the full retries.
      this.since = -1
      this.retries = 0
      return false
    }
    if (this.since < 0) {
      this.since = now
      this.next = now + this.wait(WATCHDOG.firstMs)
    }
    if (this.retries >= WATCHDOG.maxRetries || now < this.next) return false
    this.retries++
    this.next = now + this.wait(WATCHDOG.firstMs * 2 ** this.retries)
    return true
  }
}
