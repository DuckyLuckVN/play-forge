// The arcade backdrop: night sky with coloured glows, twinkling stars, floating
// game pieces (ring, plus, triangle, square, star, dot) and a neon grid floor
// scrolling toward the horizon. Shared by the launcher (launcher/main.ts) and
// the game loading splash (scripts/splash.mjs), so the two feel like one place.
//
// Plain HTML + CSS with raw colours (the splash paints before any token CSS or
// script): no text, nothing to translate, decorative only (aria-hidden), no
// pointer events. Only transform/opacity animate; reduced motion stops it all.
// Colours mirror engine/ui/theme.ts (night, violet, pink, sky, yolk, mint, coral).

/** Game pieces: shape, position (% of the screen), size (px), colour, drift time (s), delay (s), tilt (deg). */
const PIECES = [
  ['ring', 7, 16, 34, '#5ab8ff', 15, 0, 0],
  ['plus', 88, 12, 26, '#ffc83d', 12, -3, 15],
  ['tri', 16, 64, 30, '#ff6fb5', 17, -6, -10],
  ['square', 80, 52, 24, '#4be3a0', 14, -2, 20],
  ['star', 50, 8, 22, '#ffc83d', 18, -9, 0],
  ['dot', 32, 30, 12, '#b48cff', 11, -4, 0],
  ['ring', 93, 78, 20, '#ff6b6b', 13, -7, 0],
  ['plus', 4, 86, 18, '#4be3a0', 16, -1, 30],
  ['dot', 66, 26, 10, '#5ab8ff', 12, -8, 0],
  ['tri', 60, 70, 18, '#ffc83d', 19, -5, 25],
]

export const BACKDROP_CSS = `
.pf-bd{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:radial-gradient(60% 45% at 12% 8%,rgb(180 140 255/.28),transparent 70%),radial-gradient(50% 40% at 92% 18%,rgb(255 111 181/.2),transparent 70%),radial-gradient(70% 45% at 50% 100%,rgb(90 184 255/.22),transparent 70%),#161a3a}
.pf-bd-stars,.pf-bd-stars::after{position:absolute;inset:0;background-image:radial-gradient(1.5px 1.5px at 20px 30px,#f4f1ff,transparent),radial-gradient(1px 1px at 90px 120px,#f4f1ff,transparent),radial-gradient(1.5px 1.5px at 160px 60px,#a3a8d6,transparent),radial-gradient(1px 1px at 230px 170px,#f4f1ff,transparent),radial-gradient(1px 1px at 60px 200px,#a3a8d6,transparent);background-size:260px 240px;opacity:.55;animation:pf-bd-twinkle 4s ease-in-out infinite alternate;-webkit-mask-image:linear-gradient(#000 40%,transparent 75%);mask-image:linear-gradient(#000 40%,transparent 75%)}
.pf-bd-stars::after{content:"";background-size:330px 290px;background-position:130px 90px;animation-delay:-2s}
.pf-bd-floor{position:absolute;left:-50%;right:-50%;bottom:0;height:42%;overflow:hidden;-webkit-mask-image:linear-gradient(transparent,#000 45%);mask-image:linear-gradient(transparent,#000 45%)}
.pf-bd-floor::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,transparent,#ff6fb5 30%,#b48cff 70%,transparent);box-shadow:0 0 18px 4px rgb(255 111 181/.45);opacity:.8}
.pf-bd-plane{position:absolute;inset:0 0 -40%;transform:perspective(320px) rotateX(62deg);transform-origin:50% 0}
.pf-bd-grid{position:absolute;inset:-48px 0 0;background:linear-gradient(90deg,rgb(180 140 255/.5) 2px,transparent 2px) 0 0/48px 48px,linear-gradient(rgb(180 140 255/.5) 2px,transparent 2px) 0 0/48px 48px;animation:pf-bd-scroll 1.6s linear infinite}
.pf-bd-piece{position:absolute;left:var(--x);top:var(--y);width:var(--s);height:var(--s);color:var(--c);opacity:.38;filter:drop-shadow(0 0 8px var(--c));animation:pf-bd-float var(--d) var(--w) ease-in-out infinite alternate}
.pf-bd-piece i{display:block;width:100%;height:100%;transform:rotate(var(--r));animation:pf-bd-spin calc(var(--d)*2) linear infinite}
.pf-bd-ring i{border:max(3px,calc(var(--s)*.16)) solid;border-radius:50%}
.pf-bd-dot i{background:currentColor;border-radius:50%}
.pf-bd-square i{border:max(3px,calc(var(--s)*.16)) solid;border-radius:20%}
.pf-bd-plus i{background:linear-gradient(currentColor,currentColor) 50%/30% 100% no-repeat,linear-gradient(currentColor,currentColor) 50%/100% 30% no-repeat;border-radius:2px}
.pf-bd-tri i{background:currentColor;clip-path:polygon(50% 6%,96% 90%,4% 90%)}
.pf-bd-star i{background:currentColor;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
@keyframes pf-bd-twinkle{to{opacity:.2}}
@keyframes pf-bd-scroll{to{transform:translateY(48px)}}
@keyframes pf-bd-float{from{transform:translateY(-14px)}to{transform:translateY(14px)}}
@keyframes pf-bd-spin{to{transform:rotate(calc(var(--r) + 360deg))}}
@media (max-width:600px){.pf-bd-piece{opacity:.26}.pf-bd-floor{height:30%}}
@media (prefers-reduced-motion:reduce){.pf-bd *,.pf-bd *::after{animation:none!important}}
`.trim()

/** The backdrop element (no <style>: pair it with BACKDROP_CSS). Static, trusted markup. */
export function backdropMarkup() {
  const pieces = PIECES.map(
    ([shape, x, y, s, c, d, w, r]) =>
      `<span class="pf-bd-piece pf-bd-${shape}" style="--x:${x}%;--y:${y}%;--s:${s}px;--c:${c};--d:${d}s;--w:${w}s;--r:${r}deg"><i></i></span>`,
  ).join('')
  return (
    `<div class="pf-bd" aria-hidden="true"><div class="pf-bd-stars"></div>` +
    `<div class="pf-bd-floor"><div class="pf-bd-plane"><div class="pf-bd-grid"></div></div></div>` +
    `${pieces}</div>`
  )
}
