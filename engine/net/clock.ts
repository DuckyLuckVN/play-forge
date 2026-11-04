// A local estimate of the host's simulation clock, so a client can time things
// (music, input timestamps) smoothly instead of on bursty network arrivals.
//
// The offset between local time and host ticks is the minimum over the last
// half second of arrivals: a late (jittery) packet never moves it, the
// cleanest recent one wins, and a host that drifts is followed within the
// window.

/** Arrivals remembered (half a second at 60 ticks/s). */
const WINDOW = 30
/** Without a state for this long, the clock is stale (paused, dropped). */
const STALE_MS = 150
/** A tick this far back (or near zero) means a new match, not a late packet. */
const RESTART_TICKS = 60

/**
 * Is a received tick the next state, a stale one that arrived out of order,
 * or the start of a new match? (Snapshots carry no match id; ticks restart.)
 */
export function runChange(lastTick: number, tick: number): 'next' | 'stale' | 'new' {
  if (lastTick === -Infinity) return 'new'
  if (tick >= lastTick) return 'next'
  return tick < RESTART_TICKS || lastTick - tick > RESTART_TICKS ? 'new' : 'stale'
}

export class TickClock {
  private samples: number[] = []
  private offset = NaN
  private lastTick = -Infinity
  private lastSeen = -Infinity
  private readonly ms: number

  constructor(tickRate: number) {
    this.ms = 1000 / tickRate
  }

  /** A state for `tick` arrived at local time `now` (ms, performance.now()). */
  observe(tick: number, now: number = performance.now()): void {
    const change = runChange(this.lastTick, tick)
    if (change === 'stale') return
    if (change === 'new') this.samples = []
    this.samples.push(now - tick * this.ms)
    if (this.samples.length > WINDOW) this.samples.shift()
    this.offset = Math.min(...this.samples)
    this.lastTick = tick
    this.lastSeen = now
  }

  /** Local time (ms) when the host is at `tick` (fractional ticks allowed). */
  timeOf(tick: number): number {
    return this.offset + tick * this.ms
  }

  /** The host tick at local time `now` (fractional). */
  tickAt(now: number = performance.now()): number {
    return (now - this.offset) / this.ms
  }

  /** Heard from the host within the last moment (not paused or dropped). */
  fresh(now: number = performance.now()): boolean {
    return now - this.lastSeen < STALE_MS
  }
}
