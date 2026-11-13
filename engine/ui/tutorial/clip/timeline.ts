// Beat timeline for looping CSS clips: each beat is a window inside one loop; elements show their
// style only during their window. Pure string helpers, no DOM.

/** A window in seconds within one loop. */
export interface Beat {
  at: number
  dur: number
}

const RAMP = 0.3 // % of the loop to fade in / out, so edges don't pop
const pct = (n: number) => +n.toFixed(2)

/** `@keyframes name{...}`: `off` until the beat, `on` during it, `off` again after. */
export function keyframes(name: string, loop: number, beat: Beat, on: string, off: string): string {
  const a = (beat.at / loop) * 100
  const b = ((beat.at + beat.dur) / loop) * 100
  return `@keyframes ${name}{0%,${pct(a)}%{${off}}${pct(a + RAMP)}%,${pct(b)}%{${on}}${pct(b + RAMP)}%,100%{${off}}}`
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
