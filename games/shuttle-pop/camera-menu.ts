import { h, icon, setLabel } from '@forge/ui/dom'
import { dropdown } from '@forge/ui/dropdown'
import { icons } from '@forge/ui/icons'
import { guardGameKeys } from '@forge/ui/key-guard'
import { popover } from '@forge/ui/popover'
import { slider } from '@forge/ui/slider'
import { t } from './i18n'
import { RING_MODES, type RingMode } from './landing'
import { GRAPHICS_PREFS, type GraphicsPref } from './look'
import { fromStep, prefs, stepLabel, toStep, TWEAK_STEPS, type SpPrefs } from './prefs'
import { NO_TWEAK } from './world'

/** Names of the view settings (English keys), shared with the tutorial's "Make it yours" card. */
export const SETTING_LABELS = {
  ring: 'Landing ring',
  autoSwing: 'Auto swing (Jump / Dive)',
  graphics: 'Graphics',
} as const

const RING_LABELS: Record<RingMode, string> = { hidden: 'Hidden', near: 'Near drop', always: 'Always' }
const PATH_LABELS: Record<RingMode, string> = { hidden: 'Off', near: 'Near drop', always: 'Always' }
const GRAPHICS_LABELS: Record<GraphicsPref, string> = {
  auto: 'Auto',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Ultra',
}

/**
 * A pref picked from a few values: the engine's segmented radiogroup markup (engine/ui/options.ts).
 * Updates in place on pref changes, so focus stays on the pressed segment. `cls` = the row's extra class.
 */
function segmentedPref<K extends keyof SpPrefs>(
  key: K,
  label: string,
  choices: readonly { value: SpPrefs[K]; text: string }[],
  cls: string,
): HTMLElement {
  const group = h('div', { class: 'pf-segmented', role: 'radiogroup' } as never)
  group.setAttribute('aria-label', label)
  const segs = choices.map(({ value, text }) => {
    const b = h('button', { type: 'button', class: 'pf-segment', textContent: text })
    b.setAttribute('role', 'radio')
    b.onclick = () => prefs.set({ [key]: value } as Partial<SpPrefs>)
    group.append(b)
    return { value, b }
  })
  const sync = (now: SpPrefs[K]) => {
    for (const { value, b } of segs) {
      b.classList.toggle('on', value === now)
      b.setAttribute('aria-checked', String(value === now))
    }
  }
  sync(prefs.get()[key])
  prefs.onChange((p) => sync(p[key]))
  return h(
    'div',
    { class: `pf-option ${cls}` },
    h('span', { class: 'pf-option-label', textContent: label }),
    group,
  )
}

/** A setting with this many choices or more is a dropdown; fewer stay a segmented row. */
const DROPDOWN_FROM = 4

/**
 * A pref picked from a list: a segmented row for a few choices, a dropdown (engine/ui/dropdown.ts) from
 * DROPDOWN_FROM on. Either way it saves on pick and follows changes made elsewhere.
 */
function choicePref<K extends keyof SpPrefs>(
  key: K,
  label: string,
  choices: readonly { value: SpPrefs[K]; text: string }[],
  cls: string,
): HTMLElement {
  if (choices.length < DROPDOWN_FROM) return segmentedPref(key, label, choices, cls)
  // Dropdown values are strings; map back to the pref's own values by position.
  const ids = choices.map((_, i) => String(i))
  const idOf = (v: SpPrefs[K]) =>
    String(
      Math.max(
        0,
        choices.findIndex((c) => c.value === v),
      ),
    )
  const menu = dropdown({
    label,
    choices: choices.map((c, i) => ({ value: ids[i], text: c.text })),
    value: idOf(prefs.get()[key]),
    onChange: (id) => prefs.set({ [key]: choices[Number(id)].value } as Partial<SpPrefs>),
  })
  prefs.onChange((p) => menu.set(idOf(p[key])))
  return h(
    'div',
    { class: `pf-option ${cls}` },
    h('span', { class: 'pf-option-label', textContent: label }),
    menu.root,
  )
}

/** When does the landing ring show. */
const ringPicker = (): HTMLElement =>
  segmentedPref(
    'ring',
    t(SETTING_LABELS.ring),
    RING_MODES.map((mode) => ({ value: mode, text: t(RING_LABELS[mode]) })),
    'sp-ring-row',
  )

/** When does the flight path of shots coming to me show (default off). */
const pathPicker = (): HTMLElement =>
  segmentedPref(
    'path',
    t('Flight path'),
    RING_MODES.map((mode) => ({ value: mode, text: t(PATH_LABELS[mode]) })),
    'sp-path-row',
  )

/** Does the Jump / Dive button also swing by itself (default off: the player swings). */
const autoSwingPicker = (): HTMLElement =>
  segmentedPref(
    'autoSwing',
    t(SETTING_LABELS.autoSwing),
    [
      { value: false, text: t('Off') },
      { value: true, text: t('On') },
    ],
    'sp-auto-row',
  )

/** Name tags over the players (nametags.ts): Show (default) / Hide. */
const nameTagsPicker = (): HTMLElement =>
  segmentedPref(
    'nameTags',
    t('Name tags'),
    [
      { value: true, text: t('Show') },
      { value: false, text: t('Hide') },
    ],
    'sp-tags-row',
  )

/** Graphics look: Auto (steps down by itself when frames run slow) or a pinned Low … Ultra (a dropdown). */
const graphicsPicker = (): HTMLElement =>
  choicePref(
    'graphics',
    t(SETTING_LABELS.graphics),
    GRAPHICS_PREFS.map((g) => ({ value: g, text: t(GRAPHICS_LABELS[g]) })),
    'sp-graphics-row',
  )

/**
 * The panel body of the view-settings menu: height and tilt of the player's own camera, when the
 * landing ring shows, whether Jump / Dive swing by themselves, name tags and the graphics look. Saved in this browser (prefs.ts) and applied live by the renderer; sliders show
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
  return {
    nodes: [
      height.row,
      tilt.row,
      reset,
      ringPicker(),
      pathPicker(),
      autoSwingPicker(),
      nameTagsPicker(),
      graphicsPicker(),
      note,
    ],
  }
}

/**
 * A small settings (sliders) button in the top-right corner of `view` (the game's stage: main.ts
 * stageExtras, so it is there on the menu, in a match and over the pause screen) that opens the
 * view-settings panel below it. The view takes every pointer as a swing / stick, so the overlay keeps its own pointer
 * events to itself, and while the panel is open a press outside only closes it (never swings).
 * While open, a capture guard keeps key press (except Esc/Tab, never a release) away from the game's window listeners.
 * Focus never stays on the button after closing, so Space keeps swinging.
 */
export function mountCameraButton(view: HTMLElement): { root: HTMLElement; destroy(): void } {
  const button = h('button', { class: 'pf-btn icon', type: 'button' })
  setLabel(button, t('View settings'))
  button.append(icon(icons.settings))
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
  let unguard = () => {}
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
          unguard = guardGameKeys()
          menu.root.addEventListener('focusout', onFocusOut)
        } else {
          document.removeEventListener('pointerdown', swallowOutside, true)
          unguard()
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
      unguard()
      document.removeEventListener('keydown', onEsc)
      menu.destroy()
      root.remove()
    },
  }
}
