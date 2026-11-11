// The pixel-arcade backdrop: a banded dusk sky with pixel stars and a moon,
// parallax mountains, hills and a grass-and-brick ground scrolling left at
// different speeds, drifting clouds and a few spinning coins, hearts and stars.
// Shared by the launcher (launcher/main.ts) and the game loading splash
// (scripts/splash.mjs), so the two feel like one place.
//
// Plain HTML + CSS with raw colours (the splash paints before any token CSS or
// script); the pixel art is tiny inline SVGs generated below. No text, nothing
// to translate, decorative only (aria-hidden), no pointer events. Only
// transform/opacity animate (composited, no repaints); reduced motion stops it.
// Colours mirror engine/ui/theme.ts.

// ---- Pixel-art helpers (reusable: one unit = one art pixel, scaled by --px) ----

/**
 * An SVG data URL from rects [x, y, w, h, colour] on a w×h pixel grid. Later
 * rects paint over earlier ones; consecutive rects of one colour share a <path>,
 * and only the characters a CSS url() needs are escaped, to keep pages small.
 */
export function svgUrl(w, h, rects) {
  const paths = []
  for (const [x, y, rw, rh, c] of rects) {
    const d = `M${x} ${y}h${rw}v${rh}h-${rw}z`
    const last = paths[paths.length - 1]
    if (last?.c === c) last.d += d
    else paths.push({ c, d })
  }
  const body = paths.map(({ c, d }) => `<path fill='${c}' d='${d}'/>`).join('')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' width='${w}' height='${h}' shape-rendering='crispEdges'>${body}</svg>`
  const escaped = svg.replace(
    /[%#<>"]/g,
    (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'),
  )
  return `url("data:image/svg+xml,${escaped}")`
}

/** Rects for ASCII art: one character per pixel, `.` (or a missing key) is empty; runs merge. */
export function spriteRects(rows, colors) {
  const rects = []
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const c = colors[row[x]]
      let end = x + 1
      while (end < row.length && row[end] === row[x]) end++
      if (c) rects.push([x, y, end - x, 1, c])
      x = end
    }
  })
  return rects
}

/** An ASCII sprite as an SVG data URL. */
export function sprite(rows, colors) {
  return svgUrl(Math.max(...rows.map((r) => r.length)), rows.length, spriteRects(rows, colors))
}

/**
 * A ridge that tiles seamlessly left to right: column heights from whole-period
 * sines (quantised to 2 px for a chunky look), a body colour and a 1 px lit edge.
 */
export function ridgeRects(w, h, base, waves, body, edge) {
  const height = (x) => {
    const y =
      base +
      waves.reduce((s, [amp, cycles, phase]) => s + amp * Math.sin((2 * Math.PI * cycles * x) / w + phase), 0)
    return Math.max(2, Math.min(h, Math.round(y / 2) * 2))
  }
  const bodies = []
  const edges = []
  for (let x = 0; x < w;) {
    const top = height(x)
    let end = x + 1
    while (end < w && height(end) === top) end++
    bodies.push([x, h - top, end - x, top, body])
    edges.push([x, h - top, end - x, 1, edge])
    x = end
  }
  // Edges after bodies, so each colour is one run (one <path>).
  return [...bodies, ...edges]
}

// ---- The art ----

const NIGHT = '#161a3a'
const COIN = { K: '#c98f00', Y: '#ffc83d', W: '#fff3c4' }

const ART = {
  stars: svgUrl(64, 48, [
    [5, 6, 1, 1, '#f4f1ff'],
    [22, 14, 1, 1, '#a3a8d6'],
    [41, 4, 1, 1, '#f4f1ff'],
    [57, 19, 1, 1, '#a3a8d6'],
    [12, 29, 1, 1, '#a3a8d6'],
    [33, 36, 1, 1, '#f4f1ff'],
    [50, 42, 1, 1, '#a3a8d6'],
    // A plus-shaped sparkle.
    [29, 23, 3, 1, '#ffc83d'],
    [30, 22, 1, 3, '#ffc83d'],
  ]),
  stars2: svgUrl(80, 56, [
    [9, 11, 1, 1, '#f4f1ff'],
    [47, 8, 1, 1, '#f4f1ff'],
    [70, 30, 1, 1, '#a3a8d6'],
    [25, 44, 1, 1, '#f4f1ff'],
    [60, 50, 1, 1, '#a3a8d6'],
    [14, 33, 3, 1, '#5ab8ff'],
    [15, 32, 1, 3, '#5ab8ff'],
  ]),
  moon: (() => {
    const rects = []
    const disc = (r, c) => {
      // One rect per row: the pixels whose centre-offset lies within r.
      for (let y = 0; y < 22; y++) {
        const dy = (y - 10.5) ** 2
        if (dy > r * r) continue
        const s = Math.sqrt(r * r - dy)
        const from = Math.ceil(10.5 - s)
        const to = Math.floor(10.5 + s)
        if (to >= from) rects.push([from, y, to - from + 1, 1, c])
      }
    }
    disc(11, 'rgb(255 232 168 / .12)') // stepped halo
    disc(9, 'rgb(255 232 168 / .18)')
    disc(7, '#ffe8a8')
    rects.push([7, 8, 2, 2, '#e8cf7f'], [12, 12, 3, 2, '#e8cf7f'], [10, 6, 1, 1, '#e8cf7f'])
    return svgUrl(22, 22, rects)
  })(),
  far: svgUrl(
    160,
    56,
    ridgeRects(
      160,
      56,
      30,
      [
        [12, 2, 0],
        [7, 5, 1],
        [3, 11, 2],
      ],
      '#2a2a6a',
      '#3e3c8c',
    ),
  ),
  near: svgUrl(
    160,
    32,
    ridgeRects(
      160,
      32,
      16,
      [
        [6, 3, 1],
        [4, 7, 2],
      ],
      '#1d2050',
      '#2c3478',
    ),
  ),
  ground: (() => {
    const rects = [
      [0, 0, 32, 16, '#2b2f6b'], // bricks
      [0, 0, 32, 3, '#4be3a0'], // grass
      [0, 3, 32, 1, '#1f9e68'],
    ]
    for (const x of [2, 9, 15, 22, 28]) rects.push([x, 3, 2, 1, '#4be3a0']) // grass tufts
    for (const y of [7, 11, 15]) rects.push([0, y, 32, 1, '#1b1f4a']) // mortar rows
    for (const [x, y] of [
      [7, 4],
      [23, 4],
      [15, 8],
      [31, 8],
      [7, 12],
      [23, 12],
    ])
      rects.push([x, y, 1, 3, '#1b1f4a'])
    return svgUrl(32, 16, rects)
  })(),
  cloud: sprite(
    ['.....WWWW.......', '...WWWWWWWW.WW..', '.WWWWWWWWWWWWWW.', 'WWWWWWWWWWWWWWWW', '.SSSSSSSSSSSSSS.'],
    { W: '#3d4285', S: '#2f3470' },
  ),
  coin: sprite(
    ['..KKKK..', '.KYYYYK.', 'KYYWYYYK', 'KYWYYYYK', 'KYWYYYYK', 'KYYYYYKK', '.KYYYKK.', '..KKKK..'],
    COIN,
  ),
  heart: sprite(['.RR.RR.', 'RWRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'], {
    R: '#ff6b6b',
    W: '#ffd0d0',
  }),
  star: sprite(['...Y...', '...Y...', 'YYYYYYY', '.YYYYY.', '..YYY..', '.YY.YY.', 'YY...YY'], {
    Y: '#ffc83d',
  }),
}

/** Pick-ups floating in the sky: sprite, position (% of the screen), art size (px), bob time (s), delay (s). */
const PICKUPS = [
  ['coin', 9, 22, 8, 1.2, 0],
  ['heart', 86, 30, 7, 1.4, -0.3],
  ['coin', 70, 14, 8, 1.1, -0.6],
  ['star', 24, 44, 7, 1.6, -0.2],
  ['coin', 58, 40, 8, 1.3, -0.9],
  ['heart', 40, 12, 7, 1.5, -0.5],
]

/** Clouds: top (%), drift time (s), delay (s), scale. */
const CLOUDS = [
  [10, 70, -10, 1],
  [26, 95, -60, 0.75],
  [6, 120, -95, 1.25],
]

export const BACKDROP_CSS = `
.pf-bd{--px:4px;position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;image-rendering:pixelated;background:linear-gradient(#10132c 0 22%,${NIGHT} 22% 44%,#1b1c48 44% 58%,#232259 58% 70%,#2f2668 70% 80%,#40296f 80% 88%,#5a2d6e 88%)}
.pf-bd>*{position:absolute}
.pf-bd-stars{inset:0 0 30%;background:${ART.stars} 0 0/calc(64*var(--px)) calc(48*var(--px))}
.pf-bd-stars+.pf-bd-stars{background:${ART.stars2} 0 0/calc(80*var(--px)) calc(56*var(--px));animation:pf-bd-blink 1.6s steps(1) infinite}
.pf-bd-moon{top:9%;right:12%;width:calc(22*var(--px));height:calc(22*var(--px));background:${ART.moon} 0 0/100% 100%}
.pf-bd-pan{left:0;width:calc(100% + var(--tw));height:var(--th);background:var(--art) 0 0/var(--tw) var(--th) repeat-x;animation:pf-bd-pan var(--d) linear infinite}
.pf-bd-far{--tw:calc(160*var(--px));--th:calc(56*var(--px));--art:${ART.far};--d:90s;bottom:calc(30*var(--px))}
.pf-bd-near{--tw:calc(160*var(--px));--th:calc(32*var(--px));--art:${ART.near};--d:45s;bottom:calc(14*var(--px))}
.pf-bd-ground{--tw:calc(32*var(--px));--th:calc(16*var(--px));--art:${ART.ground};--d:6s;bottom:0}
.pf-bd-cloud{left:0;top:var(--y);width:calc(16*var(--px));height:calc(5*var(--px));background:${ART.cloud} 0 0/100% 100%;scale:var(--k);animation:pf-bd-drift var(--d) var(--w) linear infinite}
.pf-bd-pick{left:var(--x);top:var(--y);width:calc(var(--s)*var(--px));height:calc(var(--s)*var(--px));animation:pf-bd-bob var(--d) var(--w) steps(1) infinite}
.pf-bd-pick i{display:block;width:100%;height:100%;background:var(--art) 0 0/100% 100%}
.pf-bd-coin i{--art:${ART.coin};animation:pf-bd-spin 1.2s var(--w) steps(1) infinite}
.pf-bd-heart i{--art:${ART.heart}}
.pf-bd-star i{--art:${ART.star}}
@keyframes pf-bd-pan{to{transform:translateX(calc(-1*var(--tw)))}}
@keyframes pf-bd-drift{from{transform:translateX(-30vw)}to{transform:translateX(130vw)}}
@keyframes pf-bd-bob{50%{transform:translateY(calc(-2*var(--px)))}}
@keyframes pf-bd-spin{25%{transform:scaleX(.6)}50%{transform:scaleX(.2)}75%{transform:scaleX(.6)}}
@keyframes pf-bd-blink{50%{opacity:.3}}
@media (max-width:600px){.pf-bd{--px:3px}.pf-bd-pick{opacity:.7}}
@media (prefers-reduced-motion:reduce){.pf-bd *{animation:none!important}}
`.trim()

/** The backdrop element (no <style>: pair it with BACKDROP_CSS). Static, trusted markup. */
export function backdropMarkup() {
  const clouds = CLOUDS.map(
    ([y, d, w, k]) => `<span class="pf-bd-cloud" style="--y:${y}%;--d:${d}s;--w:${w}s;--k:${k}"></span>`,
  )
  const pickups = PICKUPS.map(
    ([art, x, y, s, d, w]) =>
      `<span class="pf-bd-pick pf-bd-${art}" style="--x:${x}%;--y:${y}%;--s:${s};--d:${d}s;--w:${w}s"><i></i></span>`,
  )
  return (
    `<div class="pf-bd" aria-hidden="true">` +
    `<div class="pf-bd-stars"></div><div class="pf-bd-stars"></div><div class="pf-bd-moon"></div>` +
    clouds.join('') +
    `<div class="pf-bd-pan pf-bd-far"></div><div class="pf-bd-pan pf-bd-near"></div><div class="pf-bd-pan pf-bd-ground"></div>` +
    pickups.join('') +
    `</div>`
  )
}
