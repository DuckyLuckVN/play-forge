// Fullscreen toggle for the top bar. Uses the standard Fullscreen API with the
// webkit-prefixed fallback (older Safari / iPad). iPhone Safari has no element
// fullscreen, so the button hides there; Add to Home Screen covers it instead.
import { t } from './i18n'
import { icon, iconButton, setLabel } from './dom'
import { icons } from './icons'

/** The parts of an element used to enter fullscreen (standard + webkit). */
export interface FullscreenTarget {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>
  webkitRequestFullscreen?: () => void
}

/** The parts of `document` used here, so tests can pass a stub. */
export interface FullscreenDoc {
  documentElement: FullscreenTarget
  fullscreenEnabled?: boolean
  webkitFullscreenEnabled?: boolean
  fullscreenElement?: Element | null
  webkitFullscreenElement?: Element | null
  exitFullscreen?: () => Promise<void>
  webkitExitFullscreen?: () => void
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

const CHANGE_EVENTS = ['fullscreenchange', 'webkitfullscreenchange']
const defaultDoc = () => document as unknown as FullscreenDoc

/** True when the page can go fullscreen (false on iPhone Safari and in some iframes). */
export function isFullscreenSupported(doc: FullscreenDoc = defaultDoc()): boolean {
  return Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled)
}

export function isFullscreen(doc: FullscreenDoc = defaultDoc()): boolean {
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement)
}

/**
 * Enters fullscreen on the whole page, or leaves it. Must run from a user
 * gesture. Never rejects: a refusal (no gesture, permissions) just leaves
 * the page as it was.
 */
export async function toggleFullscreen(doc: FullscreenDoc = defaultDoc()): Promise<void> {
  try {
    if (isFullscreen(doc)) {
      await (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.())
    } else {
      const el = doc.documentElement
      await (el.requestFullscreen
        ? el.requestFullscreen({ navigationUI: 'hide' })
        : el.webkitRequestFullscreen?.())
    }
  } catch {
    // Refused: nothing to undo.
  }
}

/** Calls `fn` whenever fullscreen starts or ends. Returns an unsubscribe. */
export function onFullscreenChange(fn: () => void, doc: FullscreenDoc = defaultDoc()): () => void {
  for (const type of CHANGE_EVENTS) doc.addEventListener(type, fn)
  return () => {
    for (const type of CHANGE_EVENTS) doc.removeEventListener(type, fn)
  }
}

/** Top-bar icon button that toggles fullscreen; hidden where unsupported. */
export function fullscreenButton(doc: FullscreenDoc = defaultDoc()): HTMLButtonElement {
  const button = iconButton(icons.fullscreen, t('Full screen'), () => {
    void toggleFullscreen(doc)
    button.blur() // Space / Enter go to the game, not this button.
  })
  button.hidden = !isFullscreenSupported(doc)
  onFullscreenChange(() => {
    const on = isFullscreen(doc)
    button.replaceChildren(icon(on ? icons.fullscreenExit : icons.fullscreen))
    setLabel(button, t(on ? 'Exit full screen' : 'Full screen'))
  }, doc)
  return button
}
