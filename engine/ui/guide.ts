// Control guide: "how to play" rows with keycaps and mouse / touch icons instead of a paragraph.
// Games describe their controls as GuideSteps (GameAppOptions.guide); the shell shows them on the
// start screen, the pause screen and, once per game, before the first match.
import { prefersTouch } from '../core/device'
import { button } from './components'
import { h, icon } from './dom'
import { t } from './i18n'
import { inputIcons } from './icons'

/** A key held rather than tapped, e.g. { key: 'Space', hold: true } (beside tap keys in one combo). */
export interface KeySpec {
  key: string
  hold?: boolean
}
/** Keys pressed as one group, shown side by side, e.g. ['W', 'A', 'S', 'D'] or ['Space']. */
export type KeyCombo = (string | KeySpec)[]
export type MouseAction = 'click' | 'hold' | 'drag' | 'scroll' | 'right'
export type TouchAction = 'tap' | 'doubleTap' | 'hold' | 'swipe' | 'swipeUp' | 'drag' | 'dragLeft' | 'button'

/**
 * One control. Desktop shows `keys` (combos joined by "or") and `mouse`; touch screens show `touch`.
 * A step with nothing for the current device is hidden, so desktop-only and touch-only steps mix.
 * Text is already translated by the game.
 */
export interface GuideStep {
  action: string
  keys?: KeyCombo[]
  mouse?: MouseAction
  touch?: TouchAction
  /** Short text beside the touch icon, e.g. "left side". */
  touchLabel?: string
  /** Held rather than pressed: every input in the row (keys, mouse, touch) gets a "hold" tag. */
  hold?: boolean
  /** A smaller line under the action, e.g. "Let go to hit". */
  note?: string
  /** A rule or hint rather than a control (e.g. "Step on the beat"): shown on every device, inputs or not. */
  tip?: boolean
}

export interface Keycap {
  text: string
  /** Read out instead of `text` (arrow glyphs). */
  spoken?: string
  /** Held: drawn with a "hold" tag and read out as "hold <key>". */
  hold?: boolean
}

export type GuideInput =
  | { kind: 'keys'; keys: Keycap[] }
  | { kind: 'or' }
  | { kind: 'mouse'; action: MouseAction; hold: boolean }
  | { kind: 'touch'; action: TouchAction; label?: string; hold: boolean }

export interface GuideRow {
  action: string
  note?: string
  hold: boolean
  inputs: GuideInput[]
}

const ARROWS: Record<string, [glyph: string, spoken: () => string]> = {
  Up: ['↑', () => t('Up arrow')],
  Down: ['↓', () => t('Down arrow')],
  Left: ['←', () => t('Left arrow')],
  Right: ['→', () => t('Right arrow')],
}

/** A key name as printed on its cap: arrows become glyphs, everything else stays as written. */
export function keycap(name: string, hold = false): Keycap {
  const arrow = ARROWS[name]
  const cap: Keycap = arrow ? { text: arrow[0], spoken: arrow[1]() } : { text: name }
  if (hold) cap.hold = true
  return cap
}

/** The rows to show on this device, with "or" between alternatives. */
export function guideRows(steps: readonly GuideStep[], touch: boolean): GuideRow[] {
  const rows: GuideRow[] = []
  for (const s of steps) {
    const alts: GuideInput[] = []
    if (touch) {
      if (s.touch) alts.push({ kind: 'touch', action: s.touch, label: s.touchLabel, hold: !!s.hold })
    } else {
      for (const combo of s.keys ?? []) {
        const keys = combo.map((k) =>
          typeof k === 'string' ? keycap(k, !!s.hold) : keycap(k.key, s.hold || k.hold),
        )
        if (keys.length) alts.push({ kind: 'keys', keys })
      }
      if (s.mouse) alts.push({ kind: 'mouse', action: s.mouse, hold: !!s.hold })
    }
    // A step whose inputs are all for the other device hides; a tip shows everywhere.
    if (!alts.length && !s.tip) continue
    const inputs = alts.flatMap((a, i): GuideInput[] => (i ? [{ kind: 'or' }, a] : [a]))
    rows.push({ action: s.action, note: s.note, hold: !!s.hold, inputs })
  }
  return rows
}

/** The shell's default pause keys (KeyboardEvent.code). */
export const PAUSE_KEYS: readonly string[] = ['Escape', 'KeyP']

/** A key code's keycap label: Escape → Esc, KeyP → P. */
const keyLabel = (code: string): string => (code === 'Escape' ? 'Esc' : code.replace(/^Key/, ''))

/** The game's steps plus the shell's own Pause row (its pause keys, default Esc / P; keyboards only). */
export function withPauseRow(steps: readonly GuideStep[], keys: readonly string[] = PAUSE_KEYS): GuideStep[] {
  return [...steps, { action: t('Pause'), keys: keys.map((k) => [keyLabel(k)]) }]
}

/**
 * What the start and pause screens show for a game's controls: the guide button when it has guide
 * steps, else its old `controls` paragraph (games not yet converted), else nothing.
 */
export function howToPlayMode(guide?: readonly GuideStep[], controls?: string): 'guide' | 'text' | null {
  return guide?.length ? 'guide' : controls ? 'text' : null
}

// ---------- First-play flag ----------

const SEEN_PREFIX = 'play-forge:guide-seen:'
/** Also remembered in memory, so a page without storage still shows the guide only once. */
const seenThisPage = new Set<string>()

type FlagStorage = Pick<Storage, 'getItem' | 'setItem'>
const storage = (): FlagStorage | undefined => globalThis.localStorage

/** Has this player already seen game `id`'s guide? (Unreadable storage counts as not seen.) */
export function guideSeen(id: string, store: FlagStorage | undefined = storage()): boolean {
  if (seenThisPage.has(id)) return true
  try {
    return store?.getItem(SEEN_PREFIX + id) === '1'
  } catch {
    return false
  }
}

export function markGuideSeen(id: string, store: FlagStorage | undefined = storage()): void {
  seenThisPage.add(id)
  try {
    store?.setItem(SEEN_PREFIX + id, '1')
  } catch {
    // storage unavailable: remembered for this page only
  }
}

/** Test hook: forget the in-memory flags. */
export function resetGuideMemory(): void {
  seenThisPage.clear()
}

// ---------- Rendering ----------

const mouseSpoken = (a: MouseAction): string => {
  switch (a) {
    case 'click':
      return t('Click')
    case 'hold':
      return t('Hold the mouse button')
    case 'drag':
      return t('Drag with the mouse')
    case 'scroll':
      return t('Scroll')
    case 'right':
      return t('Right-click')
  }
}

const touchSpoken = (a: TouchAction): string => {
  switch (a) {
    case 'tap':
      return t('Tap')
    case 'doubleTap':
      return t('Double-tap')
    case 'hold':
      return t('Touch and hold')
    case 'swipe':
      return t('Swipe')
    case 'swipeUp':
      return t('Swipe up')
    case 'drag':
      return t('Drag')
    case 'dragLeft':
      return t('Drag on the left side')
    case 'button':
      return t('Tap the button')
  }
}

/** The visible name of the mouse button an action uses (none for the wheel). */
const mouseLabel = (a: MouseAction): string | undefined => {
  switch (a) {
    case 'click':
    case 'hold':
      return t('Left click')
    case 'right':
      return t('Right click')
    case 'drag':
      return t('Left drag')
    case 'scroll':
      return undefined
  }
}

const MOUSE_ICON: Record<MouseAction, string> = {
  click: inputIcons.mouseClick,
  hold: inputIcons.mouseClick,
  drag: inputIcons.mouseDrag,
  scroll: inputIcons.mouseScroll,
  right: inputIcons.mouseRight,
}
const TOUCH_ICON: Record<TouchAction, string> = {
  tap: inputIcons.tap,
  doubleTap: inputIcons.doubleTap,
  hold: inputIcons.touchHold,
  swipe: inputIcons.swipe,
  swipeUp: inputIcons.swipeUp,
  drag: inputIcons.stick,
  dragLeft: inputIcons.leftSide,
  button: inputIcons.touchButton,
}

/** Text for screen readers only (the icon beside it is aria-hidden). */
const spoken = (text: string) => h('span', { class: 'pf-sr', textContent: text })

function keyEl(k: Keycap): HTMLElement {
  const kbd = h('kbd', { class: k.text.length > 1 ? 'pf-key wide' : 'pf-key' })
  if (!k.spoken && !k.hold) {
    kbd.textContent = k.text
    return kbd
  }
  const glyph = h('span', { textContent: k.text })
  glyph.setAttribute('aria-hidden', 'true')
  const said = k.spoken ?? k.text
  kbd.append(glyph, spoken(k.hold ? `${t('hold')} ${said}` : said))
  return kbd
}

/**
 * A held input: a "HOLD" tag fused to the left of the input, one chip, so "HOLD Space or HOLD J"
 * reads per key. The tag is visual only; screen readers get "hold" from the input's own text.
 */
function heldChip(...content: (HTMLElement | false)[]): HTMLElement {
  const tag = h('span', { class: 'pf-guide-hold', textContent: t('hold') })
  tag.setAttribute('aria-hidden', 'true')
  return h('span', { class: 'pf-held' }, tag, ...content)
}

/** Keys: a group of held keys shares one tag; a mixed group tags each held key on its own. */
function keysEl(keys: Keycap[]): HTMLElement {
  if (keys.every((k) => k.hold)) return heldChip(h('span', { class: 'pf-keys' }, ...keys.map(keyEl)))
  return h(
    'span',
    { class: 'pf-keys' },
    ...keys.map((k) => (k.hold ? heldChip(h('span', { class: 'pf-keys' }, keyEl(k))) : keyEl(k))),
  )
}

function inputEl(input: GuideInput): HTMLElement {
  switch (input.kind) {
    case 'keys':
      return keysEl(input.keys)
    case 'or':
      return h('span', { class: 'pf-guide-or', textContent: t('or') })
    case 'mouse':
      return iconEl(
        MOUSE_ICON[input.action],
        mouseSpoken(input.action),
        input.hold,
        mouseLabel(input.action),
        'pf-guide-mouse',
      )
    case 'touch':
      return iconEl(TOUCH_ICON[input.action], touchSpoken(input.action), input.hold, input.label)
  }
}

/** Mouse / touch input: icon plus its label or spoken name; held ones sit in a hold chip, read "hold …". */
function iconEl(
  svg: string,
  said: string,
  hold: boolean,
  label?: string,
  labelCls = 'pf-guide-touch',
): HTMLElement {
  const el = h(
    'span',
    { class: 'pf-guide-icon' },
    icon(svg),
    label ? h('span', { class: labelCls, textContent: label }) : spoken(hold ? `${t('hold')} ${said}` : said),
  )
  if (!hold) return el
  // A visible label replaces the spoken name, so the hold cue is read out on its own.
  return heldChip(label ? spoken(t('hold')) : false, el)
}

/** The list of control rows for this device (default: touch screens get touch rows). */
export function guideList(steps: readonly GuideStep[], touch = prefersTouch()): HTMLElement {
  return h(
    'ul',
    { class: 'pf-guide' },
    ...guideRows(steps, touch).map((row) =>
      h(
        'li',
        { class: 'pf-guide-row' },
        h(
          'span',
          { class: 'pf-guide-action' },
          row.action,
          row.note && h('small', { class: 'pf-guide-note', textContent: row.note }),
        ),
        h('span', { class: 'pf-guide-inputs' }, ...row.inputs.map(inputEl)),
      ),
    ),
  )
}

/** Title plus rows, e.g. inline in a room panel. */
export function guideCard(steps: readonly GuideStep[], touch = prefersTouch()): HTMLElement {
  return h(
    'section',
    { class: 'pf-guide-card' },
    h('h2', { class: 'pf-guide-title', textContent: t('How to play') }),
    guideList(steps, touch),
  )
}

export interface OpenGuideOptions {
  /** Runs once when the card closes (button, Enter / Space / Esc, or a tap anywhere). */
  onClose?: () => void
  touch?: boolean
}

/**
 * Shows the guide as a modal card over everything under the top bar. Keys pressed while it is open
 * don't reach the game or the shell (Esc closes the card, it doesn't pause). Returns a close function.
 */
export function openGuide(steps: readonly GuideStep[], opts: OpenGuideOptions = {}): () => void {
  const before = document.activeElement as HTMLElement | null
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    window.removeEventListener('keydown', onKey, true)
    layer.remove()
    before?.focus?.({ preventScroll: true })
    opts.onClose?.()
  }
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
      e.preventDefault()
      close()
    }
  }
  const ok = button(t('Got it'), close, 'primary wide')
  const card = h('div', { class: 'pf-panel pf-guide-panel enter' }, guideCard(steps, opts.touch), ok)
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-modal', 'true')
  card.setAttribute('aria-label', t('How to play'))
  // Only a click on the backdrop itself closes (a click inside the card keeps it open).
  const layer = h('div', { class: 'pf-guide-layer' }, card)
  layer.onclick = (e) => {
    if (e.target === layer) close()
  }
  document.body.append(layer)
  window.addEventListener('keydown', onKey, true)
  ok.focus({ preventScroll: true })
  return close
}

/** A "How to play" button that opens the guide card. */
export function guideButton(steps: readonly GuideStep[]): HTMLButtonElement {
  const b = h('button', { class: 'pf-btn sm pf-guide-btn', type: 'button', onclick: () => openGuide(steps) })
  b.append(icon(inputIcons.keyboard), h('span', { textContent: t('How to play') }))
  return b
}
