// The character strip on the start screen (createGameApp menuExtras): one card per preset with a
// flat SVG portrait matching its 3D look (built from the look's keys). The choice lives in localStorage; main sends it as a `pick` input when play starts.
import { h } from '@forge/ui/dom'
import { PRESETS } from './actors'
import {
  bellyOf,
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
import { shade, tint } from './model/merge'
import { css, PALETTE } from './model/palette'
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

const hex = css

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

const EYE_DARK = css(PALETTE.eye)

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
  tabby: (l) => {
    const c = hex(l.hair)
    return {
      front:
        `<path d="M28 9.5l1.4 6M32 8.5v7M36 9.5l-1.4 6" stroke="${c}" stroke-width="2" stroke-linecap="round"/>` +
        `<path d="M13.6 31h3.4M47 31h3.4" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
    }
  },
  tuft: (l) => ({
    front: `<circle cx="32" cy="8.5" r="3.4" fill="${hex(l.hair)}"/><circle cx="28.8" cy="9.6" r="2.6" fill="${hex(l.hair)}"/><circle cx="35.2" cy="9.6" r="2.6" fill="${hex(l.hair)}"/>`,
  }),
  leaf: () => ({
    front: `<ellipse cx="20" cy="11" rx="2" ry="5" fill="#6cc46a" transform="rotate(-35 20 11)"/><ellipse cx="16.5" cy="13" rx="1.8" ry="4.4" fill="#4fae55" transform="rotate(-75 16.5 13)"/>`,
  }),
  foxFringe: (l) => ({
    front:
      `<path d="M27 9q3 5 5 1q2 4 5-1" stroke="${hex(l.hair)}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      `<ellipse cx="17" cy="35" rx="5.5" ry="3.6" fill="${hex(bellyOf(l))}"/><ellipse cx="47" cy="35" rx="5.5" ry="3.6" fill="${hex(bellyOf(l))}"/>`,
  }),
  horns: (l) => ({
    front: both(
      (x) => `<path d="M${x(21)} 12Q${x(17)} 4 ${x(19)} -1Q${x(22)} 5 ${x(26)} 10z" fill="${hex(l.hair)}"/>`,
    ),
  }),
  drop: (l) => ({
    front:
      `<path d="M27 9.5Q32 4 34 -1Q36 5 37 9.5z" fill="${hex(l.skin)}"/>` +
      `<ellipse cx="22" cy="17" rx="3.4" ry="1.8" fill="${hex(tint(l.skin, 0.75))}" transform="rotate(-35 22 17)"/>`,
  }),
  visor: (l) => ({
    front: `<path d="M32 9.5v6M20 12q12-4 24 0" stroke="${hex(shade(l.skin, 0.35))}" stroke-width=".8" fill="none"/>`,
  }),
  wisp: (l) => ({ front: `<path d="M30 9Q30 3 35 3.5Q32 5 33 9z" fill="${hex(l.skin)}"/>` }),
}

const HEAD_SVG: Svg<HeadKind> = {
  round: (l) => ({ head: `<circle cx="32" cy="27" r="19" fill="${hex(l.skin)}"/>` }),
  box: (l) => ({ head: `<rect x="12.5" y="9" width="39" height="36" rx="11" fill="${hex(l.skin)}"/>` }),
}

const EARS_SVG: Svg<EarKind> = {
  human: (l) => ({
    back: `<ellipse cx="13" cy="29" rx="2.4" ry="3.6" fill="${hex(l.skin)}"/><ellipse cx="51" cy="29" rx="2.4" ry="3.6" fill="${hex(l.skin)}"/>`,
  }),
  none: () => ({}),
  bolt: (l) => ({
    back: both(
      (x) =>
        `<circle cx="${x(12)}" cy="28" r="3.6" fill="${hex(shade(l.skin, 0.25))}"/><circle cx="${x(11)}" cy="28" r="1.8" fill="${hex(l.accent)}"/>`,
    ),
  }),
  panda: (l) => ({
    back: `<circle cx="16" cy="12" r="6" fill="${hex(limbOf(l))}"/><circle cx="48" cy="12" r="6" fill="${hex(limbOf(l))}"/>`,
  }),
}

const snout = (rx: number, ry: number) => (l: Look) => ({
  head: `<ellipse cx="32" cy="${37 - ry * 0.3}" rx="${rx}" ry="${ry}" fill="${hex(bellyOf(l))}"/>`,
})
const MUZZLE_SVG: Svg<MuzzleKind> = {
  none: () => ({}),
  cat: snout(6.5, 4.2),
  fox: snout(7, 4.8),
  panda: snout(7.5, 4.5),
  dragon: snout(8.5, 4.8),
}

/** Both sides of a symmetric shape: `f(x)` maps a left-side x; the right side mirrors it about 32. */
function both(f: (x: (v: number) => number) => string): string {
  return f((v) => v) + f((v) => 64 - v)
}

/** Shiny eyes (dark, iris tint, highlights) at x = 25 / 39, y `y`. */
function eyesSvg(l: Look, y: number, eye = EYE_DARK, lashes = false): string {
  const iris = hex(l.iris)
  return [25, 39]
    .map(
      (x) =>
        (lashes
          ? `<path d="M${x + (x < 32 ? -2.4 : 2.4)} ${y - 2.6}l${x < 32 ? -2 : 2} -1.4M${x + (x < 32 ? -2.9 : 2.9)} ${y - 1.2}l${x < 32 ? -2.1 : 2.1} -0.4" stroke="${eye}" stroke-width=".9" stroke-linecap="round"/>`
          : '') +
        `<ellipse cx="${x}" cy="${y}" rx="3" ry="4" fill="${eye}"/><ellipse cx="${x}" cy="${y + 1.8}" rx="2.1" ry="1.7" fill="${iris}"/>` +
        `<circle cx="${x + 1}" cy="${y - 1.4}" r="1.1" fill="#fff"/><circle cx="${x - 0.9}" cy="${y + 2.3}" r=".5" fill="#fff"/>`,
    )
    .join('')
}
const BLUSH = `<ellipse cx="19.5" cy="35" rx="3.2" ry="1.6" fill="${css(PALETTE.blush)}"/><ellipse cx="44.5" cy="35" rx="3.2" ry="1.6" fill="${css(PALETTE.blush)}"/>`
const SMILE = `<path d="M29.5 37q2.5 2.6 5 0" stroke="${css(PALETTE.mouth)}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`

const NOSE_DARK = css(PALETTE.nose)
const CAT_MOUTH = `<path d="M29.4 36.4q1.3 1.4 2.6 0q1.3 1.4 2.6 0" stroke="${css(PALETTE.mouth)}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`
function animalFace(l: Look, extra = ''): string {
  const nose = l.nose === undefined ? NOSE_DARK : hex(l.nose)
  return (
    extra +
    eyesSvg(l, 28.5) +
    BLUSH +
    `<ellipse cx="32" cy="34.2" rx="1.8" ry="1.2" fill="${nose}"/>` +
    CAT_MOUTH
  )
}

const FACE_SVG: Svg<FaceKind> = {
  visor: (l) => {
    const glow = hex(l.iris)
    return {
      face:
        `<rect x="15.5" y="21" width="33" height="15" rx="6.5" fill="${css(PALETTE.visor)}"/>` +
        both(
          (x) =>
            `<ellipse cx="${x(25)}" cy="28" rx="3" ry="3.8" fill="${glow}"/><circle cx="${x(25) + 1}" cy="26.6" r="1" fill="#fff"/>`,
        ) +
        `<path d="M30 33.2q2 1.2 4 0" stroke="${glow}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
    }
  },
  jelly: (l) => ({ face: eyesSvg(l, 29.5, EYE_DARK, true) + BLUSH + SMILE }),
  ghost: (l) => ({
    face:
      eyesSvg(l, 30, EYE_DARK, true) +
      BLUSH +
      `<ellipse cx="32" cy="37.5" rx="2.2" ry="2.6" fill="${css(PALETTE.mouth)}"/>`,
  }),
  animal: (l) => ({ face: animalFace(l) }),
  kitty: (l) => ({
    face:
      animalFace(l) +
      both(
        (x) =>
          `<path d="M${x(25)} 35.5L${x(15)} 34M${x(25)} 37L${x(15)} 37.6" stroke="${hex(shade(l.skin, 0.55))}" stroke-width=".8" stroke-linecap="round"/>`,
      ),
  }),
  panda: (l) => ({
    face: animalFace(
      l,
      both(
        (x) =>
          `<ellipse cx="${x(24)}" cy="29" rx="5" ry="6.2" fill="${hex(limbOf(l))}" transform="rotate(${x(0) === 0 ? 25 : -25} ${x(24)} 29)"/>`,
      ),
    ),
  }),
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
  claw: (l) => ({
    body: both(
      (x) =>
        `<circle cx="${x(17)}" cy="53" r="3.8" fill="${hex(limbOf(l))}"/><path d="M${x(15.5)} 56.4v1.4M${x(17)} 56.7v1.4M${x(18.5)} 56.4v1.4" stroke="${hex(l.hair)}" stroke-width=".9" stroke-linecap="round"/>`,
    ),
  }),
  metal: (l) => ({
    body: both(
      (x) =>
        `<circle cx="${x(17.5)}" cy="53" r="3.4" fill="${hex(limbOf(l))}"/><rect x="${x(17.5) - 3}" y="49" width="6" height="1.6" rx=".8" fill="${hex(shade(limbOf(l), 0.35))}"/>`,
    ),
  }),
  nub: (l) => ({ body: both((x) => `<circle cx="${x(18)}" cy="52" r="3.2" fill="${hex(limbOf(l))}"/>`) }),
  paw: (l) => ({
    body: both(
      (x) =>
        `<circle cx="${x(17)}" cy="53" r="3.8" fill="${hex(limbOf(l))}"/><circle cx="${x(17)}" cy="54" r="1.5" fill="${hex(bellyOf(l))}"/>`,
    ),
  }),
  mitten: (l) => ({
    body: `<circle cx="17.5" cy="53" r="3.4" fill="${hex(limbOf(l))}"/><circle cx="46.5" cy="53" r="3.4" fill="${hex(limbOf(l))}"/>`,
  }),
}

const FEET_SVG: Svg<FootKind> = {
  claw: (l) => ({
    legs: both(
      (x) =>
        `<ellipse cx="${x(26.8)}" cy="67" rx="4.4" ry="2.6" fill="${hex(limbOf(l))}"/><path d="M${x(24.5)} 68.6v1M${x(26.8)} 68.9v1M${x(29.1)} 68.6v1" stroke="${hex(l.hair)}" stroke-width=".9" stroke-linecap="round"/>`,
    ),
  }),
  boot: (l) => ({
    legs: both(
      (x) =>
        `<rect x="${x(26.8) - 4.6}" y="64.2" width="9.2" height="4.6" rx="2" fill="${hex(shade(limbOf(l), 0.15))}"/><rect x="${x(26.8) - 4.8}" y="68.3" width="9.6" height="1.4" rx=".7" fill="${hex(l.accent)}"/>`,
    ),
  }),
  paw: (l) => ({
    legs: both(
      (x) =>
        `<ellipse cx="${x(26.8)}" cy="67" rx="4.4" ry="2.6" fill="${hex(limbOf(l))}"/>` +
        `<path d="M${x(24.5)} 66.4v1.6M${x(26.8)} 66v2M${x(29.1)} 66.4v1.6" stroke="${hex(shade(limbOf(l), 0.3))}" stroke-width=".6" stroke-linecap="round"/>`,
    ),
  }),
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

/** Animal jersey: rounder shirt, round trim collar; or bare fur with a belly patch. */
function chubbySvg(l: Look): string {
  const skin = hex(l.skin)
  const k = l.kit
  if (!k)
    return (
      `<rect x="19.5" y="42" width="25" height="15" rx="7.5" fill="${skin}"/>` +
      `<ellipse cx="32" cy="50" rx="7" ry="6" fill="${hex(bellyOf(l))}"/>`
    )
  return (
    `<rect x="20" y="52.5" width="24" height="7.5" rx="3.5" fill="${hex(k.bottomColor)}"/>` +
    `<rect x="19.5" y="42.5" width="25" height="13.5" rx="7" fill="${hex(k.shirt)}"/>` +
    `<circle cx="19" cy="46.5" r="4.2" fill="${hex(k.shirt)}"/><circle cx="45" cy="46.5" r="4.2" fill="${hex(k.shirt)}"/>` +
    `<rect x="19.5" y="49" width="25" height="2.4" fill="${hex(k.stripe)}"/>` +
    `<path d="M27 43.2L32 47.4L37 43.2" stroke="${hex(k.trim)}" stroke-width="1.8" fill="none" stroke-linejoin="round"/>` +
    EMBLEM(38.5, 46.2)
  )
}

/** Shuttlecock emblem (feathers fanning up from a cork) centred at (x, y). */
const EMBLEM = (x: number, y: number) =>
  `<path d="M${x - 1.6} ${y - 1.8}L${x + 1.6} ${y - 1.8}L${x + 0.6} ${y + 0.6}L${x - 0.6} ${y + 0.6}z" fill="${css(PALETTE.emblem)}"/><circle cx="${x}" cy="${y + 1}" r=".8" fill="${css(PALETTE.emblem)}"/>`

const BODY_SVG: Svg<BodyKind> = {
  dragon: (l) => ({
    body:
      `<rect x="28.5" y="40" width="7" height="5" fill="${hex(l.skin)}"/>` +
      `<rect x="19.5" y="42" width="25" height="16" rx="7.5" fill="${hex(l.skin)}"/>` +
      [45, 49, 53]
        .map(
          (y, i) =>
            `<rect x="${26 + i}" y="${y}" width="${12 - 2 * i}" height="3.2" rx="1.6" fill="${hex(bellyOf(l))}"/>`,
        )
        .join(''),
  }),
  robot: (l) => ({
    body:
      `<rect x="29" y="40" width="6" height="5" fill="${hex(shade(l.skin, 0.3))}"/>` +
      `<rect x="21" y="53" width="22" height="6" rx="3" fill="${hex(shade(l.skin, 0.18))}"/>` +
      `<rect x="20" y="42.5" width="24" height="13.5" rx="5" fill="${hex(l.skin)}"/>` +
      `<rect x="25" y="45" width="14" height="7" rx="2.5" fill="${hex(shade(l.skin, 0.12))}"/>` +
      `<circle cx="29.5" cy="48.5" r="1.8" fill="${hex(l.accent)}"/><circle cx="34.5" cy="48.5" r="1" fill="${hex(tint(l.accent, 0.4))}"/>`,
  }),
  slime: (l) => ({
    body:
      `<ellipse cx="32" cy="60" rx="18" ry="9.5" fill="${hex(l.skin)}"/>` +
      `<path d="M15 63Q32 72 49 63Q48 69 32 69.5Q16 69 15 63z" fill="${hex(shade(l.skin, 0.14))}"/>` +
      `<ellipse cx="32" cy="48" rx="12" ry="9" fill="${hex(l.skin)}"/>` +
      `<ellipse cx="22" cy="56" rx="3" ry="1.5" fill="${hex(tint(l.skin, 0.75))}" transform="rotate(-25 22 56)"/>`,
  }),
  ghost: (l) => ({
    body: `<path d="M23 40Q20 50 17 61Q20.5 64 24 61Q27.5 64.5 32 61Q36.5 64.5 40 61Q43.5 64 47 61Q44 50 41 40z" fill="${hex(l.skin)}"/>`,
  }),
  chubby: (l) => ({
    body: `<rect x="28.5" y="40" width="7" height="5" fill="${hex(l.skin)}"/>` + chubbySvg(l),
  }),
  human: (l) => {
    const skin = hex(l.skin)
    return {
      body:
        `<rect x="29" y="40" width="6" height="5" fill="${skin}"/>` +
        (l.kit ? kitSvg(l.kit) : `<rect x="21" y="43" width="22" height="13" rx="6" fill="${skin}"/>`),
    }
  },
}

const EXTRA_SVG: Svg<ExtraKind> = {
  dragonTail: (l) => ({
    back: `<path d="M42 58Q52 60 55 52" stroke="${hex(l.skin)}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M53 51l5-4l-1 6z" fill="${hex(l.accent)}"/>`,
  }),
  wings: (l) => ({
    back: both(
      (x) =>
        `<path d="M${x(22)} 45Q${x(10)} 36 ${x(8)} 44Q${x(12)} 46 ${x(14)} 50z" fill="${hex(tint(l.accent, 0.35))}"/>`,
    ),
  }),
  antenna: (l) => ({
    back: `<path d="M32 9V2" stroke="${hex(shade(l.skin, 0.35))}" stroke-width="1.2"/><circle cx="32" cy="2.5" r="2.4" fill="${hex(l.accent)}"/>`,
  }),
  catEars: (l) => ({
    back: both(
      (x) =>
        `<path d="M${x(14.5)} 19L${x(16.5)} 3.5L${x(28)} 11z" fill="${hex(l.skin)}"/><path d="M${x(17.2)} 14.5L${x(18.2)} 7.5L${x(24.5)} 11.4z" fill="${css(PALETTE.earPink)}"/>`,
    ),
  }),
  foxEars: (l) => ({
    back: both(
      (x) =>
        `<path d="M${x(13)} 20L${x(13.5)} 0.5L${x(28.5)} 10z" fill="${hex(l.skin)}"/><path d="M${x(13.5)} 0.5L${x(13.3)} 7L${x(18.5)} 4z" fill="${hex(shade(limbOf(l), 0.1))}"/><path d="M${x(16)} 15L${x(16.3)} 6.5L${x(24.5)} 11z" fill="${hex(bellyOf(l))}"/>`,
    ),
  }),
  bunnyEars: (l) => ({
    back: both((x) => {
      const r = x(0) === 0 ? -14 : 14
      return (
        `<ellipse cx="${x(24)}" cy="1" rx="4.6" ry="11.5" fill="${hex(l.skin)}" transform="rotate(${r} ${x(24)} 10)"/>` +
        `<ellipse cx="${x(24)}" cy="2" rx="2.3" ry="8.5" fill="${css(PALETTE.earPink)}" transform="rotate(${r} ${x(24)} 10)"/>`
      )
    }),
  }),
  catTail: (l) => ({
    back: `<path d="M42 57Q54 58 53 46Q52.5 40 57 38" stroke="${hex(l.skin)}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M55 39.2L57 38" stroke="${hex(l.hair)}" stroke-width="4" stroke-linecap="round"/>`,
  }),
  foxTail: (l) => ({
    back: `<ellipse cx="50" cy="50" rx="6.5" ry="11" fill="${hex(l.skin)}" transform="rotate(35 50 50)"/><ellipse cx="54.5" cy="42.5" rx="4.2" ry="4.6" fill="${hex(bellyOf(l))}"/>`,
  }),
  bunnyTail: () => ({}),
}

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
