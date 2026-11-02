// Hero art: emblems (the small badge glyphs, as SVG markup or drawn on a canvas)
// and portraits (the hero's creature, head and shoulders on its card, rendered
// once to a cached image). Trusted, static markup.
import type { BodyMetrics } from './creature/types'
import { HeroAvatar } from './hero-avatar'
import { HAT_RISE } from './creature/hats'
import { HEROES, type HeroEmblem, type HeroHat, type HeroId } from './sim/heroes'

const OUT = '#1b1d2b'
const GOLD = '#ffd43b'
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

/** One emblem drawing step: a path or a circle, filled and/or stroked (24×24 units). */
type Prim =
  | { kind: 'path'; d: string; fill?: string; stroke: string; width: number; cap?: boolean }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string; width?: number }

/** A filled, outlined shape. */
const fill = (d: string, color: string, sw = 1.8): Prim[] => [
  { kind: 'path', d, fill: color, stroke: OUT, width: sw },
]

/** A coloured stroke with a dark outline under it (for line glyphs). */
const line = (d: string, color: string, w = 2.4): Prim[] => [
  { kind: 'path', d, stroke: OUT, width: w + 2, cap: true },
  { kind: 'path', d, stroke: color, width: w, cap: true },
]

const dot = (cx: number, cy: number, r: number, color = OUT): Prim[] => [
  { kind: 'circle', cx, cy, r, fill: color },
]

const circle = (cx: number, cy: number, r: number, color: string, sw = 1.5): Prim[] => [
  { kind: 'circle', cx, cy, r, fill: color, width: sw },
]

function primSvg(p: Prim): string {
  if (p.kind === 'circle')
    return p.width === undefined
      ? `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${p.fill}"/>`
      : `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="${p.fill}" stroke="${OUT}" stroke-width="${p.width}"/>`
  const cap = p.cap ? ' stroke-linecap="round"' : ''
  return `<path d="${p.d}" fill="${p.fill ?? 'none'}" stroke="${p.stroke}" stroke-width="${p.width}"${cap} stroke-linejoin="round"/>`
}

/** Emblem paths, parsed once (built lazily: Path2D only exists in the browser). */
const PATHS = new Map<string, Path2D>()

function primDraw(ctx: CanvasRenderingContext2D, p: Prim): void {
  ctx.lineJoin = 'round'
  if (p.kind === 'circle') {
    ctx.beginPath()
    ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2)
    ctx.fillStyle = p.fill
    ctx.fill()
    if (p.width === undefined) return
    ctx.strokeStyle = OUT
    ctx.lineWidth = p.width
    ctx.stroke()
    return
  }
  let path = PATHS.get(p.d)
  if (!path) PATHS.set(p.d, (path = new Path2D(p.d)))
  if (p.fill) {
    ctx.fillStyle = p.fill
    ctx.fill(path)
  }
  ctx.strokeStyle = p.stroke
  ctx.lineWidth = p.width
  ctx.lineCap = p.cap ? 'round' : 'butt'
  ctx.stroke(path)
}

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
const EMBLEMS: Record<HeroEmblem, (c: string) => Prim[]> = {
  ball: (c) => [circle(12, 12, 7.5, c, 1.8), dot(9.5, 9.5, 2, '#fff')].flat(),
  shield: (c) =>
    [fill('M12 3 19 6v6c0 5-4 8-7 9-3-1-7-4-7-9V6z', c), line('M12 7v10M8 11h8', shade(c, 0.6), 1.6)].flat(),
  axe: (c) => [line('M7 21 16 5', '#a9744f', 2.2), fill('M12 4c6-1 9 3 9 8l-6-2-3-6z', c)].flat(),
  bow: (c) =>
    [
      line('M8 3v18', '#fff', 1),
      line('M8 3c9 3 9 15 0 18', c, 2.4),
      line('M3 12h16M16 9l3 3-3 3', c, 1.6),
    ].flat(),
  flame: (c) =>
    [
      fill('M12 2c2 5 7 7 7 12a7 7 0 0 1-14 0c0-4 3-6 4-9 1 3 2 4 3 4-1-2-1-5 0-7z', c),
      fill('M12 13c1.5 2 3 3 3 5a3 3 0 0 1-6 0c0-2 2-3 3-5z', shade(c, 0.6), 1.2),
    ].flat(),
  bomb: (c) =>
    [circle(11, 14, 7, c, 1.8), line('M15 8q2-4 5-4', DARK, 1.6), dot(20.5, 3.5, 1.8, GOLD)].flat(),
  bolt: (c) => [fill('M14 2 5 13h6l-2 9 10-12h-6z', c)].flat(),
  coin: (c) =>
    [circle(12, 12, 8.5, c, 1.8), circle(12, 12, 5.5, shade(c, 0.35), 1.2), line('M12 9v6', OUT, 0.6)].flat(),
  book: (c) =>
    [
      fill('M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1z', c),
      line('M12 6v14', OUT, 0.4),
      line('M6 9h3M15 9h3', '#fff', 0.8),
    ].flat(),
  heart: (c) => [fill('M12 20C4 14 3 9 6 6c2.5-2.5 5-1 6 1 1-2 3.5-3.5 6-1 3 3 2 8-6 14z', c)].flat(),
  fang: (c) => [fill('M4 5h16l-3 3-2 11-3-10-3 10-2-11z', c), line('M4 5h16', DARK, 1.2)].flat(),
  twin: (c) => [circle(8, 14, 5, c, 1.6), circle(16, 10, 5, shade(c, 0.3), 1.6)].flat(),
  fist: (c) =>
    [
      fill('M5 9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z', c),
      line('M9 7v5M13 7v5', OUT, 0.3),
      fill('M5 13h6a2 2 0 0 1 0 4H7', shade(c, 0.3), 1.4),
    ].flat(),
  wing: (c) =>
    [
      fill('M3 19C5 10 12 4 21 4c-2 3-4 4-6 4 3 1 3 3-1 4 2 1 1 3-2 3-2 2-5 4-9 4z', c),
      line('M7 15c3-2 6-5 9-8', shade(c, -0.3), 0.8),
    ].flat(),
  dice: (c) =>
    [
      fill('M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z', c),
      dot(8.5, 8.5, 1.6),
      dot(12, 12, 1.6),
      dot(15.5, 15.5, 1.6),
    ].flat(),
  skull: (c) =>
    [
      fill('M12 3a8 8 0 0 1 8 8v4h-4v5H8v-5H4v-4a8 8 0 0 1 8-8z', c),
      dot(8.8, 11.5, 2.2),
      dot(15.2, 11.5, 2.2),
      line('M11 17v3M13 17v3', OUT, 0.3),
    ].flat(),
  gear: (c) => [fill(gearPath(12, 12, 10, 7, 8), c, 1.5), circle(12, 12, 3, '#fff', 1.4)].flat(),
  lotus: (c) =>
    [
      fill('M12 20C7 20 2 16 2 10c5 1 8 5 10 10z', shade(c, -0.15)),
      fill('M12 20c5 0 10-4 10-10-5 1-8 5-10 10z', shade(c, -0.15)),
      fill('M12 3c3.5 4 3.5 12 0 17-3.5-5-3.5-13 0-17z', c),
    ].flat(),
  gem: (c) =>
    [fill('M7 4h10l4 5-9 12L3 9z', c), line('M3 9h18M9 4l3 5 3-5M12 9v11', shade(c, 0.6), 0.7)].flat(),
  sun: (c) =>
    [
      line(
        'M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1',
        c,
        1.8,
      ),
      circle(12, 12, 5.5, c, 1.6),
    ].flat(),
  anchor: (c) =>
    [line('M12 7.5V20M8 10.5h8M5 14.5q1 5.5 7 5.5t7-5.5', c, 2.2), circle(12, 5, 2.5, '#fff', 1.6)].flat(),
  snow: (c) =>
    [
      line(
        'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M10 3.5l2 2 2-2M10 20.5l2-2 2 2M4 10l2.8-.8-.8-2.7M20 14l-2.8.8.8 2.7M4 14l2.8.8-.8 2.7M20 10l-2.8-.8.8-2.7',
        c,
        1.6,
      ),
    ].flat(),
  star: (c) =>
    [fill('M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z', c), dot(12, 12, 1.8)].flat(),
  rock: (c) =>
    [fill('M4 17 6 9l5-4 6 2 3 6-2 6-10 1z', c), line('M10 9l2 4-2 3', shade(c, -0.35), 0.9)].flat(),
  dragon: (c) =>
    [
      fill('M3 15 8 9l3-6 1 5 5-1 4 4-2 3h-5l-2 6-6-1z', c),
      dot(13.5, 10.5, 1.4),
      line('M18 13.5h2', OUT, 0.4),
      fill('M8 9 5 5l5 1', shade(c, -0.25), 1.2),
    ].flat(),
}

/** Just the emblem (small badge glyph), viewBox 0 0 24 24, in `color` (default def.color). */
export function heroEmblem(emblem: HeroEmblem, color: string, size = 24): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">${EMBLEMS[emblem](color).map(primSvg).join('')}</svg>`
}

/** Draws the emblem on a canvas, centred on (x, y), `size` units wide (same look as heroEmblem). */
export function drawEmblem(
  ctx: CanvasRenderingContext2D,
  emblem: HeroEmblem,
  color: string,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save()
  ctx.translate(x - size / 2, y - size / 2)
  ctx.scale(size / 24, size / 24)
  for (const p of EMBLEMS[emblem](color)) primDraw(ctx, p)
  ctx.restore()
}

/** Portraits draw in a 64×64 card. */
const CARD = 64

/**
 * Where to stand the creature in the card so its head and shoulders fill it: the head with its hat sits
 * in the upper part, centred, and the top of the body (bodyBox) shows before the card's bottom edge.
 */
export function portraitFrame(m: BodyMetrics, hat: HeroHat): { at: number; floorY: number; scale: number } {
  const h = m.head
  // Hats fit to the head box (creature/hats.ts Fit): brim on the forehead, HAT_RISE crown half-widths tall.
  const hatW = Math.max(h.rx, h.ry * 1.15) * 1.05
  const top = Math.min(m.headTop, h.y - h.ry * 0.35 - hatW * HAT_RISE[hat]) - 2
  const bottom = Math.max(h.y + h.ry * 1.8, m.bodyBox.y + 10)
  const span = CARD - 5
  const scale = Math.min(span / (bottom - top), (CARD * 0.6) / (h.rx * 2))
  // A narrow-limited fit leaves spare height: share it above and below.
  const spare = span - (bottom - top) * scale
  return { at: CARD / 2 - h.x * scale, floorY: 5 + spare / 2 - top * scale, scale }
}

/** The canvas a portrait renders on (an HTMLCanvasElement; injectable for tests). */
export interface PortraitCanvas {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | null
  toDataURL(): string
}

const defaultCanvas = (): PortraitCanvas => document.createElement('canvas')

const portraits = new Map<string, string>()

/**
 * The hero's portrait as an image URL, `size` px square (round up for hi-DPI): its creature at rest,
 * head and shoulders on a card in the hero colour, with the emblem badge. Cached per hero and size.
 */
export function heroPortraitUrl(
  id: HeroId,
  size: number,
  makeCanvas: () => PortraitCanvas = defaultCanvas,
): string {
  const px = Math.max(1, Math.round(size))
  const key = `${id}:${px}`
  const hit = portraits.get(key)
  if (hit !== undefined) return hit
  const canvas = makeCanvas()
  canvas.width = canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const def = HEROES[id]
  const c = def.color
  ctx.scale(px / CARD, px / CARD)

  const card = (inset: number, r: number) => {
    ctx.beginPath()
    ctx.roundRect(inset, inset, CARD - inset * 2, CARD - inset * 2, r)
  }
  const bg = ctx.createLinearGradient(0, 1, 0, CARD - 1)
  bg.addColorStop(0, shade(c, 0.55))
  bg.addColorStop(1, shade(c, -0.15))
  card(1, 14)
  ctx.fillStyle = bg
  ctx.fill()

  ctx.save()
  card(2, 13)
  ctx.clip()
  const avatar = new HeroAvatar(id, () => 0.5)
  const { at, floorY, scale } = portraitFrame(avatar.bodyMetrics, def.hat)
  avatar.draw(ctx, floorY, scale, at)
  ctx.restore()

  card(1, 14)
  ctx.strokeStyle = OUT
  ctx.lineWidth = 2
  ctx.stroke()

  for (const p of circle(50, 52, 10, '#fff8e8', 1.8)) primDraw(ctx, p)
  drawEmblem(ctx, def.emblem, c, 50, 52, 17)

  const url = canvas.toDataURL()
  portraits.set(key, url)
  return url
}
