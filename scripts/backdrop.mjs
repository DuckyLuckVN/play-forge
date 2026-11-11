// The pixel-arcade backdrop: a banded sunset sky (plum to orange to gold) with
// a few early stars and a big sun setting behind the mountains,
// parallax brown mountains, hills and a grass-and-dirt ground scrolling left at
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

/** Rects for a filled circle of radius r centred on a size×size grid, one rect per row. */
export function discRects(size, r, color) {
  const c = (size - 1) / 2
  const rects = []
  for (let y = 0; y < size; y++) {
    const dy = (y - c) ** 2
    if (dy > r * r) continue
    const s = Math.sqrt(r * r - dy)
    const from = Math.max(0, Math.ceil(c - s))
    const to = Math.min(size - 1, Math.floor(c + s))
    if (to >= from) rects.push([from, y, to - from + 1, 1, color])
  }
  return rects
}

// ---- Themes: every colour of the scene (the shapes and motion are shared) ----

/**
 * Sky bands [colour, ends at %] top to bottom (keep the top dark enough for
 * light text), stars on/off, the sun (or moon) and its height, cloud, far
 * mountains, near hills and ground colours.
 */
export const THEMES = {
  sunset: {
    sky: [
      ['#2a1638', 14],
      ['#43193f', 26],
      ['#6b2346', 38],
      ['#9c3346', 50],
      ['#cc4d40', 61],
      ['#ea7339', 72],
      ['#f79d3c', 82],
      ['#ffc65e', 100],
    ],
    stars: true,
    sun: {
      halo: ['rgb(255 170 80 / .2)', 'rgb(255 190 100 / .35)'],
      core: '#ffd36b',
      inner: '#ffe9a6',
      shine: '#fff6d6',
      high: false,
    },
    cloud: ['#ff9f7f', '#d9614f'],
    far: ['#8c4a35', '#bd6a45'],
    near: ['#5a2e22', '#80452e'],
    ground: { grass: '#9bd84e', grassDark: '#5c9a2c', dirt: '#7a4128', mortar: '#4e2817' },
  },
  autumn: {
    sky: [
      ['#4a2016', 14],
      ['#6e2e1a', 26],
      ['#93401f', 38],
      ['#b85a27', 50],
      ['#d67a32', 61],
      ['#eb9c42', 72],
      ['#f6bb5c', 84],
      ['#fbd788', 100],
    ],
    stars: false,
    sun: {
      halo: ['rgb(255 230 170 / .2)', 'rgb(255 230 170 / .35)'],
      core: '#fff0c2',
      inner: '#fff8e0',
      shine: '#ffffff',
      high: true,
    },
    cloud: ['#ffe2b8', '#e9b07a'],
    far: ['#9a4b26', '#c26a34'],
    near: ['#5c3519', '#7f4d24'],
    ground: { grass: '#e8902c', grassDark: '#a8561a', dirt: '#5c3a22', mortar: '#3c2414' },
  },
  canyon: {
    sky: [
      ['#16344d', 14],
      ['#1f4a66', 26],
      ['#2f6582', 38],
      ['#4f879c', 50],
      ['#86adaa', 60],
      ['#d9c08e', 72],
      ['#f2a85e', 86],
      ['#f78a4a', 100],
    ],
    stars: false,
    sun: {
      halo: ['rgb(255 250 220 / .2)', 'rgb(255 250 220 / .35)'],
      core: '#fff6c8',
      inner: '#ffffff',
      shine: '#ffffff',
      high: true,
    },
    cloud: ['#fff7ea', '#e6cdb0'],
    far: ['#b4552a', '#d97642'],
    near: ['#7c3a1e', '#a1512b'],
    ground: { grass: '#f2c56b', grassDark: '#c8933c', dirt: '#a8683a', mortar: '#7c4826' },
  },
  candy: {
    sky: [
      ['#311852', 14],
      ['#4c2275', 26],
      ['#713398', 38],
      ['#a24bb0', 50],
      ['#cf67bc', 61],
      ['#ef88c2', 72],
      ['#ffaac8', 84],
      ['#ffcfd2', 100],
    ],
    stars: true,
    sun: {
      halo: ['rgb(255 240 160 / .25)', 'rgb(255 240 160 / .4)'],
      core: '#ffe37a',
      inner: '#fff3b8',
      shine: '#ffffff',
      high: false,
    },
    cloud: ['#ffffff', '#f2bfe0'],
    far: ['#8a4ab4', '#b06fd8'],
    near: ['#5a2a86', '#7a40a8'],
    ground: { grass: '#7ef0c0', grassDark: '#36b886', dirt: '#c0609e', mortar: '#8a3a72' },
  },
  day: {
    sky: [
      ['#1a4590', 14],
      ['#2459aa', 26],
      ['#3270c2', 38],
      ['#4789d4', 50],
      ['#64a3e2', 61],
      ['#86bcec', 72],
      ['#abd3f3', 84],
      ['#d4eaf9', 100],
    ],
    stars: false,
    sun: {
      halo: ['rgb(255 245 170 / .2)', 'rgb(255 245 170 / .35)'],
      core: '#ffe86b',
      inner: '#fff6b8',
      shine: '#ffffff',
      high: true,
    },
    cloud: ['#ffffff', '#c6dbf0'],
    far: ['#5b84b0', '#7ea5cc'],
    near: ['#3b8a48', '#5aab5a'],
    ground: { grass: '#7cd04a', grassDark: '#47992a', dirt: '#8a5a32', mortar: '#5e3a1e' },
  },
  night: {
    sky: [
      ['#10132c', 22],
      ['#161a3a', 44],
      ['#1b1c48', 58],
      ['#232259', 70],
      ['#2f2668', 80],
      ['#40296f', 88],
      ['#5a2d6e', 100],
    ],
    stars: true,
    sun: {
      halo: ['rgb(255 232 168 / .12)', 'rgb(255 232 168 / .18)'],
      core: '#ffe8a8',
      inner: '#f6e2a0',
      shine: '#fff6d6',
      high: true,
    },
    cloud: ['#3d4285', '#2f3470'],
    far: ['#2a2a6a', '#3e3c8c'],
    near: ['#1d2050', '#2c3478'],
    ground: { grass: '#4be3a0', grassDark: '#1f9e68', dirt: '#2b2f6b', mortar: '#1b1f4a' },
  },
}

/** The theme shown until the player picks one. */
export const DEFAULT_BACKDROP = 'canyon'

// ---- The art ----

const COIN = { K: '#c98f00', Y: '#ffc83d', W: '#fff3c4' }

/** The scene's pixel art in a theme's colours (CSS url()s). */
function art(theme) {
  const { sun, ground: g } = theme
  const groundRects = [
    [0, 0, 32, 16, g.dirt], // bricks
    [0, 0, 32, 3, g.grass],
    [0, 3, 32, 1, g.grassDark],
  ]
  for (const x of [2, 9, 15, 22, 28]) groundRects.push([x, 3, 2, 1, g.grass]) // grass tufts
  for (const y of [7, 11, 15]) groundRects.push([0, y, 32, 1, g.mortar]) // mortar rows
  for (const [x, y] of [
    [7, 4],
    [23, 4],
    [15, 8],
    [31, 8],
    [7, 12],
    [23, 12],
  ])
    groundRects.push([x, y, 1, 3, g.mortar])
  return {
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
      [14, 33, 3, 1, '#ffe8a8'],
      [15, 32, 1, 3, '#ffe8a8'],
    ]),
    sun: svgUrl(40, 40, [
      ...discRects(40, 20, sun.halo[0]), // stepped halo
      ...discRects(40, 17, sun.halo[1]),
      ...discRects(40, 14, sun.core),
      ...discRects(40, 10, sun.inner),
      [13, 10, 5, 2, sun.shine],
      [12, 12, 2, 3, sun.shine],
    ]),
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
        ...theme.far,
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
        ...theme.near,
      ),
    ),
    ground: svgUrl(32, 16, groundRects),
    cloud: sprite(
      ['.....WWWW.......', '...WWWWWWWW.WW..', '.WWWWWWWWWWWWWW.', 'WWWWWWWWWWWWWWWW', '.SSSSSSSSSSSSSS.'],
      { W: theme.cloud[0], S: theme.cloud[1] },
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

/** The custom properties that paint one theme (the shared rules below read them). */
function themeVars(theme) {
  const ART = art(theme)
  const sky = theme.sky.map(([c, to], i) => `${c} ${i ? theme.sky[i - 1][1] : 0}% ${to}%`).join(',')
  return [
    `--bd-sky:linear-gradient(${sky})`,
    `--bd-stars:${theme.stars ? 'visible' : 'hidden'}`,
    `--bd-sun:${ART.sun}`,
    `--bd-sun-top:${theme.sun.high ? '7%' : 'auto'}`,
    `--bd-sun-bottom:${theme.sun.high ? 'auto' : 'calc(52*var(--px))'}`,
    `--bd-far:${ART.far}`,
    `--bd-near:${ART.near}`,
    `--bd-ground:${ART.ground}`,
    `--bd-cloud:${ART.cloud}`,
  ].join(';')
}

/**
 * Standalone CSS for the backdrop with every theme in `themes`: `fallback` (or
 * the first) paints with no data-bd, the others apply with `data-bd="<key>"`.
 */
export function backdropCss(themes = THEMES, fallback = DEFAULT_BACKDROP) {
  const first = [fallback, themes[fallback] ?? Object.values(themes)[0]]
  const rest = Object.entries(themes).filter(([key]) => key !== fallback)
  const ART = art(first[1]) // theme-independent art: stars, coin, heart, star
  return `
.pf-bd{--px:4px;${themeVars(first[1])};position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;image-rendering:pixelated;background:var(--bd-sky)}
${rest.map(([key, theme]) => `.pf-bd[data-bd="${key}"]{${themeVars(theme)}}`).join('\n')}
.pf-bd>*{position:absolute}
.pf-bd-stars{inset:0 0 58%;visibility:var(--bd-stars);background:${ART.stars} 0 0/calc(64*var(--px)) calc(48*var(--px))}
.pf-bd-stars+.pf-bd-stars{background:${ART.stars2} 0 0/calc(80*var(--px)) calc(56*var(--px));animation:pf-bd-blink 1.6s steps(1) infinite}
.pf-bd-sun{top:var(--bd-sun-top);bottom:var(--bd-sun-bottom);right:12%;width:calc(40*var(--px));height:calc(40*var(--px));background:var(--bd-sun) 0 0/100% 100%}
.pf-bd-pan{left:0;width:calc(100% + var(--tw));height:var(--th);background:var(--art) 0 0/var(--tw) var(--th) repeat-x;animation:pf-bd-pan var(--d) linear infinite}
.pf-bd-far{--tw:calc(160*var(--px));--th:calc(56*var(--px));--art:var(--bd-far);--d:90s;bottom:calc(30*var(--px))}
.pf-bd-near{--tw:calc(160*var(--px));--th:calc(32*var(--px));--art:var(--bd-near);--d:45s;bottom:calc(14*var(--px))}
.pf-bd-ground{--tw:calc(32*var(--px));--th:calc(16*var(--px));--art:var(--bd-ground);--d:6s;bottom:0}
.pf-bd-cloud{left:0;top:var(--y);width:calc(16*var(--px));height:calc(5*var(--px));background:var(--bd-cloud) 0 0/100% 100%;scale:var(--k);animation:pf-bd-drift var(--d) var(--w) linear infinite}
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
}

/** The backdrop CSS with every theme (canyon when nothing is chosen). */
export const BACKDROP_CSS = backdropCss()

// ---- The player's choice: a theme or "random"; canyon until they pick ----

/** localStorage key for the chosen theme; sessionStorage key for this visit's random pick. */
export const BACKDROP_KEY = 'play-forge:backdrop'
/** What the picker offers: random first, then every theme. */
export const BACKDROP_CHOICES = ['random', ...Object.keys(THEMES)]

/**
 * Sets the theme on a .pf-bd element from the saved choice (`fallback` when
 * nothing or an unknown theme is saved) and returns it.
 * "Random" picks one theme per visit (kept in sessionStorage), so the
 * launcher and the game's loading splash match. Self-contained (no outside
 * references): the splash inlines its source as a script that runs before
 * first paint (BACKDROP_PICK_JS). Storage may throw (private mode, blocked).
 */
export function applyBackdropChoice(el, keys, fallback, random = Math.random) {
  const KEY = 'play-forge:backdrop'
  let choice = fallback
  try {
    choice = localStorage.getItem(KEY) || fallback
  } catch {
    // storage blocked: fall through
  }
  let key = choice
  if (choice !== 'random' && keys.indexOf(key) < 0) key = fallback
  if (keys.indexOf(key) < 0) {
    try {
      key = sessionStorage.getItem(KEY) || ''
    } catch {
      // storage blocked: fall through
    }
    if (keys.indexOf(key) < 0) {
      key = keys[Math.floor(random() * keys.length)]
      try {
        sessionStorage.setItem(KEY, key)
      } catch {
        // storage blocked: fall through
      }
    }
  }
  if (el) el.setAttribute('data-bd', key)
  return key
}

/** The saved choice: a theme key or "random" (canyon if nothing is saved). */
export function getBackdropChoice() {
  try {
    const saved = localStorage.getItem(BACKDROP_KEY)
    if (saved && BACKDROP_CHOICES.includes(saved)) return saved
  } catch {
    // storage blocked: the default
  }
  return DEFAULT_BACKDROP
}

/** Saves the choice; picking "random" again rolls a new theme for this visit. */
export function saveBackdropChoice(choice) {
  try {
    localStorage.setItem(BACKDROP_KEY, choice)
    if (choice === 'random') sessionStorage.removeItem(BACKDROP_KEY)
  } catch {
    // storage blocked: the choice lasts until the page closes
  }
}

/** Inline script for the splash: put it right after backdropMarkup(). */
export const BACKDROP_PICK_JS = `(${applyBackdropChoice})(document.currentScript.previousElementSibling,${JSON.stringify(Object.keys(THEMES))},${JSON.stringify(DEFAULT_BACKDROP)})`

/** The backdrop element (no <style>: pair it with BACKDROP_CSS; theme via data-bd). Static, trusted markup. */
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
    `<div class="pf-bd-stars"></div><div class="pf-bd-stars"></div><div class="pf-bd-sun"></div>` +
    clouds.join('') +
    `<div class="pf-bd-pan pf-bd-far"></div><div class="pf-bd-pan pf-bd-near"></div><div class="pf-bd-pan pf-bd-ground"></div>` +
    pickups.join('') +
    `</div>`
  )
}
