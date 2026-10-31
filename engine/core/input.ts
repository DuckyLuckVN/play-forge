export type Direction = 'up' | 'down' | 'left' | 'right'

export interface InputBindings<A extends string> {
  /** Map of KeyboardEvent.code (e.g. "ArrowUp", "KeyW", "Space") to action. */
  keys?: Partial<Record<string, A>>
  /** Map swipe gestures on `swipeTarget` to actions (touch devices). */
  swipe?: Partial<Record<Direction, A>>
  /** Map a tap on `swipeTarget` to an action. */
  tap?: A
  swipeTarget?: HTMLElement
}

/**
 * Translates raw keyboard / touch events into game actions.
 * Returns a cleanup function that removes all listeners.
 */
export function bindInput<A extends string>(
  bindings: InputBindings<A>,
  onAction: (action: A) => void,
): () => void {
  const cleanups: (() => void)[] = []

  if (bindings.keys) {
    const keys = bindings.keys
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const action = keys[e.code]
      if (!action) return
      e.preventDefault()
      if (!e.repeat) onAction(action)
    }
    window.addEventListener('keydown', onKey)
    cleanups.push(() => window.removeEventListener('keydown', onKey))
  }

  const target = bindings.swipeTarget
  if (target && (bindings.swipe || bindings.tap)) {
    const minDistance = 24
    let start: { x: number; y: number } | null = null
    let swiped = false
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      start = { x: e.clientX, y: e.clientY }
      swiped = false
    }
    const onMove = (e: PointerEvent) => {
      if (!start || !bindings.swipe) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (Math.max(Math.abs(dx), Math.abs(dy)) < minDistance) return
      const dir: Direction =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      const action = bindings.swipe[dir]
      if (action) onAction(action)
      // Re-anchor so one continuous drag can chain several turns.
      start = { x: e.clientX, y: e.clientY }
      swiped = true
    }
    const onUp = () => {
      if (start && !swiped && bindings.tap) onAction(bindings.tap)
      start = null
    }
    target.style.touchAction = 'none'
    target.addEventListener('pointerdown', onDown)
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
    cleanups.push(() => {
      target.removeEventListener('pointerdown', onDown)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    })
  }

  return () => cleanups.forEach((c) => c())
}
