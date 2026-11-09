// Landscape-only games on phones: a "Rotate your phone" card over the stage while a touch screen is
// held upright, and a landscape orientation lock whenever the page goes fullscreen (Android Chrome;
// iOS and desktops refuse, which is fine). Mouse devices are never blocked.
import { h, icon } from './dom'
import { isFullscreen, onFullscreenChange } from './fullscreen'
import { t } from './i18n'

/** True when a touch (coarse-pointer) screen is taller than wide. Square counts as landscape. */
export function needsRotate(w: number, h: number, coarsePointer: boolean): boolean {
  return coarsePointer && h > w
}

/** The parts of `window` the portrait watcher reads, so tests can pass a stub. */
export interface PortraitWindow {
  innerWidth: number
  innerHeight: number
  matchMedia(query: string): { matches: boolean }
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

const ROTATE_EVENTS = ['resize', 'orientationchange']

/**
 * Calls `onChange(portrait)` now, then whenever a rotation or resize flips the answer. The pointer
 * is re-read each time (a tablet can gain or lose its mouse). Returns the stop function.
 */
export function watchPortrait(
  onChange: (portrait: boolean) => void,
  win: PortraitWindow = window,
): () => void {
  let last: boolean | null = null
  const check = () => {
    const now = needsRotate(win.innerWidth, win.innerHeight, win.matchMedia('(pointer: coarse)').matches)
    if (now === last) return
    last = now
    onChange(now)
  }
  for (const type of ROTATE_EVENTS) win.addEventListener(type, check)
  check()
  return () => {
    for (const type of ROTATE_EVENTS) win.removeEventListener(type, check)
  }
}

/** The part of `screen.orientation` used here (`lock` is missing on iOS Safari). */
export interface OrientationLock {
  lock?: (orientation: 'landscape') => Promise<void>
}

/** Best-effort landscape lock; refusals (not fullscreen, unsupported) are ignored. */
export function lockLandscape(orientation: OrientationLock | undefined): void {
  try {
    orientation?.lock?.('landscape')?.catch(() => {})
  } catch {
    // Older browsers throw instead of rejecting.
  }
}

// A phone outline turning a quarter to its side (see .pf-rotate-icon in landscape.css).
const PHONE_SVG =
  '<svg viewBox="0 0 48 48" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="15" y="6" width="18" height="36" rx="4"/><path d="M21 37h6"/></svg>'

/**
 * Shows the rotate card over `stage` while a touch phone is upright and tries the landscape lock
 * when fullscreen starts. `onChange(portrait)` runs at once and on every flip (pause the game,
 * let go of held controls). Returns the cleanup, which removes the card and every listener.
 */
export function landscapeGuard(stage: HTMLElement, onChange: (portrait: boolean) => void): () => void {
  const card = h(
    'div',
    { class: 'pf-rotate', role: 'status', hidden: true },
    h(
      'div',
      { class: 'pf-rotate-card' },
      icon(PHONE_SVG, 'pf-rotate-icon'),
      h('p', { class: 'pf-rotate-title', textContent: t('Rotate your phone') }),
      h('p', { class: 'pf-rotate-hint', textContent: t('This game plays sideways.') }),
    ),
  )
  stage.append(card)
  const stopWatch = watchPortrait((portrait) => {
    card.hidden = !portrait
    onChange(portrait)
  })
  const lockIfFull = () => {
    if (isFullscreen()) lockLandscape(screen.orientation as OrientationLock | undefined)
  }
  lockIfFull()
  const stopFull = onFullscreenChange(lockIfFull)
  return () => {
    stopWatch()
    stopFull()
    card.remove()
  }
}
