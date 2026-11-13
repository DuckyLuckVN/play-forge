// Smooth render clock: a tick counter that follows the newest host state with a fixed delay and a
// bounded rate nudge, so network jitter never makes the shown timeline speed up, stall or go backward.
// Pure and game-agnostic (no three.js, no performance.now): the owner feeds it states and frame dts.
// The delay adapts like a jitter buffer: 1 tick on a clean link, more (up to maxDelay) when states
// arrive unevenly, so the shown tick stays between two received states instead of guessing past the
// newest one (the overshoot-then-pull-back of a remote player); it comes back down once the link calms.

export const CLOCK = {
  /** Fewest ticks behind the newest state at arrival (the old prev.tick + alpha timeline): a clean link. */
  delay: 1,
  /** Most ticks behind (≈ 67 ms at 60 Hz): jitter beyond this is guessed through (capped extrapolation). */
  maxDelay: 4,
  /** Ticks per state the earliest-arrival baseline may rise (follows a slightly slower host clock). */
  drift: 0.01,
  /** Ticks per state the measured jitter fades (≈ 1 tick a second at 60 Hz: calms down after a spike). */
  fade: 1 / 60,
  /** Rate nudge per tick of error, clamped to ±maxSkew (the clock rate stays within ±10%). */
  gain: 0.1,
  maxSkew: 0.1,
  /** Ticks behind its target beyond which the clock jumps forward instead of nudging. */
  resync: 6,
  /** Most ticks shown past the newest state (a stalled link stops here, never flies off). */
  maxAhead: 8,
} as const

export class RenderClock {
  /** The tick being shown (fractional). */
  tick = 0
  /** Newest host tick received. */
  newest = 0
  /** Ticks behind the newest state the clock aims for (adaptive, CLOCK.delay..CLOCK.maxDelay). */
  delay: number = CLOCK.delay
  private since = 0
  private started = false
  /** Seconds of frames so far (arrival times, frame-accurate). */
  private time = 0
  /** Earliest arrival time − tick seen (ticks, drifting up slowly); NaN = none yet. */
  private base = NaN
  /** Recent worst lateness over `base` (ticks), fading. */
  private peak = 0

  constructor(readonly tickRate: number) {}

  /** A host state arrived. Stale or repeated ticks are ignored. */
  onState(tick: number): void {
    if (this.started && tick <= this.newest) return
    this.measure(tick)
    if (!this.started) {
      this.started = true
      this.tick = tick - this.delay
    }
    this.newest = tick
    this.since = 0
  }

  /** Advance one frame. Call after onState for states that arrived this frame. */
  update(dt: number): void {
    this.time += dt
    if (!this.started) return
    const rate = this.tickRate
    const err = this.newest - this.delay + this.since * rate - this.tick
    this.since += dt
    // Far behind: jump forward. Ahead (a stall, a grown delay): never jump back, slow down instead.
    if (err > CLOCK.resync) {
      this.tick = this.newest - this.delay + this.since * rate
    } else {
      const skew = Math.max(-CLOCK.maxSkew, Math.min(CLOCK.maxSkew, CLOCK.gain * err))
      this.tick += dt * rate * (1 + skew)
    }
    this.tick = Math.min(this.tick, this.newest + CLOCK.maxAhead)
  }

  /** History tick of the shown shuttle: what a swing sent now should carry (same meaning as swingTick). */
  seenTick(): number {
    return Math.round(this.tick) + 1
  }

  reset(): void {
    this.tick = 0
    this.newest = 0
    this.since = 0
    this.started = false
    this.delay = CLOCK.delay
    this.base = NaN
    this.peak = 0
  }

  /** Delay = the minimum + how much later than the earliest arrivals states recently came (ticks). */
  private measure(tick: number) {
    const transit = this.time * this.tickRate - tick
    this.base = Number.isNaN(this.base) ? transit : Math.min(transit, this.base + CLOCK.drift)
    // Capped: a long stall (unhideable anyway) raises the delay to the most, not for minutes.
    this.peak = Math.min(CLOCK.maxDelay - CLOCK.delay, Math.max(transit - this.base, this.peak - CLOCK.fade))
    this.delay = Math.min(CLOCK.maxDelay, CLOCK.delay + Math.max(0, Math.round(this.peak)))
  }
}
