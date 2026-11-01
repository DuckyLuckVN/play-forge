// The coin: drawn on the board (HUD, flying coins, pickups) and as an inline
// SVG on the page (wallet, prices, shop badge). Trusted, static markup.
import { h } from '@forge/ui/dom'

const GOLD = ['#fff3b0', '#ffc83d', '#d98a00'] as const
const RIM = '#8a5300'

/** A 5-point star path around (0,0), outer radius `r`. */
function star(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const d = i % 2 ? r * 0.45 : r
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d)
  }
  ctx.closePath()
}

/**
 * A gold coin with a rim, an embossed star and a shine. `spin` (radians)
 * squashes it sideways like a coin turning; 0 faces the viewer.
 */
export function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin = 0): void {
  const face = Math.max(0.15, Math.abs(Math.cos(spin)))
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(face, 1)
  // Edge, then face.
  ctx.fillStyle = RIM
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r)
  g.addColorStop(0, GOLD[0])
  g.addColorStop(0.45, GOLD[1])
  g.addColorStop(1, GOLD[2])
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2)
  ctx.fill()
  // Inner ring and star, pressed into the face.
  ctx.strokeStyle = 'rgb(138 83 0 / 0.55)'
  ctx.lineWidth = Math.max(1, r * 0.1)
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgb(138 83 0 / 0.6)'
  ctx.translate(r * 0.04, r * 0.06)
  star(ctx, r * 0.42)
  ctx.fill()
  ctx.translate(-r * 0.04, -r * 0.06)
  ctx.fillStyle = GOLD[0]
  star(ctx, r * 0.42)
  ctx.fill()
  // Shine.
  ctx.strokeStyle = 'rgb(255 255 255 / 0.75)'
  ctx.lineWidth = Math.max(1, r * 0.14)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.74, Math.PI * 1.1, Math.PI * 1.45)
  ctx.stroke()
  ctx.restore()
}

export const COIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">' +
  '<defs><radialGradient id="bs-coin-g" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff3b0"/>' +
  '<stop offset="0.45" stop-color="#ffc83d"/><stop offset="1" stop-color="#d98a00"/></radialGradient></defs>' +
  '<circle cx="12" cy="12" r="11.5" fill="#8a5300"/><circle cx="12" cy="12" r="10" fill="url(#bs-coin-g)"/>' +
  '<circle cx="12" cy="12" r="7.6" fill="none" stroke="#8a5300" stroke-opacity="0.55" stroke-width="1.2"/>' +
  '<path d="M12 6.8l1.5 3.3 3.6.4-2.7 2.4.8 3.6L12 14.7l-3.2 1.8.8-3.6-2.7-2.4 3.6-.4z" fill="#fff3b0" stroke="#8a5300" stroke-opacity="0.5" stroke-width="0.6"/>' +
  '<path d="M5.2 9.2a7.6 7.6 0 0 1 3.4-3.6" fill="none" stroke="#fff" stroke-opacity="0.8" stroke-width="1.6" stroke-linecap="round"/>' +
  '</svg>'

/** A coin icon plus an amount, for the page: [coin] 1,234. */
export function coinAmount(n: number | string, cls = 'bs-coins'): HTMLElement {
  const icon = h('span', { class: 'bs-coin-icon' })
  icon.innerHTML = COIN_SVG
  return h(
    'span',
    { class: cls },
    icon,
    h('span', { textContent: typeof n === 'number' ? n.toLocaleString() : n }),
  )
}

/** 1234 → "1.2k", for small badges. */
export function shortCoins(n: number): string {
  const short = (v: number, unit: string) => `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}${unit}`
  if (n >= 1_000_000) return short(n / 1_000_000, 'M')
  if (n >= 1000) return short(n / 1000, 'k')
  return String(n)
}
