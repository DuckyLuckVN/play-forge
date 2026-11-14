// Styled tooltips for mouse users (desktop): the label of whatever is hovered, plus its keyboard
// shortcut as a key cap ("Mute microphone [M]"). One shared bubble for the whole page. It reads the
// element's `title` (setLabel keeps setting it) and moves it to `data-tip` so the browser's own grey
// tooltip never shows on top. Touch shows nothing: phones have no hover.
import { h } from './dom'
import { t } from './i18n'

/** Hover this long before the tip shows (ms), so passing over a row of buttons stays quiet. */
const DELAY = 350
const GAP = 8
/** Keys whose own glyph is too small to read on a cap: show what is printed on the physical key. */
const CAP_TEXT: Record<string, string> = { '`': '~ `' }

/**
 * The key that triggers this control, shown in its tooltip and told to screen readers. `hold` for keys
 * held down (push to talk). null clears it.
 */
export function setShortcut(el: HTMLElement, key: string | null, opts: { hold?: boolean } = {}): void {
  if (key === null) {
    delete el.dataset.key
    delete el.dataset.keyHold
    el.removeAttribute('aria-keyshortcuts')
    return
  }
  el.dataset.key = key
  if (opts.hold) el.dataset.keyHold = ''
  else delete el.dataset.keyHold
  el.setAttribute('aria-keyshortcuts', key)
}

/** The text a tip shows: a fresh `title` wins (labels change), else the one moved aside earlier. */
function labelOf(el: HTMLElement): string {
  const title = el.getAttribute('title')
  if (title) {
    el.dataset.tip = title
    el.removeAttribute('title')
  }
  return el.dataset.tip ?? ''
}

/** Install once per page. Returns the remover. */
export function installTooltips(): () => void {
  let tip: HTMLElement | null = null
  let target: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  /** The last key was Tab: focus moved because the player moved it (a menu focusing its first item does not count). */
  let tabbed = false

  const bubble = () => {
    if (!tip) {
      tip = h('div', { class: 'pf-tip', role: 'tooltip', hidden: true })
      document.body.append(tip)
    }
    return tip
  }

  const hide = () => {
    clearTimeout(timer)
    target = null
    if (tip) tip.hidden = true
  }

  const show = (el: HTMLElement) => {
    const text = labelOf(el)
    if (!text || !el.isConnected) return hide()
    const b = bubble()
    const key = el.dataset.key
    b.replaceChildren(h('span', { class: 'pf-tip-text', textContent: text }))
    if (key)
      b.append(
        h(
          'span',
          { class: 'pf-tip-keys' },
          el.dataset.keyHold !== undefined && h('span', { class: 'pf-tip-hold', textContent: t('hold') }),
          h('kbd', {
            class: CAP_TEXT[key] ? 'pf-key wide sym' : key.length > 1 ? 'pf-key wide' : 'pf-key',
            textContent: CAP_TEXT[key] ?? key,
          }),
        ),
      )
    b.hidden = false
    const r = el.getBoundingClientRect()
    const w = b.offsetWidth
    const ht = b.offsetHeight
    // A group may ask for the left side (data-tip-side="left"): the floating fan, where above would
    // cover the next button. Otherwise above, centred; below when there is no room (the top bar).
    const side = el.closest<HTMLElement>('[data-tip-side]')?.dataset.tipSide === 'left' ? 'left' : 'top'
    b.dataset.side = side
    let top: number
    let left: number
    if (side === 'left') {
      top = r.top + r.height / 2 - ht / 2
      left = r.left - w - GAP
    } else {
      const above = r.top - ht - GAP
      top = above >= GAP ? above : r.bottom + GAP
      left = r.left + r.width / 2 - w / 2
    }
    b.style.top = `${Math.max(GAP, top)}px`
    b.style.left = `${Math.min(Math.max(GAP, left), window.innerWidth - w - GAP)}px`
  }

  const tipped = (node: EventTarget | null) =>
    (node as Element | null)?.closest?.<HTMLElement>('[title], [data-tip]') ?? null

  const onOver = (e: Event) => {
    if ((e as PointerEvent).pointerType !== 'mouse') return
    const el = tipped(e.target)
    if (!el || el === target) return
    labelOf(el) // take the title now, before the browser shows its own
    target = el
    clearTimeout(timer)
    timer = setTimeout(() => target === el && show(el), DELAY)
  }
  const onOut = (e: Event) => {
    if (!target) return
    const to = (e as PointerEvent).relatedTarget as Node | null
    if (to && target.contains(to)) return
    hide()
  }
  // Keyboard users get the tip at once on the control they tab to.
  const onFocus = (e: Event) => {
    const el = tipped(e.target)
    if (!tabbed || !el || !el.matches(':focus-visible')) return
    target = el
    show(el)
  }
  const onKey = (e: KeyboardEvent) => {
    tabbed = e.key === 'Tab'
    if (e.key === 'Escape') hide()
  }
  const onPress = () => {
    tabbed = false
    hide()
  }

  const on: [EventTarget, string, EventListener, boolean?][] = [
    [document, 'pointerover', onOver],
    [document, 'pointerout', onOut],
    [document, 'pointerdown', onPress, true],
    [document, 'focusin', onFocus],
    [document, 'focusout', hide],
    [window, 'scroll', hide, true],
    [window, 'blur', hide],
    [window, 'keydown', onKey as EventListener, true],
  ]
  for (const [where, type, fn, capture] of on) where.addEventListener(type, fn, capture)
  return () => {
    for (const [where, type, fn, capture] of on) where.removeEventListener(type, fn, capture)
    hide()
    tip?.remove()
  }
}
