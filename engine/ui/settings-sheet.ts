// One place for every setting: a ⚙ button opening a modal sheet with tabs (Sound, Language, Voice, the
// game's own). A centred card on wide screens, a bottom sheet on phones (CSS). While it is open no game
// key gets through (Space must not swing behind it) and Esc closes the sheet, not the pause menu.
import { h, iconButton } from './dom'
import { t } from './i18n'
import { icons } from './icons'
import { guardGameKeys } from './key-guard'

export interface SettingsTab {
  id: string
  /** Already translated. */
  label: string
  /** Called each time the tab is shown, so it draws fresh state. */
  body: () => HTMLElement
}

export interface SettingsSheet {
  /** The ⚙ icon button that opens the sheet. */
  button: HTMLButtonElement
  open(tabId?: string): void
  close(): void
  readonly isOpen: boolean
  /** Replace the tabs (e.g. Voice comes and goes with a room); keeps the current tab if still there. */
  setTabs(tabs: SettingsTab[]): void
}

const TAB_KEY = 'play-forge:settings-tab'
/** Push-to-talk still works with the sheet open. */
const PASS_KEYS = ['KeyV']

function savedTab(): string | null {
  try {
    return localStorage.getItem(TAB_KEY)
  } catch {
    return null
  }
}
function saveTab(id: string) {
  try {
    localStorage.setItem(TAB_KEY, id)
  } catch {
    // Private mode / blocked storage: the sheet just opens on the first tab next time.
  }
}

export function settingsSheet(initial: SettingsTab[]): SettingsSheet {
  let tabs = initial
  let current = ''
  let root: HTMLElement | null = null
  let unguard = () => {}

  const button = iconButton(icons.gear, t('Settings'), () => open())
  const strip = h('div', { class: 'pf-sheet-tabs', role: 'tablist' })
  const body = h('div', { class: 'pf-sheet-body', role: 'tabpanel' })

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    close()
  }

  function draw() {
    if (!tabs.some((tb) => tb.id === current)) current = tabs[0]?.id ?? ''
    strip.hidden = tabs.length < 2
    strip.replaceChildren(
      ...tabs.map((tb) => {
        const on = tb.id === current
        const b = h('button', {
          class: `pf-sheet-tab${on ? ' on' : ''}`,
          type: 'button',
          role: 'tab',
          textContent: tb.label,
          onclick: () => select(tb.id),
        })
        b.setAttribute('aria-selected', String(on))
        return b
      }),
    )
    const tab = tabs.find((tb) => tb.id === current)
    body.replaceChildren(...(tab ? [tab.body()] : []))
  }

  function select(id: string) {
    current = id
    saveTab(id)
    draw()
  }

  function open(tabId?: string) {
    const want = tabId ?? savedTab() ?? ''
    current = tabs.some((tb) => tb.id === want) ? want : (tabs[0]?.id ?? '')
    if (!root) {
      const closeBtn = iconButton(icons.cross, t('Close'), () => close())
      closeBtn.classList.add('pf-sheet-close')
      const card = h(
        'div',
        { class: 'pf-sheet', role: 'dialog', tabIndex: -1 },
        h('header', { class: 'pf-sheet-head' }, h('h2', { textContent: t('Settings') }), closeBtn),
        strip,
        body,
      )
      card.setAttribute('aria-modal', 'true')
      card.setAttribute('aria-label', t('Settings'))
      root = h('div', { class: 'pf-sheet-backdrop' }, card)
      root.onclick = (e) => {
        if (e.target === root) close()
      }
      document.body.append(root)
      window.addEventListener('keydown', onKey, true)
      unguard = guardGameKeys({ pass: PASS_KEYS })
      draw()
      card.focus({ preventScroll: true })
      return
    }
    draw()
  }

  function close() {
    if (!root) return
    root.remove()
    root = null
    window.removeEventListener('keydown', onKey, true)
    unguard()
    unguard = () => {}
    // Focus never lands back on a button: in a match Space would press it instead of playing.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  return {
    button,
    open,
    close,
    get isOpen() {
      return !!root
    },
    setTabs(next) {
      tabs = next
      if (root) draw()
    },
  }
}

/** The shell's tabs, in order. `voice` only while in a room with voice chat; `game` = the game's own section. */
export function shellTabs(parts: {
  sound: () => HTMLElement
  lang: () => HTMLElement
  voice?: (() => HTMLElement) | null
  game?: { label: string; body: () => HTMLElement } | null
}): SettingsTab[] {
  const tabs: SettingsTab[] = [
    { id: 'sound', label: t('Sound'), body: parts.sound },
    { id: 'lang', label: t('Language'), body: parts.lang },
  ]
  if (parts.voice) tabs.push({ id: 'voice', label: t('Voice'), body: parts.voice })
  if (parts.game) tabs.push({ id: 'game', label: parts.game.label, body: parts.game.body })
  return tabs
}
