/**
 * Fixed-rate simulation ticker. Uses timers rather than requestAnimationFrame
 * so the host keeps simulating when its tab is in the background (browsers
 * throttle background timers, so missed ticks are caught up in a burst).
 */
export function startTicker(tickRate: number, onTick: () => void): () => void {
  const interval = 1000 / tickRate
  const maxCatchUp = tickRate // never simulate more than ~1s in one burst
  let next = performance.now() + interval
  let timer: ReturnType<typeof setTimeout>
  let running = true

  const run = () => {
    if (!running) return
    const now = performance.now()
    let ticks = 0
    while (now >= next && ticks < maxCatchUp) {
      onTick()
      next += interval
      ticks++
      if (!running) return
    }
    if (now >= next) next = now + interval // fell too far behind, resync
    timer = setTimeout(run, Math.max(0, next - performance.now()))
  }
  timer = setTimeout(run, interval)

  return () => {
    running = false
    clearTimeout(timer)
  }
}

/** requestAnimationFrame loop for rendering. `dt` is in seconds. */
export function startRenderLoop(render: (dt: number, time: number) => void): () => void {
  let last = performance.now()
  let id = requestAnimationFrame(function frame(now) {
    render(Math.min((now - last) / 1000, 0.1), now / 1000)
    last = now
    id = requestAnimationFrame(frame)
  })
  return () => cancelAnimationFrame(id)
}
