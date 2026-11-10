// The character strip on the start screen (createGameApp menuExtras): one card per preset with a
// flat SVG portrait matching its 3D look (built from the look's keys). The choice lives in localStorage; main sends it as a `pick` input when play starts.
import { h } from '@forge/ui/dom'
import { PRESETS } from './actors'
import {
  limbOf,
  type BodyKind,
  type EarKind,
  type ExtraKind,
  type FaceKind,
  type FootKind,
  type HandKind,
  type HeadKind,
  type Kit,
  type LegKind,
  type Look,
  type MuzzleKind,
  type StyleKind,
} from './model/look'
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

// Portraits: a flat SVG per preset built from its Look keys through the tables below (the same keys the
// 3D builders read), layered back to front. viewBox 64 × 72: head centre (32, 27) r 19, body 40–57,
// feet on y ≈ 68. A new body part key = a new table entry here too (Record types enforce it).

/** SVG layers, back to front. */
interface Layers {
  /** Behind everything: tails, wings, long hair. */
  back: string
  legs: string
  body: string
  /** Head shape. */
  head: string
  face: string
  /** Over the head: fringe, hats, horns. */
  front: string
}
type Piece = Partial<Layers>
type Svg<K extends string> = Record<K, (l: Look) => Piece>

const EYE_DARK = '#2b2233'

/** Hair / headwear behind the head (pigtails, bob) and over it (bangs, cap, spikes + band, beanie). */
const STYLE_SVG: Svg<StyleKind> = {
  bowPigtails: (l) => {
    const hair = hex(l.hair)
    const acc = hex(l.accent)
    return {
      back: `<ellipse cx="12" cy="37" rx="5" ry="8.5" fill="${hair}"/><ellipse cx="52" cy="37" rx="5" ry="8.5" fill="${hair}"/>`,
      front:
        `<path d="M13 27A19 19 0 0 1 51 27Q47 20 43.4 24Q40 19 36 23Q32 18 28 23Q24 19 20.6 24Q17 20 13 27z" fill="${hair}"/>` +
        `<circle cx="13.5" cy="30" r="2.2" fill="${acc}"/><circle cx="50.5" cy="30" r="2.2" fill="${acc}"/>` +
        `<path d="M41 10l-8-5v10zM41 10l8-5v10z" fill="${acc}"/><circle cx="41" cy="10" r="2.6" fill="${hex(shade(l.accent, 0.15))}"/>`,
    }
  },
  capFringe: (l) => {
    const hair = hex(l.hair)
    return {
      front:
        `<path d="M13 30A19 19 0 0 1 51 30z" fill="${hair}"/>` +
        `<path d="M21 22q1 7 5 4q2 4 6 0q3 4 6-1q3 3 5-3z" fill="${hair}"/>` +
        `<path d="M13 24A19 17 0 0 1 51 24z" fill="${hex(l.accent)}"/><circle cx="32" cy="15" r="3" fill="#fff"/>` +
        `<path d="M27 22h25a3 3 0 0 1 0 5.5H27z" fill="${hex(shade(l.accent, 0.15))}"/>`,
    }
  },
  bandSpiky: (l) => {
    const hair = hex(l.hair)
    return {
      front:
        `<path d="M13 25L15 9L21 16L25 4L32 13L39 4L43 16L49 9L51 25z" fill="${hair}"/>` +
        `<path d="M13 27A19 19 0 0 1 51 27z" fill="${hair}"/>` +
        `<rect x="12.5" y="19" width="39" height="5.5" rx="2.7" fill="${hex(l.accent)}"/><ellipse cx="32" cy="21.7" rx="2.2" ry="1.6" fill="#fff"/>`,
    }
  },
  beanieBob: (l) => {
    const hair = hex(l.hair)
    return {
      back: `<path d="M12 26Q11 43 18 43H46Q53 43 52 26z" fill="${hair}"/>`,
      front:
        `<path d="M12 25A20 19 0 0 1 52 25z" fill="${hex(l.accent)}"/><rect x="11.5" y="20.5" width="41" height="6" rx="3" fill="${hex(shade(l.accent, 0.15))}"/>` +
        `<path d="M18 26.5q2 4 6 3l-1-3zM46 26.5q-2 4-6 3l1-3z" fill="${hair}"/><circle cx="32" cy="5" r="4" fill="#fff"/>`,
    }
  },
}

const HEAD_SVG: Svg<HeadKind> = {
  round: (l) => ({ head: `<circle cx="32" cy="27" r="19" fill="${hex(l.skin)}"/>` }),
}

const EARS_SVG: Svg<EarKind> = {
  human: (l) => ({
    back: `<ellipse cx="13" cy="29" rx="2.4" ry="3.6" fill="${hex(l.skin)}"/><ellipse cx="51" cy="29" rx="2.4" ry="3.6" fill="${hex(l.skin)}"/>`,
  }),
  none: () => ({}),
}

const MUZZLE_SVG: Svg<MuzzleKind> = {
  none: () => ({}),
}

/** Shiny eyes (dark, iris tint, highlights) at x = 25 / 39, y `y`. */
function eyesSvg(l: Look, y: number, eye = EYE_DARK): string {
  const iris = hex(l.iris)
  return [25, 39]
    .map(
      (x) =>
        `<ellipse cx="${x}" cy="${y}" rx="3" ry="4" fill="${eye}"/><ellipse cx="${x}" cy="${y + 1.8}" rx="2.1" ry="1.7" fill="${iris}"/>` +
        `<circle cx="${x + 1}" cy="${y - 1.4}" r="1.1" fill="#fff"/><circle cx="${x - 0.9}" cy="${y + 2.3}" r=".5" fill="#fff"/>`,
    )
    .join('')
}
const BLUSH = `<ellipse cx="19.5" cy="35" rx="3.2" ry="1.6" fill="#ff9eb5"/><ellipse cx="44.5" cy="35" rx="3.2" ry="1.6" fill="#ff9eb5"/>`
const SMILE = `<path d="M29.5 37q2.5 2.6 5 0" stroke="#8c2f3f" stroke-width="1.5" fill="none" stroke-linecap="round"/>`

const FACE_SVG: Svg<FaceKind> = {
  chibi: (l) => {
    const brow = hex(shade(l.hair, 0.25))
    const brows = [25, 39]
      .map(
        (x) =>
          `<path d="M${x - 3} 24.6q3-1.4 6 0" stroke="${brow}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
      )
      .join('')
    return { face: eyesSvg(l, 30) + brows + BLUSH + SMILE }
  },
}

/** Mittens (hands) at the body's sides. */
const HAND_SVG: Svg<HandKind> = {
  mitten: (l) => ({
    body: `<circle cx="17.5" cy="53" r="3.4" fill="${hex(limbOf(l))}"/><circle cx="46.5" cy="53" r="3.4" fill="${hex(limbOf(l))}"/>`,
  }),
}

const FEET_SVG: Svg<FootKind> = {
  sneaker: (l) => {
    const s = l.shoes ?? { socks: 0xffffff, shoe: 0xffffff, sole: 0xffffff }
    return {
      legs:
        `<rect x="24.3" y="62.5" width="5.9" height="3.5" fill="${hex(s.socks)}"/><rect x="33.8" y="62.5" width="5.9" height="3.5" fill="${hex(s.socks)}"/>` +
        `<ellipse cx="26.6" cy="67" rx="4.6" ry="2.4" fill="${hex(s.shoe)}"/><ellipse cx="37.4" cy="67" rx="4.6" ry="2.4" fill="${hex(s.shoe)}"/>` +
        `<rect x="21.8" y="68.2" width="9.6" height="1.4" rx=".7" fill="${hex(s.sole)}"/><rect x="32.6" y="68.2" width="9.6" height="1.4" rx=".7" fill="${hex(s.sole)}"/>`,
    }
  },
}

const LEGS_SVG: Svg<LegKind> = {
  pair: (l) => {
    const c = hex(limbOf(l))
    return {
      legs:
        `<rect x="24.5" y="58" width="5.5" height="9" rx="2.5" fill="${c}"/><rect x="34" y="58" width="5.5" height="9" rx="2.5" fill="${c}"/>` +
        (FEET_SVG[l.feet](l).legs ?? ''),
    }
  },
  hop: () => ({}),
  float: () => ({}),
}

/** Kit: collar shirt + stripe, shorts / skirt. */
function kitSvg(k: Kit): string {
  const bottom =
    k.bottom === 'skirt'
      ? `<path d="M22 53H42L45.5 61H18.5z" fill="${hex(k.bottomColor)}"/><rect x="18.5" y="59.6" width="27" height="1.6" fill="${hex(k.stripe)}"/>`
      : `<rect x="21" y="53" width="22" height="7.5" rx="3" fill="${hex(k.bottomColor)}"/>`
  return (
    bottom +
    `<rect x="21" y="43" width="22" height="13" rx="6" fill="${hex(k.shirt)}"/>` +
    `<circle cx="20" cy="46.5" r="4" fill="${hex(k.shirt)}"/><circle cx="44" cy="46.5" r="4" fill="${hex(k.shirt)}"/>` +
    `<rect x="21" y="49" width="22" height="2.4" fill="${hex(k.stripe)}"/>` +
    `<path d="M27 43.2L32 46.6L37 43.2" stroke="${hex(k.trim)}" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`
  )
}

const BODY_SVG: Svg<BodyKind> = {
  human: (l) => {
    const skin = hex(l.skin)
    return {
      body:
        `<rect x="29" y="40" width="6" height="5" fill="${skin}"/>` +
        (l.kit ? kitSvg(l.kit) : `<rect x="21" y="43" width="22" height="13" rx="6" fill="${skin}"/>`),
    }
  },
}

const EXTRA_SVG: Svg<ExtraKind> = {}

/** Front portrait matching the 3D model, from the look's keys. */
export function portrait(l: Look): string {
  const pieces: Piece[] = [
    ...l.extras.map((k) => {
      const svg: (l: Look) => Piece = EXTRA_SVG[k]
      return svg(l)
    }),
    STYLE_SVG[l.style](l),
    EARS_SVG[l.ears](l),
    LEGS_SVG[l.legs](l),
    BODY_SVG[l.body](l),
    HAND_SVG[l.hands](l),
    HEAD_SVG[l.head](l),
    MUZZLE_SVG[l.muzzle](l),
    FACE_SVG[l.face](l),
  ]
  const layer = (k: keyof Layers) => pieces.map((p) => p[k] ?? '').join('')
  return `<svg viewBox="0 0 64 72" width="64" height="72" aria-hidden="true">
<ellipse cx="32" cy="69" rx="15" ry="2.5" fill="#000" opacity=".18"/>
${layer('back')}${layer('legs')}${layer('body')}${layer('head')}${layer('face')}${layer('front')}
</svg>`
}

/** Preset cards; a click saves the choice (used from the next match start). */
export function pickerStrip(): HTMLElement {
  let selected = loadPreset()
  const cards = PRESETS.map((p) => {
    const art = h('span', { class: 'sp-char-art' })
    // Static markup built from the constant preset table (no user text).
    art.innerHTML = portrait(p.look)
    const card = h(
      'button',
      {
        type: 'button',
        class: 'sp-char',
        style: `--sp-tint:${hex(p.tint)}`,
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
