import { h, type Child } from './dom'

// On phones popovers open as bottom sheets (base.css). Publish the on-screen
// keyboard's height (--pf-kb) and the visible height (--pf-vh) so a sheet
// with a text field (chat) stays above the keyboard.
if (typeof window !== 'undefined' && window.visualViewport) {
  const vv = window.visualViewport
  const sync = () => {
    const root = document.documentElement.style
    root.setProperty('--pf-kb', `${Math.max(0, innerHeight - vv.height - vv.offsetTop)}px`)
    root.setProperty('--pf-vh', `${vv.height}px`)
  }
  vv.addEventListener('resize', sync)
  vv.addEventListener('scroll', sync)
  sync()
}

export interface PopoverOptions {
  /** The button that opens and closes the panel. */
  button: HTMLButtonElement
  /** Accessible name of the panel. */
  label: string
  /** Extra classes on the panel, e.g. 'pf-lang-pop'. */
  class?: string
  role?: 'dialog' | 'group'
  /** After opening, e.g. to move focus into the panel. */
  onOpen?(): void
  /** After any open or close. */
  onToggle?(open: boolean): void
}

export interface Popover {
  /** Wrapper holding the button and panel; put this in the page. */
  root: HTMLElement
  panel: HTMLElement
  readonly isOpen: boolean
  open(): void
  close(): void
  /** Remove the document listeners (for menus that live shorter than the page). */
  destroy(): void
}

/**
 * A button with a floating panel under it (top-bar menus). Closes on a click
 * outside or Esc (which returns focus to the button). One implementation so
 * every menu behaves and reads the same to screen readers.
 */
export function popover(opts: PopoverOptions, ...children: Child[]): Popover {
  const { button } = opts
  const role = opts.role ?? 'dialog'
  const panel = h('div', { class: `pf-popover ${opts.class ?? ''}`.trim() }, ...children)
  panel.setAttribute('role', role)
  panel.setAttribute('aria-label', opts.label)
  panel.hidden = true
  button.setAttribute('aria-haspopup', role === 'dialog' ? 'dialog' : 'true')
  const root = h('div', { class: 'pf-popover-anchor' }, button, panel)

  // `hidden` is typed string | boolean ('until-found'); we only use booleans.
  const isOpen = () => panel.hidden !== true
  const set = (open: boolean) => {
    if (open === isOpen()) return
    panel.hidden = !open
    button.setAttribute('aria-expanded', String(open))
    button.classList.toggle('on', open)
    if (open) opts.onOpen?.()
    opts.onToggle?.(open)
  }
  button.setAttribute('aria-expanded', 'false')
  button.addEventListener('click', () => set(!isOpen()))
  const onPointer = (e: PointerEvent) => {
    if (isOpen() && !root.contains(e.target as Node)) set(false)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen()) {
      e.stopPropagation()
      set(false)
      button.focus()
    }
  }
  document.addEventListener('pointerdown', onPointer)
  document.addEventListener('keydown', onKey)

  return {
    root,
    panel,
    get isOpen() {
      return isOpen()
    },
    open: () => set(true),
    close: () => set(false),
    destroy() {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    },
  }
}
