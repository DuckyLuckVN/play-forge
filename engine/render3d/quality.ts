// Pure helpers that keep a 3D view smooth: a pixel budget for the canvas and a
// governor that steps quality down when frames miss the display's refresh.

/** Device pixels we aim to draw per frame (bloom + post passes are fill-bound). */
export const PIXEL_BUDGET = 1.6e6

/**
 * Pixel ratio for a `w`×`h` (CSS px) view: the device ratio, capped by
 * `maxDpr` and by the pixel budget, but never below 1 (or the device ratio,
 * if that is lower) so text and edges stay crisp.
 */
export function pickDpr(
  deviceDpr: number,
  maxDpr: number,
  w: number,
  h: number,
  budget = PIXEL_BUDGET,
): number {
  const want = Math.min(maxDpr, deviceDpr || 1)
  const fit = Math.sqrt(budget / Math.max(1, w * h))
  return Math.max(Math.min(1, want), Math.min(want, fit))
}

export interface QualityLevel {
  /** Extra cap on pixel ratio. */
  dpr: number
  bloom: boolean
}

/** Cheaper and cheaper; the last level is the floor. */
export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { dpr: Infinity, bloom: true },
  { dpr: 1.5, bloom: true },
  { dpr: 1, bloom: true },
  { dpr: 1, bloom: false },
]

/** Frames per judgement window. */
const WINDOW = 60
/** A frame is "late" when it takes this many refresh intervals or more. */
const LATE = 1.5
/** Step down when this share of a window's frames is late. */
const LATE_SHARE = 0.2
/** Below this frame rate the view is too slow, however steady. */
const MIN_FPS = 50
/** Frames this long (the render loop clamps to 0.1 s) are tab switches / hiccups, not rendering cost. */
const IGNORE_DT = 0.1

/**
 * Watches frame times and steps quality down (never back up, so it can't
 * oscillate) when too many frames miss the refresh interval. The refresh
 * interval is learned from the fastest frames seen, so 120 Hz screens are
 * judged against 8.3 ms and 60 Hz screens against 16.7 ms.
 */
export class QualityGovernor {
  level = 0
  private dts: number[] = []
  private refresh = Infinity

  get current(): QualityLevel {
    return QUALITY_LEVELS[this.level]
  }

  /** Start a fresh window (after a resize or level change, buffers realloc). */
  restart(): void {
    this.dts.length = 0
  }

  /** Drop one level now (e.g. the GPU ran out of memory). False at the floor. */
  stepDown(): boolean {
    if (this.level >= QUALITY_LEVELS.length - 1) return false
    this.level++
    this.restart()
    return true
  }

  /** Feed one frame's dt (seconds). Returns true when the level just dropped. */
  sample(dt: number): boolean {
    if (dt <= 0 || dt >= IGNORE_DT || this.level >= QUALITY_LEVELS.length - 1) return false
    this.dts.push(dt)
    if (this.dts.length < WINDOW) return false
    const sorted = [...this.dts].sort((a, b) => a - b)
    // 10th percentile ≈ the display's refresh interval (best case frames).
    this.refresh = Math.min(this.refresh, sorted[Math.floor(WINDOW * 0.1)])
    const late = this.dts.filter((d) => d >= this.refresh * LATE).length
    this.dts.length = 0
    const median = sorted[WINDOW / 2]
    if (late / WINDOW < LATE_SHARE && median <= 1 / MIN_FPS) return false
    this.level++
    return true
  }
}
