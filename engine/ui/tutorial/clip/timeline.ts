// Beat timeline for looping CSS clips: each beat is a window inside one loop; elements show their
// style only during their window. Pure string helpers, no DOM.

/** A window in seconds within one loop. */
export interface Beat {
  at: number
  dur: number
}

const RAMP = 0.3 // % of the loop to fade in / out, so edges don't pop

/** Percent stop, clamped to 0-100, 2 decimals. */
export const pct = (n: number) => +Math.min(Math.max(n, 0), 100).toFixed(2)

/**
 * A beat as loop percentages: `a`..`b` is the window; `on` / `off` are the ends of the fade-in /
 * fade-out ramps. Always 0 <= a <= on <= b <= off <= 100. Throws on loop <= 0 or dur < 0.
 */
export function beatPct(beat: Beat, loop: number): { a: number; on: number; b: number; off: number } {
  if (!(loop > 0)) throw new RangeError(`loop must be > 0, got ${loop}`)
  if (!(beat.dur >= 0)) throw new RangeError(`beat.dur must be >= 0, got ${beat.dur}`)
  const a = Math.min(Math.max((beat.at / loop) * 100, 0), 100)
  const b = Math.min(((beat.at + beat.dur) / loop) * 100, 100)
  return { a, on: Math.min(a + RAMP, b), b, off: Math.min(b + RAMP, 100) }
}

/** `@keyframes name{...}`: `off` until the beat, `on` during it, `off` again after. */
export function keyframes(name: string, loop: number, beat: Beat, on: string, off: string): string {
  const { a, on: aOn, b, off: bOff } = beatPct(beat, loop)
  return `@keyframes ${name}{0%,${pct(a)}%{${off}}${pct(aOn)}%,${pct(b)}%{${on}}${pct(bOff)}%,100%{${off}}}`
}

/** animation shorthand for a clip loop, e.g. "k 12s infinite". */
export function animation(name: string, loop: number): string {
  return `${name} ${loop}s infinite`
}

let seq = 0
/** Unique CSS-safe id (several clips may share a page). */
export function uid(prefix: string): string {
  return `${prefix}${++seq}`
}
