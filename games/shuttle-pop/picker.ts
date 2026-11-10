// The character strip on the start screen (createGameApp menuExtras): one card per preset with a
// flat SVG portrait matching its 3D look. The choice lives in localStorage; main sends it as a `pick` input when play starts.
import { h } from '@forge/ui/dom'
import { PRESETS, type Preset } from './actors'
import { shade } from './model/merge'
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

/** Hair / headwear behind the head (pigtails, bob) and over it (bangs, cap, spikes + band, beanie). */
function styleSvg(p: Preset): { back: string; front: string } {
  const hair = hex(p.look.hair)
  const acc = hex(p.accent)
  const dark = hex(shade(p.accent, 0.15))
  switch (p.look.style) {
    case 'bowPigtails':
      return {
        back: `<ellipse cx="12" cy="37" rx="5" ry="8.5" fill="${hair}"/><ellipse cx="52" cy="37" rx="5" ry="8.5" fill="${hair}"/>`,
        front:
          `<path d="M13 27A19 19 0 0 1 51 27Q47 20 43.4 24Q40 19 36 23Q32 18 28 23Q24 19 20.6 24Q17 20 13 27z" fill="${hair}"/>` +
          `<circle cx="13.5" cy="30" r="2.2" fill="${acc}"/><circle cx="50.5" cy="30" r="2.2" fill="${acc}"/>` +
          `<path d="M41 10l-8-5v10zM41 10l8-5v10z" fill="${acc}"/><circle cx="41" cy="10" r="2.6" fill="${dark}"/>`,
      }
    case 'capFringe':
      return {
        back: '',
        front:
          `<path d="M13 30A19 19 0 0 1 51 30z" fill="${hair}"/>` +
          `<path d="M21 22q1 7 5 4q2 4 6 0q3 4 6-1q3 3 5-3z" fill="${hair}"/>` +
          `<path d="M13 24A19 17 0 0 1 51 24z" fill="${acc}"/><circle cx="32" cy="15" r="3" fill="#fff"/>` +
          `<path d="M27 22h25a3 3 0 0 1 0 5.5H27z" fill="${dark}"/>`,
      }
    case 'bandSpiky':
      return {
        back: '',
        front:
          `<path d="M13 25L15 9L21 16L25 4L32 13L39 4L43 16L49 9L51 25z" fill="${hair}"/>` +
          `<path d="M13 27A19 19 0 0 1 51 27z" fill="${hair}"/>` +
          `<rect x="12.5" y="19" width="39" height="5.5" rx="2.7" fill="${acc}"/><ellipse cx="32" cy="21.7" rx="2.2" ry="1.6" fill="#fff"/>`,
      }
    case 'beanieBob':
      return {
        back: `<path d="M12 26Q11 43 18 43H46Q53 43 52 26z" fill="${hair}"/>`,
        front:
          `<path d="M12 25A20 19 0 0 1 52 25z" fill="${acc}"/><rect x="11.5" y="20.5" width="41" height="6" rx="3" fill="${dark}"/>` +
          `<path d="M18 26.5q2 4 6 3l-1-3zM46 26.5q-2 4-6 3l1-3z" fill="${hair}"/><circle cx="32" cy="5" r="4" fill="#fff"/>`,
      }
  }
}

/** Front portrait matching the 3D model: kit (collar shirt + stripe, shorts / skirt, socks, sneakers), big head, shiny eyes, brows, blush, smile, style. */
function portrait(p: Preset): string {
  const L = p.look
  const k = L.kit
  const skin = hex(L.skin)
  const eye = '#2b2233'
  const iris = hex(L.iris)
  const brow = hex(shade(L.hair, 0.25))
  const st = styleSvg(p)
  const bottom =
    k.bottom === 'skirt'
      ? `<path d="M22 53H42L45.5 61H18.5z" fill="${hex(k.bottomColor)}"/><rect x="18.5" y="59.6" width="27" height="1.6" fill="${hex(k.stripe)}"/>`
      : `<rect x="21" y="53" width="22" height="7.5" rx="3" fill="${hex(k.bottomColor)}"/>`
  const eyes = [25, 39]
    .map(
      (x) =>
        `<ellipse cx="${x}" cy="30" rx="3" ry="4" fill="${eye}"/><ellipse cx="${x}" cy="31.8" rx="2.1" ry="1.7" fill="${iris}"/>` +
        `<circle cx="${x + 1}" cy="28.6" r="1.1" fill="#fff"/><circle cx="${x - 0.9}" cy="32.3" r=".5" fill="#fff"/>` +
        `<path d="M${x - 3} 24.6q3-1.4 6 0" stroke="${brow}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
    )
    .join('')
  return `<svg viewBox="0 0 64 72" width="64" height="72" aria-hidden="true">
<ellipse cx="32" cy="69" rx="15" ry="2.5" fill="#000" opacity=".18"/>
${st.back}
<rect x="24.5" y="58" width="5.5" height="9" rx="2.5" fill="${skin}"/><rect x="34" y="58" width="5.5" height="9" rx="2.5" fill="${skin}"/>
<rect x="24.3" y="62.5" width="5.9" height="3.5" fill="${hex(k.socks)}"/><rect x="33.8" y="62.5" width="5.9" height="3.5" fill="${hex(k.socks)}"/>
<ellipse cx="26.6" cy="67" rx="4.6" ry="2.4" fill="${hex(k.shoe)}"/><ellipse cx="37.4" cy="67" rx="4.6" ry="2.4" fill="${hex(k.shoe)}"/>
<rect x="21.8" y="68.2" width="9.6" height="1.4" rx=".7" fill="${hex(k.sole)}"/><rect x="32.6" y="68.2" width="9.6" height="1.4" rx=".7" fill="${hex(k.sole)}"/>
${bottom}
<circle cx="17.5" cy="53" r="3.4" fill="${skin}"/><circle cx="46.5" cy="53" r="3.4" fill="${skin}"/>
<rect x="29" y="40" width="6" height="5" fill="${skin}"/>
<rect x="21" y="43" width="22" height="13" rx="6" fill="${hex(k.shirt)}"/>
<circle cx="20" cy="46.5" r="4" fill="${hex(k.shirt)}"/><circle cx="44" cy="46.5" r="4" fill="${hex(k.shirt)}"/>
<rect x="21" y="49" width="22" height="2.4" fill="${hex(k.stripe)}"/>
<path d="M27 43.2L32 46.6L37 43.2" stroke="${hex(k.trim)}" stroke-width="1.8" fill="none" stroke-linejoin="round"/>
<circle cx="32" cy="27" r="19" fill="${skin}"/>
${eyes}
<ellipse cx="19.5" cy="35" rx="3.2" ry="1.6" fill="#ff9eb5"/><ellipse cx="44.5" cy="35" rx="3.2" ry="1.6" fill="#ff9eb5"/>
<path d="M29.5 37q2.5 2.6 5 0" stroke="#8c2f3f" stroke-width="1.5" fill="none" stroke-linecap="round"/>
${st.front}
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
