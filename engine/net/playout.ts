// Host-side input playout (de-jitter) buffer for one remote player, like a voice-call jitter buffer
// or an authoritative server's per-client input buffer. The sender stamps each input with its own
// step counter; the host applies it at stamp + offset, where offset = the fastest recent transit +
// the recent jitter (capped). Network jitter then no longer changes WHEN an input takes effect, so
// the host's path of that player matches the one the sender predicted step for step.
// Pure (ticks in, items out): the session owns the clock.

export const PLAYOUT = {
  /** Recent transits kept (inputs, not ticks: they come on change). */
  window: 48,
  /** Most jitter margin (ticks, ≈ 67 ms at 60 Hz) over the fastest transit: jitter past this is not hidden. */
  maxHold: 4,
  /** Most ticks one input waits after its arrival (a burst keeps its spacing up to here; a bad stamp no further). */
  maxWait: 30,
  /** Share of recent transits the margin covers (the slowest few are let through late). */
  quantile: 0.9,
  /** A transit this far from the fastest = the sender's clock restarted (new match, hidden tab): start over. */
  reset: 60,
  /** Fewest ticks between one-tick offset decreases, and after a raise (raises apply at once). */
  settle: 30,
} as const

interface Queued<T> {
  at: number
  /** Ticks after its nominal stamp + offset (≥ 0 late, < 0 capped early). */
  late: number
  item: T
}

export class PlayoutBuffer<T> {
  /** Host tick − sender stamp inputs are applied at (NaN until the first input). */
  offset = NaN
  private transits: number[] = []
  private queue: Queued<T>[] = []
  private last = -Infinity
  private loweredAt = -Infinity
  private scratch: number[] = []

  /** An input stamped `stamp` (sender steps) arrived; `next` = the host tick about to be simulated. */
  push(stamp: number, item: T, next: number): void {
    const d = next - stamp
    if (this.transits.length && Math.abs(d - this.fastest()) > PLAYOUT.reset) this.reset()
    this.transits.push(d)
    if (this.transits.length > PLAYOUT.window) this.transits.shift()

    const base = this.fastest()
    const target = base + Math.min(PLAYOUT.maxHold, Math.max(0, this.quantile() - base))
    if (Number.isNaN(this.offset) || target > this.offset) {
      this.offset = target
      // Hold a raised offset for a while: a burst's later inputs look faster than they were.
      this.loweredAt = next
    } else if (target < this.offset && next - this.loweredAt >= PLAYOUT.settle) {
      this.offset--
      this.loweredAt = next
    }

    const nominal = stamp + this.offset
    // Never before arrival, never before an earlier input (order), never held past maxWait.
    const at = Math.max(this.last, next, Math.min(nominal, next + PLAYOUT.maxWait))
    this.last = at
    this.queue.push({ at, late: at - nominal, item })
  }

  /** Append the inputs due at host tick `tick` to `out` (arrival order); `late` gets each one's lateness. */
  take(tick: number, out: T[], late?: number[]): void {
    while (this.queue.length && this.queue[0].at <= tick) {
      const q = this.queue.shift()!
      out.push(q.item)
      late?.push(q.late)
    }
  }

  clear(): void {
    this.reset()
    this.queue.length = 0
    this.last = -Infinity
  }

  private reset() {
    this.transits.length = 0
    this.offset = NaN
    this.loweredAt = -Infinity
  }

  private fastest(): number {
    let m = Infinity
    for (const d of this.transits) if (d < m) m = d
    return m
  }

  private quantile(): number {
    const s = this.scratch
    s.length = 0
    for (const d of this.transits) s.push(d)
    s.sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor(PLAYOUT.quantile * s.length))]
  }
}
