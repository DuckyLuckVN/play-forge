import { h, icon, setLabel } from '@forge/ui/dom'
import { icons } from '@forge/ui/icons'
import { popover } from '@forge/ui/popover'
import { slider } from '@forge/ui/slider'
import { t } from './i18n'
import { RING_MODES, type RingMode } from './landing'
import { fromStep, prefs, stepLabel, toStep, TWEAK_STEPS } from './prefs'
import { NO_TWEAK } from './world'

const RING_LABELS: Record<RingMode, string> = { hidden: 'Hidden', near: 'Near drop', always: 'Always' }

/**
 * The "when does the landing ring show" row: the engine's segmented radiogroup markup
 * (engine/ui/options.ts). Updates in place on pref changes, so focus stays on the pressed segment.
 */
function ringPicker(): HTMLElement {
  const group = h('div', { class: 'pf-segmented', role: 'radiogroup' } as never)
  group.setAttribute('aria-label', t('Landing ring'))
  const segs = RING_MODES.map((mode) => {
    const b = h('button', { type: 'button', class: 'pf-segment', textContent: t(RING_LABELS[mode]) })
    b.setAttribute('role', 'radio')
    b.onclick = () => prefs.set({ ring: mode })
    group.append(b)
    return { mode, b }
  })
  const sync = (ring: RingMode) => {
    for (const { mode, b } of segs) {
      b.classList.toggle('on', mode === ring)
      b.setAttribute('aria-checked', String(mode === ring))
    }
  }
  sync(prefs.get().ring)
  prefs.onChange((p) => sync(p.ring))
  return h(
    'div',
    { class: 'pf-option sp-ring-row' },
    h('span', { class: 'pf-option-label', textContent: t('Landing ring') }),
    group,
  )
}

/**
 * The panel body of the view-settings menu: height and tilt of the player's own camera and when the
 * landing ring shows. Saved in this browser (prefs.ts) and applied live by the renderer; sliders show
 * the raw saved value, the court-framing clamp is applied at render time.
 */
export function viewPanel(): { nodes: HTMLElement[] } {
  const axis = (key: 'height' | 'tilt', label: string, ariaLabel: string) =>
    slider({
      label,
      ariaLabel,
      min: -TWEAK_STEPS,
      max: TWEAK_STEPS,
      step: 1,
      value: toStep(prefs.get().camera[key]),
      format: stepLabel,
      onInput: (s) => prefs.set({ camera: { ...prefs.get().camera, [key]: fromStep(s) } }),
    })
  const height = axis('height', t('Height'), t('Camera height'))
  const tilt = axis('tilt', t('Tilt'), t('Camera tilt'))
  const note = h('p', { class: 'pf-note', textContent: t('Only changes your own screen.') })
  const reset = h('button', { class: 'pf-btn wide', type: 'button', textContent: t('Reset camera') })
  reset.onclick = () => prefs.set({ camera: { ...NO_TWEAK } })
  prefs.onChange((p) => {
    height.set(toStep(p.camera.height))
    tilt.set(toStep(p.camera.tilt))
  })
  return { nodes: [height.row, tilt.row, reset, ringPicker(), note] }
}

/**
 * A small camera button over the top-right of the game view (`view`) that opens the view-settings panel
 * below it. The view takes every pointer as a swing / stick, so the overlay keeps its own pointer
 * events to itself, and while the panel is open a press outside only closes it (never swings).
 * While open, a capture guard keeps key press (except Esc/Tab, never a release) away from the game's window listeners.
 * Focus never stays on the button after closing, so Space keeps swinging.
 */
export function mountCameraButton(view: HTMLElement): { root: HTMLElement; destroy(): void } {
  const button = h('button', { class: 'pf-btn icon', type: 'button' })
  setLabel(button, t('View settings'))
  button.append(icon(icons.camera))
  const panel = viewPanel()
  const root = h('div', { class: 'sp-cam' })

  const blurIfHere = () => {
    if (root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
  }
  // Capture, on the document: runs before the view's own pointer handlers.
  const swallowOutside = (e: PointerEvent) => {
    if (root.contains(e.target as Node)) return
    e.stopPropagation()
    menu.close()
  }
  // While open no key PRESS reaches the game (window listeners in input.ts), wherever
  // focus is. Capture, no preventDefault: sliders and buttons keep their native keys; Esc/Tab stay for
  // the popover. Never keyup: a key held before opening must still release (else stuck movement /
  // charged swing / live push-to-talk mic).
  const guardKeys = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Tab') return
    e.stopPropagation()
  }
  // Tabbing out of the panel (e.g. to chat) closes it so the guard never blocks keys elsewhere.
  const onFocusOut = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null
    if (to && !root.contains(to)) menu.close()
  }
  const menu = popover(
    {
      button,
      label: t('View settings'),
      class: 'sp-cam-pop',
      // The panel itself, not a control: Space must not press Reset.
      onOpen: () => menu.panel.focus({ preventScroll: true }),
      onToggle: (open) => {
        if (open) {
          document.addEventListener('pointerdown', swallowOutside, true)
          window.addEventListener('keydown', guardKeys, true)
          menu.root.addEventListener('focusout', onFocusOut)
        } else {
          document.removeEventListener('pointerdown', swallowOutside, true)
          window.removeEventListener('keydown', guardKeys, true)
          menu.root.removeEventListener('focusout', onFocusOut)
          blurIfHere()
        }
      },
    },
    ...panel.nodes,
  )
  menu.panel.tabIndex = -1
  menu.panel.classList.add('sp-cam-panel')
  // After the popover's own Esc handler (which refocuses the button): let go of focus.
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !menu.isOpen) blurIfHere()
  }
  document.addEventListener('keydown', onEsc)
  for (const type of ['pointerdown', 'pointerup', 'pointercancel']) {
    root.addEventListener(type, (e) => e.stopPropagation())
  }
  root.append(menu.root)
  view.append(root)
  return {
    root,
    destroy() {
      document.removeEventListener('pointerdown', swallowOutside, true)
      window.removeEventListener('keydown', guardKeys, true)
      document.removeEventListener('keydown', onEsc)
      menu.destroy()
      root.remove()
    },
  }
}
