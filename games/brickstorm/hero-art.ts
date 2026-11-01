// Hero portraits: chibi busts as inline SVG strings, in the same flat, bold,
// dark-outlined look as icons.ts. Built from a hero's colour, skin, hat and
// emblem (see sim/heroes.ts). Trusted, static markup.
import type { HeroDef, HeroEmblem, HeroHat } from './sim/heroes'

const OUT = '#1b1d2b'
const HAIR = '#4a3428'
const GOLD = '#ffd43b'
const STEEL = '#c3ccd6'
const DARK = '#2b2d42'

/** Mixes a hex colour toward white (amt > 0) or black (amt < 0). Non-hex passes through. */
function shade(hex: string, amt: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  const target = amt > 0 ? 255 : 0
  const t = Math.min(1, Math.abs(amt))
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16)
    return Math.round(v + (target - v) * t)
      .toString(16)
      .padStart(2, '0')
  })
  return `#${ch.join('')}`
}

/** A filled, outlined shape. */
const fill = (d: string, color: string, sw = 1.8) =>
  `<path d="${d}" fill="${color}" stroke="${OUT}" stroke-width="${sw}" stroke-linejoin="round"/>`

/** A coloured stroke with a dark outline under it (for line glyphs). */
const line = (d: string, color: string, w = 2.4) =>
  `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${w + 2}" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`

const dot = (cx: number, cy: number, r: number, color = OUT) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`

const circle = (cx: number, cy: number, r: number, color: string, sw = 1.5) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="${OUT}" stroke-width="${sw}"/>`

/** A gear outline with `teeth` teeth around (cx, cy). */
function gearPath(cx: number, cy: number, outer: number, inner: number, teeth: number): string {
  const pts: string[] = []
  const step = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i++) {
    const a = i * step
    for (const [da, r] of [
      [-0.3, inner],
      [-0.18, outer],
      [0.18, outer],
      [0.3, inner],
    ] as const) {
      const ang = a + da * step * 1.6
      pts.push(`${(cx + Math.cos(ang) * r).toFixed(1)} ${(cy + Math.sin(ang) * r).toFixed(1)}`)
    }
  }
  return `M${pts.join(' L')}Z`
}

// Emblem glyphs, drawn in a 24×24 box.
const EMBLEMS: Record<HeroEmblem, (c: string) => string> = {
  ball: (c) => circle(12, 12, 7.5, c, 1.8) + dot(9.5, 9.5, 2, '#fff'),
  shield: (c) =>
    fill('M12 3 19 6v6c0 5-4 8-7 9-3-1-7-4-7-9V6z', c) + line('M12 7v10M8 11h8', shade(c, 0.6), 1.6),
  axe: (c) => line('M7 21 16 5', '#a9744f', 2.2) + fill('M12 4c6-1 9 3 9 8l-6-2-3-6z', c),
  bow: (c) =>
    line('M8 3v18', '#fff', 1) + line('M8 3c9 3 9 15 0 18', c, 2.4) + line('M3 12h16M16 9l3 3-3 3', c, 1.6),
  flame: (c) =>
    fill('M12 2c2 5 7 7 7 12a7 7 0 0 1-14 0c0-4 3-6 4-9 1 3 2 4 3 4-1-2-1-5 0-7z', c) +
    fill('M12 13c1.5 2 3 3 3 5a3 3 0 0 1-6 0c0-2 2-3 3-5z', shade(c, 0.6), 1.2),
  bomb: (c) => circle(11, 14, 7, c, 1.8) + line('M15 8q2-4 5-4', DARK, 1.6) + dot(20.5, 3.5, 1.8, GOLD),
  bolt: (c) => fill('M14 2 5 13h6l-2 9 10-12h-6z', c),
  coin: (c) =>
    circle(12, 12, 8.5, c, 1.8) + circle(12, 12, 5.5, shade(c, 0.35), 1.2) + line('M12 9v6', OUT, 0.6),
  book: (c) =>
    fill('M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1z', c) +
    line('M12 6v14', OUT, 0.4) +
    line('M6 9h3M15 9h3', '#fff', 0.8),
  heart: (c) => fill('M12 20C4 14 3 9 6 6c2.5-2.5 5-1 6 1 1-2 3.5-3.5 6-1 3 3 2 8-6 14z', c),
  fang: (c) => fill('M4 5h16l-3 3-2 11-3-10-3 10-2-11z', c) + line('M4 5h16', DARK, 1.2),
  twin: (c) => circle(8, 14, 5, c, 1.6) + circle(16, 10, 5, shade(c, 0.3), 1.6),
  fist: (c) =>
    fill('M5 9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z', c) +
    line('M9 7v5M13 7v5', OUT, 0.3) +
    fill('M5 13h6a2 2 0 0 1 0 4H7', shade(c, 0.3), 1.4),
  wing: (c) =>
    fill('M3 19C5 10 12 4 21 4c-2 3-4 4-6 4 3 1 3 3-1 4 2 1 1 3-2 3-2 2-5 4-9 4z', c) +
    line('M7 15c3-2 6-5 9-8', shade(c, -0.3), 0.8),
  dice: (c) =>
    fill('M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z', c) +
    dot(8.5, 8.5, 1.6) +
    dot(12, 12, 1.6) +
    dot(15.5, 15.5, 1.6),
  skull: (c) =>
    fill('M12 3a8 8 0 0 1 8 8v4h-4v5H8v-5H4v-4a8 8 0 0 1 8-8z', c) +
    dot(8.8, 11.5, 2.2) +
    dot(15.2, 11.5, 2.2) +
    line('M11 17v3M13 17v3', OUT, 0.3),
  gear: (c) => fill(gearPath(12, 12, 10, 7, 8), c, 1.5) + circle(12, 12, 3, '#fff', 1.4),
  lotus: (c) =>
    fill('M12 20C7 20 2 16 2 10c5 1 8 5 10 10z', shade(c, -0.15)) +
    fill('M12 20c5 0 10-4 10-10-5 1-8 5-10 10z', shade(c, -0.15)) +
    fill('M12 3c3.5 4 3.5 12 0 17-3.5-5-3.5-13 0-17z', c),
  gem: (c) => fill('M7 4h10l4 5-9 12L3 9z', c) + line('M3 9h18M9 4l3 5 3-5M12 9v11', shade(c, 0.6), 0.7),
  sun: (c) =>
    line(
      'M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1',
      c,
      1.8,
    ) + circle(12, 12, 5.5, c, 1.6),
  anchor: (c) =>
    line('M12 7.5V20M8 10.5h8M5 14.5q1 5.5 7 5.5t7-5.5', c, 2.2) + circle(12, 5, 2.5, '#fff', 1.6),
  snow: (c) =>
    line(
      'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M10 3.5l2 2 2-2M10 20.5l2-2 2 2M4 10l2.8-.8-.8-2.7M20 14l-2.8.8.8 2.7M4 14l2.8.8-.8 2.7M20 10l-2.8-.8.8-2.7',
      c,
      1.6,
    ),
  star: (c) => fill('M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z', c) + dot(12, 12, 1.8),
  rock: (c) => fill('M4 17 6 9l5-4 6 2 3 6-2 6-10 1z', c) + line('M10 9l2 4-2 3', shade(c, -0.35), 0.9),
  dragon: (c) =>
    fill('M3 15 8 9l3-6 1 5 5-1 4 4-2 3h-5l-2 6-6-1z', c) +
    dot(13.5, 10.5, 1.4) +
    line('M18 13.5h2', OUT, 0.4) +
    fill('M8 9 5 5l5 1', shade(c, -0.25), 1.2),
}

/** Just the emblem (small badge glyph), viewBox 0 0 24 24, in `color` (default def.color). */
export function heroEmblem(emblem: HeroEmblem, color: string, size = 24): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">${EMBLEMS[emblem](color)}</svg>`
}

/** The head's top half (for caps, hair, wraps): head is a circle at (32, 28) r 14. */
const DOME = 'M18 27a14 14 0 0 1 28 0z'
const hair = (color = HAIR) => fill('M18 27a14 14 0 0 1 28 0c-4-3-8-1-10-4-3 3-10 2-18 4z', color)

// Headgear, drawn over the face. `c` is the hero's colour.
const HATS: Record<HeroHat, (c: string) => string> = {
  cap: (c) =>
    fill(DOME, c) + fill('M30 23h17a2.5 2.5 0 0 1 0 5H30z', shade(c, -0.25)) + dot(32, 13.5, 1.6, '#fff'),
  helmet: (c) =>
    fill('M16 28a16 16 0 0 1 32 0z', STEEL) +
    fill('M17 21h30a2 2 0 0 1 0 6H17a2 2 0 0 1 0-6z', shade(c, -0.3)) +
    line('M32 12V5', c, 3),
  horns: (c) =>
    fill('M20 20C14 18 11 12 13 5c2 5 6 8 10 9z', '#f1e6c8') +
    fill('M44 20c6-2 9-8 7-15-2 5-6 8-10 9z', '#f1e6c8') +
    fill(DOME, shade(c, -0.25)) +
    line('M18 26h28', GOLD, 1.6),
  hood: (c) =>
    fill('M13 42C11 22 20 9 32 9s21 13 19 33h-6c1-14-4-23-13-23s-14 9-13 23z', shade(c, -0.2)) +
    line('M32 9v4', shade(c, -0.45), 1),
  wizard: (c) =>
    fill('M20 19 38 2c1 6 4 12 6 17z', c) +
    fill('M14 20c0-3 36-3 36 0s-36 3-36 0z', shade(c, -0.25)) +
    fill('M33 9l1 2 2 .3-1.6 1.4.4 2.2-1.8-1-1.8 1 .4-2.2L30 11.3l2-.3z', GOLD, 0.8),
  crown: () =>
    hair() +
    fill('M20 19V8l5.5 5L32 5l6.5 8L44 8v11z', GOLD) +
    dot(32, 15, 1.8, '#ff6b6b') +
    dot(25, 16, 1.3, '#4dabf7') +
    dot(39, 16, 1.3, '#4dabf7'),
  halo: () =>
    hair('#e9c46a') +
    `<ellipse cx="32" cy="8" rx="11" ry="3.2" fill="none" stroke="${OUT}" stroke-width="4.5"/>` +
    `<ellipse cx="32" cy="8" rx="11" ry="3.2" fill="none" stroke="${GOLD}" stroke-width="2.5"/>`,
  tophat: (c) =>
    hair() +
    fill('M23 4h18v13H23z', DARK) +
    fill('M23 12h18v4H23z', c, 1.2) +
    fill('M16 16h32a2 2 0 0 1 0 4H16a2 2 0 0 1 0-4z', DARK),
  bandana: (c) =>
    hair() +
    fill('M18 22q14-8 28 0v5q-14-7-28 0z', c) +
    fill('M45 23l7-4-1 5 3 4-8-2z', shade(c, -0.2)) +
    dot(26, 20.5, 1, '#fff') +
    dot(36, 20, 1, '#fff'),
  mask: (c) =>
    fill(DOME, DARK) +
    fill('M18.3 31h27.4a14 14 0 0 1-27.4 0z', DARK) +
    fill('M45 25l8-3-2 5 3 3-9-2z', c, 1.4) +
    line('M19 26.5h26', c, 1.2),
  tricorn: () =>
    hair() +
    fill('M12 21Q32 2 52 21q-20-6-40 0z', '#3b2f2f') +
    line('M14 20q18-5 36 0', GOLD, 1.2) +
    dot(32, 13, 2.2, '#f8f9fa'),
  spikes: (c) => fill('M18 27 15 13l7 4 3-12 6 9 5-11 3 11 8-5-3 14q-14-5-28 0z', shade(c, -0.35)),
  goggles: (c) =>
    hair() +
    line('M18 21h28', DARK, 2.4) +
    circle(26, 20, 4.5, '#a5d8ff', 1.8) +
    circle(38, 20, 4.5, '#a5d8ff', 1.8) +
    dot(24.5, 18.5, 1.2, '#fff') +
    dot(36.5, 18.5, 1.2, '#fff') +
    line('M30.5 20h3', shade(c, -0.2), 1.4),
  none: () => hair(),
}

let uid = 0

/** A hero's portrait as an inline SVG string, viewBox 0 0 64 64, `size` px wide/high. */
export function heroPortrait(def: HeroDef, size = 64): string {
  const gid = `bs-hero-${def.id}-${++uid}`
  const c = def.color
  const backdrop =
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${shade(c, 0.55)}"/><stop offset="1" stop-color="${shade(c, -0.15)}"/>` +
    `</linearGradient></defs>` +
    `<rect x="1" y="1" width="62" height="62" rx="14" fill="url(#${gid})" stroke="${OUT}" stroke-width="2"/>`
  const body = fill('M9 63c0-14 10-21 23-21s23 7 23 21z', c, 2) + fill('M27 42h10l-5 7z', shade(c, 0.45), 1.2)
  const face =
    circle(32, 28, 14, def.skin, 2) +
    dot(27, 29, 1.9) +
    dot(37, 29, 1.9) +
    dot(23.5, 33, 1.8, '#ff8787') +
    dot(40.5, 33, 1.8, '#ff8787') +
    `<path d="M29.5 34q2.5 2.2 5 0" fill="none" stroke="${OUT}" stroke-width="1.6" stroke-linecap="round"/>`
  const badge =
    circle(50, 52, 10, '#fff8e8', 1.8) +
    `<svg x="41.5" y="43.5" width="17" height="17" viewBox="0 0 24 24">${EMBLEMS[def.emblem](c)}</svg>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">` +
    `${backdrop}<clipPath id="${gid}-clip"><rect x="2" y="2" width="60" height="60" rx="13"/></clipPath>` +
    `<g clip-path="url(#${gid}-clip)">${body}</g>${face}${HATS[def.hat](c)}${badge}</svg>`
  )
}
