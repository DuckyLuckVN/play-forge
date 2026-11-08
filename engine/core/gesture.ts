import type { Direction } from './input'

export interface Point {
  x: number
  y: number
}

/** What one touch / drag means, in the order it happens. */
export type Gesture =
  { type: 'swipe'; dir: Direction } | ({ type: 'hold' | 'holdMove' | 'tap' | 'release' } & Point)

export interface GestureOptions {
  /** Pixels a press must travel to count as a swipe (default 24). */
  threshold?: number
  /** Ms a still press takes to become a hold; leave out to never hold. */
  holdDelay?: number
}

/**
 * Pure gesture state machine: feed it pointer samples (with timestamps in ms)
 * and it returns what they mean. One press gives at most one swipe — no
 * re-anchored chaining — or a hold that follows the finger, or a tap.
 * Every press that ends normally ends with a `release`.
 */
export class GestureClassifier {
  private readonly threshold: number
  private readonly holdDelay: number | undefined
  private start: (Point & { t: number }) | null = null
  private mode: 'pressed' | 'swiped' | 'holding' = 'pressed'

  constructor(opts: GestureOptions = {}) {
    this.threshold = opts.threshold ?? 24
    this.holdDelay = opts.holdDelay
  }

  get active(): boolean {
    return this.start !== null
  }

  down(x: number, y: number, t: number): Gesture[] {
    this.start = { x, y, t }
    this.mode = 'pressed'
    return []
  }

  /** Time passes with the finger still (lets a hold start without movement). */
  wait(t: number): Gesture[] {
    return this.resolveHold(t)
  }

  move(x: number, y: number, t: number): Gesture[] {
    if (!this.start) return []
    const out = this.resolveHold(t)
    if (this.mode === 'holding') return [...out, { type: 'holdMove', x, y }]
    if (this.mode === 'swiped') return out
    const dx = x - this.start.x
    const dy = y - this.start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < this.threshold) return out
    this.mode = 'swiped'
    const dir: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
    return [{ type: 'swipe', dir }]
  }

  up(x: number, y: number, t: number): Gesture[] {
    if (!this.start) return []
    const out = this.resolveHold(t)
    if (this.mode === 'pressed') out.push({ type: 'tap', x, y })
    out.push({ type: 'release', x, y })
    this.start = null
    return out
  }

  /** Drop the press without emitting anything (pointercancel, unbind). */
  cancel(): void {
    this.start = null
  }

  private resolveHold(t: number): Gesture[] {
    const s = this.start
    if (!s || this.mode !== 'pressed' || this.holdDelay === undefined || t - s.t < this.holdDelay) return []
    this.mode = 'holding'
    return [{ type: 'hold', x: s.x, y: s.y }]
  }
}

/** Presses that start on these never become gestures (controls, header, overlays). */
export const GESTURE_IGNORE =
  'button, a, input, textarea, select, label, .pf-bar, .pf-overlay, .pf-popover, [data-no-gesture]'

/** Callbacks get client (viewport) coordinates. */
export interface GestureHandlers {
  /**
   * Runs first on every press; return true to claim it, so it never also
   * becomes a swipe / tap / hold (e.g. a timing-sensitive tap on press).
   */
  onPress?(p: Point): boolean | void
  onSwipe?(dir: Direction): void
  onTap?(p: Point): void
  /** Setting this turns holds on. */
  onHold?(p: Point): void
  onHoldMove?(p: Point): void
  onRelease?(p: Point): void
}

export interface BindGestureOptions extends GestureOptions {
  /** Element to listen on, or `document` for the whole page (default). */
  target?: HTMLElement | Document
  /** CSS selector of press targets to ignore (default `GESTURE_IGNORE`). */
  ignore?: string
}

/**
 * Wires a `GestureClassifier` to pointer events (touch, pen and left-button
 * mouse; one pointer at a time). On an element it captures the pointer and turns off browser panning;
 * on `document` it blocks page scrolling only while a gesture is live, so
 * ignored areas (overlays, menus) still scroll. Returns an unbind function.
 */
export function bindGestures(handlers: GestureHandlers, opts: BindGestureOptions = {}): () => void {
  const target = opts.target ?? document
  const ignore = opts.ignore ?? GESTURE_IGNORE
  const holdDelay = handlers.onHold ? (opts.holdDelay ?? 150) : undefined
  const classifier = new GestureClassifier({ threshold: opts.threshold, holdDelay })
  const el = target instanceof Document ? null : target
  let pointer: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const emit = (gestures: Gesture[]) => {
    for (const g of gestures) {
      if (g.type === 'swipe') handlers.onSwipe?.(g.dir)
      else if (g.type === 'tap') handlers.onTap?.(g)
      else if (g.type === 'hold') handlers.onHold?.(g)
      else if (g.type === 'holdMove') handlers.onHoldMove?.(g)
      else handlers.onRelease?.(g)
    }
  }
  const reset = () => {
    clearTimeout(timer)
    classifier.cancel()
    pointer = null
  }

  const down = (e: PointerEvent) => {
    if (e.button > 0 || pointer !== null) return
    if ((e.target as Element | null)?.closest?.(ignore)) return
    const p = { x: e.clientX, y: e.clientY }
    if (handlers.onPress?.(p)) return
    e.preventDefault() // no text selection / focus shuffle while dragging
    pointer = e.pointerId
    emit(classifier.down(p.x, p.y, performance.now()))
    if (el) el.setPointerCapture?.(e.pointerId)
    if (holdDelay !== undefined) timer = setTimeout(() => emit(classifier.wait(performance.now())), holdDelay)
  }
  const move = (e: PointerEvent) => {
    if (e.pointerId === pointer) emit(classifier.move(e.clientX, e.clientY, performance.now()))
  }
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return
    clearTimeout(timer)
    pointer = null
    emit(classifier.up(e.clientX, e.clientY, performance.now()))
  }
  const cancel = (e: PointerEvent) => {
    if (e.pointerId === pointer) reset()
  }
  const blockScroll = (e: TouchEvent) => {
    if (classifier.active && e.cancelable) e.preventDefault()
  }

  const prevTouchAction = el?.style.touchAction
  if (el) el.style.touchAction = 'none'
  else document.addEventListener('touchmove', blockScroll, { passive: false })
  const t = target as HTMLElement
  t.addEventListener('pointerdown', down)
  t.addEventListener('pointermove', move)
  t.addEventListener('pointerup', up)
  t.addEventListener('pointercancel', cancel)
  return () => {
    reset()
    t.removeEventListener('pointerdown', down)
    t.removeEventListener('pointermove', move)
    t.removeEventListener('pointerup', up)
    t.removeEventListener('pointercancel', cancel)
    if (el) el.style.touchAction = prevTouchAction ?? ''
    else document.removeEventListener('touchmove', blockScroll)
  }
}
