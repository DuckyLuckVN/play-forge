// The first paint of a game page: its cover, its title and a loading bar, shown
// while the (single-file, inlined) bundle downloads and starts. createGameApp
// removes it (engine/ui/splash.ts) once the start screen is up.
//
// Built pages put the whole bundle in <head>, so nothing in <body> could paint
// until all of it had arrived. withSplash puts the splash first in <body> and
// moves the bundle after it. Plain HTML + CSS and system fonts only: no text to
// translate, nothing that waits on the bundle. Behind it, the same pixel-arcade
// backdrop as the launcher (scripts/backdrop.mjs), in the player's chosen theme
// (a tiny inline script picks it before first paint).

import { BACKDROP_CSS, BACKDROP_PICK_JS, backdropMarkup } from './backdrop.mjs'

const CSS =
  `
html{background:#161a3a}
#pf-splash{position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;background:#161a3a;color:#f4f1ff;font:700 22px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;transition:opacity .25s ease-out}
#pf-splash>*{animation:pf-splash-in .3s .15s ease-out both}
#pf-splash.out{opacity:0;pointer-events:none}
#pf-splash>.pf-bd{position:absolute;animation:none}
#pf-splash>:not(.pf-bd){position:relative}
.pf-splash-cover{width:min(260px,70vw);border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgb(0 0 0/.35),0 0 0 4px #343b7a,8px 8px 0 4px #10132c}
.pf-splash-cover svg{display:block;width:100%;height:auto}
.pf-splash-title{text-shadow:0 3px 0 rgb(0 0 0/.35)}
.pf-splash-bar{width:min(160px,40vw);height:6px;border-radius:99px;background:#10132c;overflow:hidden;box-shadow:0 0 0 2px #343b7a}
.pf-splash-bar i{display:block;width:40%;height:100%;border-radius:inherit;background:#ffc83d;animation:pf-splash-run 1.1s ease-in-out infinite}
@keyframes pf-splash-in{from{opacity:0;transform:translateY(8px)}}
@keyframes pf-splash-run{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
@media (prefers-reduced-motion:reduce){#pf-splash>*{animation:none}.pf-splash-bar i{animation-duration:3s}}
`.trim() +
  '\n' +
  BACKDROP_CSS

const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The splash element (with its own <style>). `cover` is trusted SVG markup from the repo. */
export function splashMarkup({ title, cover = '' }) {
  return (
    `<div id="pf-splash" aria-busy="true"><style>${CSS}</style>${backdropMarkup()}<script>${BACKDROP_PICK_JS}</script>` +
    (cover ? `<div class="pf-splash-cover" aria-hidden="true">${cover}</div>` : '') +
    `<div class="pf-splash-title">${escape(title)}</div>` +
    `<div class="pf-splash-bar" aria-hidden="true"><i></i></div></div>`
  )
}

/**
 * Adds the splash to a page. With `move` (built pages), the inlined bundle's
 * module scripts and stylesheets go from <head> to the end of <body>, styles first.
 */
export function withSplash(html, { cover = '', move = true } = {}) {
  if (!html.includes('<body>') || html.includes('id="pf-splash"')) return html
  const title = (/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '').split(' · ')[0].trim()
  let out = html
  const moved = []
  if (move) {
    const headEnd = out.indexOf('</head>')
    let head = out.slice(0, headEnd)
    const take = (re) => {
      head = head.replace(re, (tag) => {
        moved.push(tag)
        return ''
      })
    }
    take(/<style rel="stylesheet"[^>]*>[\s\S]*?<\/style>\s*/g)
    take(/<script type="module"[^>]*>[\s\S]*?<\/script>\s*/g)
    out = head + out.slice(headEnd)
  }
  // Function replacers: the bundle may contain "$&" / "$'", which a string replacement would expand.
  out = out.replace('<body>', () => `<body>\n${splashMarkup({ title, cover })}`)
  return moved.length ? out.replace('</body>', () => `${moved.join('\n')}\n</body>`) : out
}
