// Smooth render clock: a tick counter that follows the newest host state with a fixed delay and a
// bounded rate nudge, so network jitter never makes the shown timeline speed up, stall or go backward.
// Pure and game-agnostic (no three.js, no performance.now): the owner feeds it states and frame dts.

export const CLOCK = {
  /** Ticks behind the newest state at arrival (the old prev.tick + alpha timeline). */
  delay: 1,
  /** Rate nudge per tick of error, clamped to ±maxSkew (the clock rate stays within ±10%). */
  gain: 0.1,
  maxSkew: 0.1,
  /** Error (ticks) beyond which the clock jumps to its target instead of nudging. */
  resync: 6,
  /** Most ticks shown past the newest state (a stalled link stops here, never flies off). */
  maxAhead: 8,
} as const

export class RenderClock {
  /** The tick being shown (fractional). */
  tick = 0
  /** Newest host tick received. */
  newest = 0
  private since = 0
  private started = false

  constructor(private readonly tickRate: number) {}

  /** A host state arrived. Stale or repeated ticks are ignored. */
  onState(tick: number): void {
    if (this.started && tick <= this.newest) return
    if (!this.started) {
      this.started = true
      this.tick = tick - CLOCK.delay
    }
    this.newest = tick
    this.since = 0
  }

  /** Advance one frame. Call after onState for states that arrived this frame. */
  update(dt: number): void {
    if (!this.started) return
    const rate = this.tickRate
    const err = this.newest - CLOCK.delay + this.since * rate - this.tick
    this.since += dt
    if (Math.abs(err) > CLOCK.resync) {
      this.tick = this.newest - CLOCK.delay + this.since * rate
    } else {
      const skew = Math.max(-CLOCK.maxSkew, Math.min(CLOCK.maxSkew, CLOCK.gain * err))
      this.tick += dt * rate * (1 + skew)
    }
    this.tick = Math.min(this.tick, this.newest + CLOCK.maxAhead)
  }

  reset(): void {
    this.tick = 0
    this.newest = 0
    this.since = 0
    this.started = false
  }
}
