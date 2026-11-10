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
  /** Game-drawn extra, e.g. real shadows. The engine ignores it; games read `Scene3D.quality`. */
  shadows?: boolean
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
/** Seconds after attach / restart whose frames are not judged (shader compile, buffer realloc). */
export const QUALITY_SETTLE = 2
/** Consecutive bad windows before a level drop. */
export const BAD_WINDOWS = 2
/** Consecutive clean windows before probing one level back up. */
export const RECOVER_WINDOWS = 5
/** Clean windows a probe must survive before a later failure no longer locks the ceiling. */
export const PROBE_WINDOWS = 3
/** A window is clean when under this share of its frames is late. */
export const CLEAN_SHARE = 0.05

/**
 * Watches frame times and steps quality down after sustained slow windows
 * (not on a hitchy start: the first seconds are skipped). After a long clean
 * stretch it probes one level back up; if that probe soon fails, the level
 * becomes the ceiling so it cannot flap. The refresh interval is learned from
 * the fastest frames seen, so 120 Hz screens are judged against 8.3 ms and
 * 60 Hz screens against 16.7 ms.
 */
export class QualityGovernor {
  level = 0
  private dts: number[] = []
  private refresh = Infinity
  /** Highest-quality index reachable upward. */
  private ceiling = 0
  private settle = QUALITY_SETTLE
  private badRun = 0
  private goodRun = 0
  private probeLeft = 0

  constructor(private readonly levels: readonly QualityLevel[] = QUALITY_LEVELS) {}

  get current(): QualityLevel {
    return this.levels[this.level]
  }

  /** Start a fresh window (after a resize or level change, buffers realloc). */
  restart(): void {
    this.dts.length = 0
    this.badRun = 0
    this.goodRun = 0
    this.settle = QUALITY_SETTLE
  }

  /** Drop one level now (e.g. the GPU ran out of memory) and never probe back above it. False at the floor. */
  stepDown(): boolean {
    if (this.level >= this.levels.length - 1) return false
    this.level++
    this.ceiling = this.level
    this.restart()
    return true
  }

  /** Feed one frame's dt (seconds). Returns true when the level just changed, either way. */
  sample(dt: number): boolean {
    if (dt <= 0) return false
    if (this.settle > 0) {
      this.settle -= dt
      if (this.settle > 1e-6) return false
    }
    if (dt >= IGNORE_DT) return false
    this.dts.push(dt)
    if (this.dts.length < WINDOW) return false
    const sorted = [...this.dts].sort((a, b) => a - b)
    // 10th percentile ≈ the display's refresh interval (best case frames).
    this.refresh = Math.min(this.refresh, sorted[Math.floor(WINDOW * 0.1)])
    const late = this.dts.filter((d) => d >= this.refresh * LATE).length
    this.dts.length = 0
    const median = sorted[WINDOW / 2]
    const lateShare = late / WINDOW
    if (lateShare >= LATE_SHARE || median > 1 / MIN_FPS) {
      this.badRun++
      this.goodRun = 0
      if (this.badRun < BAD_WINDOWS || this.level >= this.levels.length - 1) return false
      this.level++
      if (this.probeLeft > 0) this.ceiling = this.level
      return true
    }
    if (lateShare < CLEAN_SHARE) {
      this.goodRun++
      this.badRun = 0
      this.probeLeft = Math.max(0, this.probeLeft - 1)
      if (this.goodRun < RECOVER_WINDOWS || this.level <= this.ceiling) return false
      this.level--
      this.probeLeft = PROBE_WINDOWS
      return true
    }
    this.badRun = 0
    this.goodRun = 0
    return false
  }
}
