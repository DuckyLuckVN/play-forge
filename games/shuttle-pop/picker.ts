// The character strip on the start screen (createGameApp menuExtras): one card per preset with a
// flat SVG portrait. The choice lives in localStorage; main sends it as a `pick` input when play starts.
import { h } from '@forge/ui/dom'
import { PRESETS, type Preset } from './actors'
import { t } from './i18n'

const KEY = 'play-forge:shuttle-pop:preset'

/** The stored preset, or 0 when missing, invalid or storage is blocked. */
export function loadPreset(): number {
  try {
    const raw = localStorage.getItem(KEY)
    const n = raw === null || raw === '' ? NaN : Number(raw)
    return Number.isInteger(n) && n >= 0 && n < PRESETS.length ? n : 0
  } catch {
    return 0
  }
}

export function savePreset(n: number): void {
  try {
    localStorage.setItem(KEY, String(n))
  } catch {
    // storage full or blocked: the pick lasts this page only
  }
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

/** Hat drawn over the head (head centre 32,30, r 20). Accent-coloured. */
function hatSvg(p: Preset, c: string): string {
  switch (p.hat) {
    case 'cap':
      return `<path d="M12 26a20 18 0 0 1 40 0z" fill="${c}"/><path d="M30 25h22a4 4 0 0 1 0 6H30z" fill="${c}"/>`
    case 'headband':
      return `<rect x="12" y="20" width="40" height="6" rx="3" fill="${c}"/>`
    case 'bow':
      return `<path d="M38 12l-9-6v12zM38 12l9-6v12z" fill="${c}"/><circle cx="38" cy="12" r="3" fill="${c}"/>`
    case 'beanie':
      return `<path d="M11 28a21 20 0 0 1 42 0z" fill="${c}"/><rect x="11" y="24" width="42" height="6" rx="3" fill="${c}"/><circle cx="32" cy="7" r="4" fill="#fff"/>`
  }
}

/** Front portrait: tiny body in the shirt colour, big head, eyes, blush, smile, hat. */
function portrait(p: Preset): string {
  const body = hex(p.body)
  return `<svg viewBox="0 0 64 72" width="64" height="72" aria-hidden="true">
<ellipse cx="32" cy="69" rx="16" ry="3" fill="#000" opacity=".18"/>
<rect x="21" y="44" width="22" height="20" rx="10" fill="${body}"/>
<rect x="24" y="60" width="6" height="9" rx="3" fill="#ffe0c7"/><rect x="34" y="60" width="6" height="9" rx="3" fill="#ffe0c7"/>
<circle cx="32" cy="30" r="20" fill="#ffe0c7"/>
<path d="M12 29a20 20 0 0 1 40 0c-6-6-14-8-20-8s-14 2-20 8z" fill="#5a3e36"/>
<ellipse cx="25" cy="32" rx="2.6" ry="3.4" fill="#2b2233"/><ellipse cx="39" cy="32" rx="2.6" ry="3.4" fill="#2b2233"/>
<circle cx="26" cy="31" r="1" fill="#fff"/><circle cx="40" cy="31" r="1" fill="#fff"/>
<ellipse cx="20" cy="37" rx="3.5" ry="2" fill="#ff9eb5"/><ellipse cx="44" cy="37" rx="3.5" ry="2" fill="#ff9eb5"/>
<path d="M29 38q3 3 6 0" stroke="#2b2233" stroke-width="1.6" fill="none" stroke-linecap="round"/>
${hatSvg(p, hex(p.accent))}
</svg>`
}

/** Preset cards; a click saves the choice (used from the next match start). */
export function pickerStrip(): HTMLElement {
  let selected = loadPreset()
  const cards = PRESETS.map((p) => {
    const art = h('span', { class: 'sp-char-art' })
    // Static markup built from the constant preset table (no user text).
    art.innerHTML = portrait(p)
    const card = h(
      'button',
      {
        type: 'button',
        class: 'sp-char',
        style: `--sp-tint:${hex(p.body)}`,
        onclick: () => {
          selected = p.id
          savePreset(p.id)
          sync()
        },
      },
      art,
      h('span', { class: 'sp-char-name', textContent: t(p.name) }),
    )
    return { id: p.id, card }
  })
  function sync() {
    for (const { id, card } of cards) {
      const on = id === selected
      card.classList.toggle('active', on)
      card.setAttribute('aria-pressed', String(on))
    }
  }
  sync()
  const title = t('Choose your player')
  const root = h(
    'section',
    { class: 'sp-chars' },
    h('h3', { class: 'sp-chars-title', textContent: title }),
    h('div', { class: 'sp-chars-grid' }, ...cards.map((c) => c.card)),
  )
  root.setAttribute('aria-label', title)
  return root
}
