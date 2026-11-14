// Reaction drawings (64×64), custom so they look the same on every device.

const INK = '#2b2340'
const TEAR = '#5ab8ff'
const pair = (svg: string) => `${svg}<g transform="matrix(-1 0 0 1 64 0)">${svg}</g>`
const face = (fill = '#ffd43b', edge = '#e6a800') =>
  `<circle cx="32" cy="34" r="25" fill="${fill}" stroke="${edge}" stroke-width="2.5"/>`
const stroke = (w = 3) =>
  `stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"`

const MIC_STAND = `<path d="M15 30a17 17 0 0 0 34 0M32 47v8M22 57h20" stroke="#6b7699" stroke-width="4" stroke-linecap="round" fill="none"/>`
const mic = (body: string, edge: string) =>
  MIC_STAND +
  `<rect x="22" y="6" width="20" height="33" rx="10" fill="${body}" stroke="${edge}" stroke-width="2.5"/>` +
  `<path d="M24 16h16M24 22h16M24 28h16" stroke="${edge}" stroke-width="1.8" opacity=".55"/>`
const HEADSET =
  `<path d="M10 38v-6a22 22 0 0 1 44 0v6" stroke="#6b7699" stroke-width="5" stroke-linecap="round" fill="none"/>` +
  pair(
    `<rect x="5" y="33" width="13" height="21" rx="6" fill="#5ab8ff" stroke="#2f8fe0" stroke-width="2.5"/>`,
  )

function starburst(points: number, outer: number, inner: number): string {
  const pts = Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer
    const a = (Math.PI * i) / points - Math.PI / 2
    return `${(32 + r * Math.cos(a)).toFixed(1)},${(32 + r * Math.sin(a)).toFixed(1)}`
  })
  return pts.join(' ')
}

/** A thumbs-up hand (blue cuff + fist); flipped for thumbs down. */
const thumb = () =>
  `<rect x="5" y="28" width="12" height="28" rx="3" fill="#5ab8ff" stroke="#2f8fe0" stroke-width="2.5"/>` +
  `<path d="M19 30L29 9q7-3 8 5l-2 12h15a6 6 0 0 1 5.5 7.5l-4.5 19a6 6 0 0 1-6 4.5H19Z" fill="#ffc98b" stroke="#e8964a" stroke-width="2.5" stroke-linejoin="round"/>` +
  `<path d="M37 34h14M36 42h12M35 50h10" stroke="#e8964a" stroke-width="2" stroke-linecap="round"/>`

const ART: Record<string, string> = {
  like: thumb(),
  dislike: `<g transform="rotate(180 32 32)">${thumb()}</g>`,
  haha:
    face() +
    pair(`<path d="M17 30q5-7 10 0" ${stroke()}/>`) +
    `<path d="M15 36h34q-2 19-17 19t-17-19Z" fill="${INK}"/><path d="M19 37h26q-1 4-3 5H22q-2-1-3-5Z" fill="#fff"/><ellipse cx="32" cy="50" rx="8" ry="3.5" fill="#ff6f91"/>`,
  thinking:
    face() +
    `<path d="M17 22l9-2M38 19l9 3" ${stroke(2.5)}/>` +
    `<circle cx="23" cy="30" r="3.2" fill="${INK}"/><circle cx="41" cy="29" r="3.2" fill="${INK}"/>` +
    `<path d="M25 42q6-3 13 0" ${stroke()}/>` +
    `<path d="M14 58q-2-8 6-10l10-1q4 0 4 3t-4 3h-5l6 2q3 2 1 5t-6 2Z" fill="#ffc98b" stroke="#e8964a" stroke-width="2.2" stroke-linejoin="round"/>`,
  laugh:
    face() +
    pair(`<path d="M18 28q5-6 10 0" ${stroke()}/>`) +
    `<path d="M17 37h30q-2 17-15 17t-15-17Z" fill="${INK}"/><ellipse cx="32" cy="49" rx="7" ry="3.5" fill="#ff6f91"/>` +
    pair(`<path d="M10 27q-6 7-3 11q4 3 7-1q1-4-4-10Z" fill="${TEAR}"/>`),
  fire:
    `<path d="M32 3C37 16 52 22 52 40a20 20 0 0 1-40 0c0-9 4-14 9-17c0 7 3 10 6 10C25 22 27 12 32 3Z" fill="#ff5a1f"/>` +
    `<path d="M33 20c3 9 11 12 11 22a12 12 0 0 1-24 0c0-6 3-9 6-10c0 4 2 6 4 6c-1-6 1-12 3-18Z" fill="#ffb02e"/>` +
    `<ellipse cx="32" cy="46" rx="6" ry="8" fill="#fff3b0"/>`,
  gg:
    `<rect x="3" y="17" width="58" height="34" rx="14" fill="#5b3fc4"/><rect x="3" y="13" width="58" height="34" rx="14" fill="#8d6cd9"/>` +
    `<text x="32" y="40" text-anchor="middle" font-family="Fredoka, ui-rounded, system-ui, sans-serif" font-size="26" font-weight="800" fill="#fff" stroke="#4b2f99" stroke-width="1.5" paint-order="stroke">GG</text>` +
    `<path d="M54 4l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6Z" fill="#ffc83d"/><path d="M9 52l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z" fill="#ffc83d"/>`,
  rage:
    pair(`<circle cx="12" cy="9" r="4" fill="#d9dcef"/><circle cx="7" cy="5" r="2.5" fill="#d9dcef"/>`) +
    face('#ff5d5d', '#d63a3a') +
    pair(`<path d="M16 23l12 5" ${stroke(3.5)}/><circle cx="23" cy="32" r="3.2" fill="${INK}"/>`) +
    `<rect x="19" y="40" width="26" height="10" rx="3" fill="#fff" stroke="${INK}" stroke-width="2.5"/><path d="M19 45h26M25.5 40v10M32 40v10M38.5 40v10" stroke="${INK}" stroke-width="1.5"/>`,
  cry:
    face() +
    pair(`<path d="M18 30q5 4 10 0" ${stroke()}/><path d="M17 23l9-3" ${stroke(2.5)}/>`) +
    `<path d="M24 48q8-7 16 0" ${stroke()}/>` +
    pair(
      `<path d="M21 34q-2 9 0 22" stroke="${TEAR}" stroke-width="5" stroke-linecap="round" fill="none" opacity=".9"/>`,
    ),
  clap:
    pair(
      `<g transform="rotate(-20 24 36)"><rect x="14" y="16" width="19" height="36" rx="9.5" fill="#ffc98b" stroke="#e8964a" stroke-width="2"/><rect x="10" y="30" width="8" height="15" rx="4" fill="#ffc98b" stroke="#e8964a" stroke-width="2"/><rect x="13" y="50" width="21" height="9" rx="3" fill="#5ab8ff"/></g>`,
    ) +
    pair(
      `<path d="M24 9l-3-5M17 12l-5-3M31 7V2" stroke="#ffc83d" stroke-width="2.5" stroke-linecap="round"/>`,
    ),
  skull:
    `<circle cx="32" cy="28" r="21" fill="#f4f1ff"/><rect x="19" y="38" width="26" height="18" rx="5" fill="#f4f1ff"/>` +
    pair(
      `<ellipse cx="23.5" cy="29" rx="6.5" ry="7.5" fill="${INK}"/><circle cx="25" cy="28" r="1.8" fill="#ff6b6b"/>`,
    ) +
    `<path d="M32 36l-3.5 6h7Z" fill="${INK}"/><path d="M26 47v8M32 47v8M38 47v8" stroke="#c9c4ec" stroke-width="2"/>`,
  heart:
    `<path d="M32 57C13 45 5 34 5 23a13 13 0 0 1 27-7a13 13 0 0 1 27 7c0 11-8 22-27 34Z" fill="#ff4d6d" stroke="#d92a4b" stroke-width="2.5"/>` +
    `<ellipse cx="18" cy="22" rx="5" ry="3.5" transform="rotate(-35 18 22)" fill="#fff" opacity=".65"/>`,
  eyes:
    `<ellipse cx="19" cy="32" rx="12" ry="16" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="25" cy="35" r="6" fill="${INK}"/><circle cx="27" cy="33" r="2" fill="#fff"/>` +
    `<ellipse cx="45" cy="32" rx="12" ry="16" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="51" cy="35" r="6" fill="${INK}"/><circle cx="53" cy="33" r="2" fill="#fff"/>`,
  boom:
    `<polygon points="${starburst(12, 31, 20)}" fill="#ffc83d" stroke="#ff6b2c" stroke-width="3" stroke-linejoin="round"/>` +
    `<polygon points="${starburst(12, 21, 14)}" fill="#ff6b2c"/>` +
    `<text x="32" y="37" text-anchor="middle" transform="rotate(-10 32 32)" font-family="Fredoka, ui-rounded, system-ui, sans-serif" font-size="14" font-weight="800" fill="#fff">BOOM</text>`,
  crown:
    `<path d="M9 48L6 18L20 31L32 10L44 31L58 18L55 48Z" fill="#ffc83d" stroke="#c98f00" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<rect x="8" y="44" width="48" height="11" rx="3" fill="#f0a500"/>` +
    `<circle cx="20" cy="49.5" r="3.2" fill="#ff4d6d"/><circle cx="32" cy="49.5" r="3.6" fill="#5ab8ff"/><circle cx="44" cy="49.5" r="3.2" fill="#4be3a0"/>` +
    `<circle cx="6" cy="18" r="3.5" fill="#ffc83d"/><circle cx="32" cy="10" r="3.8" fill="#ffc83d"/><circle cx="58" cy="18" r="3.5" fill="#ffc83d"/>`,
  sweat:
    face() +
    pair(`<circle cx="24" cy="32" r="3.2" fill="${INK}"/><path d="M18 24l9-3" ${stroke(2.5)}/>`) +
    `<path d="M22 45q5-4 10 0t10 0" ${stroke()}/>` +
    `<path d="M51 8q-8 11-6 17a6.5 6.5 0 0 0 13 0q0-6-7-17Z" fill="${TEAR}" stroke="#2f8fe0" stroke-width="1.5"/><ellipse cx="49" cy="23" rx="1.6" ry="3" fill="#fff" opacity=".8"/>`,
  'mic-on':
    mic('#4be3a0', '#22a872') +
    pair(
      `<path d="M13 12q-5 10 0 20M7 8q-7 14 0 28" stroke="#4be3a0" stroke-width="3" stroke-linecap="round" fill="none"/>`,
    ),
  'mic-off':
    mic('#ff6b6b', '#d63a3a') +
    `<path d="M10 6L54 54" stroke="#fff" stroke-width="9" stroke-linecap="round"/><path d="M10 6L54 54" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
  'hear-me':
    HEADSET +
    `<circle cx="32" cy="34" r="12" fill="#ffc83d" stroke="#c98f00" stroke-width="2.5"/>` +
    `<text x="32" y="41" text-anchor="middle" font-family="Fredoka, ui-rounded, system-ui, sans-serif" font-size="19" font-weight="800" fill="${INK}">?</text>`,
  'cant-hear':
    HEADSET +
    `<circle cx="32" cy="34" r="12" fill="#ff4d6d" stroke="#d92a4b" stroke-width="2.5"/>` +
    `<path d="M27 29l10 10M37 29l-10 10" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>`,
}

/** Trusted inline SVG markup for a reaction; unknown ids draw nothing. */
export function reactionSvg(id: string): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${ART[id] ?? ''}</svg>`
}
