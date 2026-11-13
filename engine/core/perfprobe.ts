/**
 * Opt-in performance probe: open any game with `?perf` in the URL and the engine's frame loop, sim
 * ticker and quality governor report into it; `__perf.download()` in the console saves a JSON report
 * (per-second summaries + whole-session percentiles + notable events). Off (no `?perf`): never created,
 * the loops pay one null check.
 *
 * What it tells apart: a slow game (high `renderMs`: our own CPU work per frame) from a starved browser
 * (long frame intervals with low renderMs: the OS / compositor / other tabs), and sim hitches (late ticks,
 * catch-up bursts) from render stutter.
 */

/** Histogram bins are 1 ms wide up to this; slower samples land in the last (overflow) bin. */
const HIST_MAX_MS = 200
/** Per-second summaries kept (~30 min); the oldest drop off. */
const MAX_SECONDS = 1800
/** Notable events kept (quality changes, long tasks, visibility). */
const MAX_EVENTS = 500
/** A frame interval this long or longer counts as a stutter (ms): ~1 dropped frame at 60 Hz. */
export const JANK_MS = [20, 33, 50] as const

export interface PerfSecond {
  /** Seconds since the probe started. */
  t: number
  frames: number
  /** Frame interval (ms): worst in this second. */
  frameMax: number
  /** Frames at or over JANK_MS 20 / 33 / 50 ms. */
  jank: [number, number, number]
  /** Render work per frame (ms): mean and worst. */
  renderAvg: number
  renderMax: number
  ticks: number
  /** Worst tick lateness (ms past its scheduled time). */
  tickLateMax: number
  /** Ticker runs that had to simulate more than one tick (catch-up). */
  bursts: number
  longTasks: number
  longTaskMax: number
}

export interface PerfEvent {
  t: number
  k: string
  data?: Record<string, unknown>
}

export interface PerfReport {
  startedAt: string
  seconds: number
  meta: Record<string, unknown>
  /** Whole-session percentiles (ms). */
  frame: { count: number; p50: number; p95: number; p99: number; max: number; jank: [number, number, number] }
  render: { p50: number; p95: number; p99: number; max: number }
  tick: { count: number; lateP95: number; lateMax: number; bursts: number }
  longTasks: { count: number; totalMs: number; max: number }
  perSecond: PerfSecond[]
  events: PerfEvent[]
}

export interface PerfProbe {
  /** One drawn frame: `intervalMs` since the previous one, `workMs` spent drawing it. */
  frame(intervalMs: number, workMs: number): void
  /** One ticker run: how late (ms) its first tick fired and how many ticks it simulated. */
  ticks(lateMs: number, count: number): void
  /** A main-thread task of `ms` (PerformanceObserver 'longtask'). */
  longTask(ms: number): void
  /** A notable event (quality change, tab hidden, ...). */
  note(k: string, data?: Record<string, unknown>): void
  report(meta?: Record<string, unknown>): PerfReport
}

const hist = () => new Uint32Array(HIST_MAX_MS + 1)
const bin = (ms: number) => Math.min(HIST_MAX_MS, Math.max(0, Math.floor(ms)))

/** The `q` quantile (0..1) of a 1 ms histogram, in ms (the bin's upper edge). */
export function quantile(h: Uint32Array, q: number): number {
  let total = 0
  for (const n of h) total += n
  if (total === 0) return 0
  const want = Math.ceil(q * total)
  let seen = 0
  for (let i = 0; i < h.length; i++) {
    seen += h[i]
    if (seen >= want) return i + 1
  }
  return h.length
}

const emptySecond = (t: number): PerfSecond => ({
  t,
  frames: 0,
  frameMax: 0,
  jank: [0, 0, 0],
  renderAvg: 0,
  renderMax: 0,
  ticks: 0,
  tickLateMax: 0,
  bursts: 0,
  longTasks: 0,
  longTaskMax: 0,
})

const round = (x: number) => Math.round(x * 100) / 100

/** A probe reading the clock from `now` (ms; injectable for tests). */
export function createPerfProbe(now: () => number = () => performance.now()): PerfProbe {
  const t0 = now()
  const started = new Date().toISOString()
  const frameHist = hist()
  const renderHist = hist()
  const lateHist = hist()
  const jank: [number, number, number] = [0, 0, 0]
  let frames = 0
  let frameMax = 0
  let renderMax = 0
  let tickRuns = 0
  let tickLateMax = 0
  let bursts = 0
  let longCount = 0
  let longTotal = 0
  let longMax = 0
  const seconds: PerfSecond[] = []
  const events: PerfEvent[] = []
  let cur = emptySecond(0)
  let renderSum = 0

  /** The current second's summary (rolling over to a new one as time passes). */
  const second = () => {
    const t = Math.floor((now() - t0) / 1000)
    if (t !== cur.t) {
      if (cur.frames || cur.ticks || cur.longTasks) {
        cur.renderAvg = cur.frames ? round(renderSum / cur.frames) : 0
        seconds.push(cur)
        if (seconds.length > MAX_SECONDS) seconds.shift()
      }
      cur = emptySecond(t)
      renderSum = 0
    }
    return cur
  }

  return {
    frame(intervalMs, workMs) {
      const s = second()
      frames++
      frameHist[bin(intervalMs)]++
      renderHist[bin(workMs)]++
      frameMax = Math.max(frameMax, intervalMs)
      renderMax = Math.max(renderMax, workMs)
      s.frames++
      s.frameMax = round(Math.max(s.frameMax, intervalMs))
      s.renderMax = round(Math.max(s.renderMax, workMs))
      renderSum += workMs
      JANK_MS.forEach((ms, i) => {
        if (intervalMs >= ms) {
          jank[i]++
          s.jank[i]++
        }
      })
    },
    ticks(lateMs, count) {
      const s = second()
      tickRuns++
      lateHist[bin(lateMs)]++
      tickLateMax = Math.max(tickLateMax, lateMs)
      s.ticks += count
      s.tickLateMax = round(Math.max(s.tickLateMax, lateMs))
      if (count > 1) {
        bursts++
        s.bursts++
      }
    },
    longTask(ms) {
      const s = second()
      longCount++
      longTotal += ms
      longMax = Math.max(longMax, ms)
      s.longTasks++
      s.longTaskMax = round(Math.max(s.longTaskMax, ms))
      if (events.length < MAX_EVENTS)
        events.push({ t: round((now() - t0) / 1000), k: 'longtask', data: { ms: round(ms) } })
    },
    note(k, data) {
      if (events.length < MAX_EVENTS) events.push({ t: round((now() - t0) / 1000), k, data })
    },
    report(meta = {}) {
      second()
      const open =
        cur.frames || cur.ticks ? [{ ...cur, renderAvg: cur.frames ? round(renderSum / cur.frames) : 0 }] : []
      return {
        startedAt: started,
        seconds: round((now() - t0) / 1000),
        meta,
        frame: {
          count: frames,
          p50: quantile(frameHist, 0.5),
          p95: quantile(frameHist, 0.95),
          p99: quantile(frameHist, 0.99),
          max: round(frameMax),
          jank: [...jank],
        },
        render: {
          p50: quantile(renderHist, 0.5),
          p95: quantile(renderHist, 0.95),
          p99: quantile(renderHist, 0.99),
          max: round(renderMax),
        },
        tick: { count: tickRuns, lateP95: quantile(lateHist, 0.95), lateMax: round(tickLateMax), bursts },
        longTasks: { count: longCount, totalMs: round(longTotal), max: round(longMax) },
        perSecond: [...seconds, ...open],
        events: [...events],
      }
    },
  }
}

let shared: PerfProbe | null | undefined

/**
 * The page's probe when the URL has `?perf` (else null; created once). Also exposes `__perf` in the
 * console: `report()`, `download()`, and watches long tasks and tab visibility.
 */
export function perfProbe(): PerfProbe | null {
  if (shared !== undefined) return shared
  shared = null
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('perf')) return shared
  const probe = createPerfProbe()
  shared = probe
  const meta = () => ({
    url: window.location.pathname,
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    devicePixelRatio: window.devicePixelRatio,
    viewport: [window.innerWidth, window.innerHeight],
    dev: import.meta.env.DEV,
  })
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) probe.longTask(e.duration)
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    /* longtask unsupported (Safari / Firefox): frames and ticks still recorded */
  }
  document.addEventListener('visibilitychange', () => probe.note(document.hidden ? 'hidden' : 'visible'))
  const api = {
    report: () => probe.report(meta()),
    download() {
      const blob = new Blob([JSON.stringify(api.report())], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `perf-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    },
  }
  ;(window as unknown as { __perf: typeof api }).__perf = api
  // Shift+Alt+P saves the report without opening DevTools (DevTools itself slows a WebGL page down).
  // e.code: on macOS Alt changes e.key ("∏").
  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.altKey && e.code === 'KeyP') {
      e.preventDefault()
      api.download()
    }
  })
  // eslint-disable-next-line no-console
  console.info('[perf] recording: Shift+Alt+P (or __perf.download()) saves the report')
  return shared
}
