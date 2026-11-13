// Canvas drawings shared by the jar, the side panel and the rival mini-jars.
import { Link, type Link as LinkT } from './grid'
import { GLOOP_COLORS, GLOOP_EDGES, GLOOP_SHAPES, type Bottle } from './look'

export type Mood = 'happy' | 'scared' | 'dead'

/** Corner radii for a capsule half: round on the outside, flat where it joins its partner. */
function halfRadii(link: LinkT, r: number): [number, number, number, number] {
  // top-left, top-right, bottom-right, bottom-left
  switch (link) {
    case Link.Right:
      return [r, 2, 2, r]
    case Link.Left:
      return [2, r, r, 2]
    case Link.Up:
      return [2, 2, r, r]
    case Link.Down:
      return [r, r, 2, 2]
    default:
      return [r, r, r, r]
  }
}

/** One capsule half filling a `size` cell at (x, y). */
export function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: number,
  link: LinkT,
  flash = 0,
): void {
  const inset = size * 0.06
  // Halves touch their partner: no inset on the joined side.
  const l = x + (link === Link.Left ? 0 : inset)
  const t = y + (link === Link.Up ? 0 : inset)
  const r = x + size - (link === Link.Right ? 0 : inset)
  const b = y + size - (link === Link.Down ? 0 : inset)
  const w = r - l
  const h = b - t
  const radii = halfRadii(link, Math.min(w, h) * 0.5)
  ctx.fillStyle = GLOOP_EDGES[color]
  ctx.beginPath()
  ctx.roundRect(l, t, w, h, radii)
  ctx.fill()
  ctx.fillStyle = GLOOP_COLORS[color]
  ctx.beginPath()
  ctx.roundRect(l, t, w, h - Math.max(2, size * 0.1), radii)
  ctx.fill()
  if (size >= 14) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.beginPath()
    ctx.ellipse(l + w * 0.34, t + h * 0.3, w * 0.16, h * 0.1, -0.4, 0, Math.PI * 2)
    ctx.fill()
    drawGlyph(ctx, l + w / 2, t + h / 2 - size * 0.04, size * 0.17, color)
  }
  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flash})`
    ctx.beginPath()
    ctx.roundRect(l, t, w, h, radii)
    ctx.fill()
  }
}

/** Small shape per colour (triangle, dot, square), so colour-blind players can tell halves apart. */
export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: number,
): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.beginPath()
  if (color === 0) {
    ctx.moveTo(cx, cy - r)
    ctx.lineTo(cx + r, cy + r * 0.8)
    ctx.lineTo(cx - r, cy + r * 0.8)
    ctx.closePath()
  } else if (color === 1) ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2)
  else ctx.rect(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5)
  ctx.fill()
}

/** Body outline for a gloop's shape, centred on (0, 0) with radius r. */
function bodyPath(
  ctx: CanvasRenderingContext2D,
  shape: (typeof GLOOP_SHAPES)[number],
  r: number,
  wob: number,
) {
  ctx.beginPath()
  if (shape === 'spiky') {
    const n = 9
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2
      const rr = (i % 2 ? r * 0.8 : r * 1.05) * (1 + Math.sin(a * 3 + wob) * 0.03)
      const px = Math.cos(a) * rr
      const py = Math.sin(a) * rr
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  } else if (shape === 'round') {
    ctx.ellipse(
      0,
      r * 0.05,
      r * (1 + Math.sin(wob) * 0.04),
      r * (0.95 - Math.sin(wob) * 0.04),
      0,
      0,
      Math.PI * 2,
    )
  } else {
    ctx.roundRect(-r * 0.92, -r * 0.82, r * 1.84, r * 1.72, r * 0.42)
  }
}

/**
 * A gloop: a little goo monster that wobbles, blinks and watches the capsule.
 * `look` is where its pupils point (-1..1 each way); `seed` keeps neighbours out of step.
 */
export function drawGloop(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: number,
  time: number,
  seed: number,
  mood: Mood = 'happy',
  look: [number, number] = [0, 0],
  flash = 0,
): void {
  const shape = GLOOP_SHAPES[color]
  const r = size * 0.42
  const wob = time * 5 + seed * 1.7
  const squish = mood === 'scared' ? Math.sin(time * 30 + seed) * 0.05 : Math.sin(wob) * 0.06
  ctx.save()
  ctx.translate(cx, cy + size * 0.04)
  ctx.scale(1 + squish, 1 - squish)
  if (mood === 'scared') ctx.translate(Math.sin(time * 40 + seed) * size * 0.03, 0)
  // Antenna / horns per shape.
  ctx.strokeStyle = GLOOP_EDGES[color]
  ctx.fillStyle = GLOOP_COLORS[color]
  ctx.lineWidth = Math.max(1.5, size * 0.07)
  ctx.lineCap = 'round'
  if (shape === 'boxy') {
    const sway = Math.sin(wob * 0.7) * r * 0.25
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.8)
    ctx.quadraticCurveTo(sway * 0.5, -r * 1.15, sway, -r * 1.3)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(sway, -r * 1.32, r * 0.16, 0, Math.PI * 2)
    ctx.fill()
  } else if (shape === 'round') {
    ctx.beginPath()
    ctx.ellipse(-r * 0.15, -r * 0.95, r * 0.22, r * 0.12, -0.5, 0, Math.PI * 2)
    ctx.fill()
  }
  bodyPath(ctx, shape, r, wob)
  ctx.fillStyle = GLOOP_EDGES[color]
  ctx.fill()
  ctx.save()
  ctx.translate(0, -size * 0.05)
  bodyPath(ctx, shape, r * 0.96, wob)
  ctx.fillStyle = GLOOP_COLORS[color]
  ctx.fill()
  ctx.restore()
  if (size >= 12) drawFace(ctx, r, color, time, seed, mood, look)
  if (flash > 0) {
    bodyPath(ctx, shape, r * 1.05, wob)
    ctx.fillStyle = `rgba(255, 255, 255, ${flash})`
    ctx.fill()
  }
  ctx.restore()
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  r: number,
  color: number,
  time: number,
  seed: number,
  mood: Mood,
  look: [number, number],
) {
  // Gloss.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.beginPath()
  ctx.ellipse(-r * 0.45, -r * 0.45, r * 0.2, r * 0.12, -0.6, 0, Math.PI * 2)
  ctx.fill()
  const ex = r * 0.36
  const ey = -r * 0.12
  const er = r * 0.27
  const ink = '#1d1440'
  if (mood === 'dead') {
    ctx.strokeStyle = ink
    ctx.lineWidth = Math.max(1.5, r * 0.12)
    for (const sx of [-1, 1]) {
      const x = sx * ex
      ctx.beginPath()
      ctx.moveTo(x - er * 0.7, ey - er * 0.7)
      ctx.lineTo(x + er * 0.7, ey + er * 0.7)
      ctx.moveTo(x + er * 0.7, ey - er * 0.7)
      ctx.lineTo(x - er * 0.7, ey + er * 0.7)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.ellipse(0, r * 0.42, r * 0.18, r * 0.14, 0, 0, Math.PI * 2)
    ctx.fillStyle = ink
    ctx.fill()
    return
  }
  const blink = (time * 0.6 + seed * 0.37) % 4 < 0.1
  for (const sx of [-1, 1]) {
    const x = sx * ex
    if (blink) {
      ctx.strokeStyle = ink
      ctx.lineWidth = Math.max(1.5, r * 0.1)
      ctx.beginPath()
      ctx.moveTo(x - er * 0.8, ey)
      ctx.lineTo(x + er * 0.8, ey)
      ctx.stroke()
      continue
    }
    const big = mood === 'scared' ? 1.2 : 1
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(x, ey, er * big, er * 1.15 * big, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.arc(
      x + look[0] * er * 0.4,
      ey + look[1] * er * 0.4,
      er * (mood === 'scared' ? 0.35 : 0.5),
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
  // Brows: angry for the spiky one, worried when scared.
  if (color === 0 || mood === 'scared') {
    ctx.strokeStyle = ink
    ctx.lineWidth = Math.max(1.5, r * 0.1)
    const tilt = mood === 'scared' ? -1 : 1
    for (const sx of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(sx * (ex + er * 0.9), ey - er * (1.3 + 0.4 * tilt))
      ctx.lineTo(sx * (ex - er * 0.6), ey - er * (1.3 - 0.3 * tilt))
      ctx.stroke()
    }
  }
  ctx.fillStyle = ink
  ctx.beginPath()
  if (mood === 'scared') ctx.ellipse(0, r * 0.45, r * 0.16, r * 0.2, 0, 0, Math.PI * 2)
  else {
    // A grin with a fang.
    ctx.arc(0, r * 0.3, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.closePath()
  }
  ctx.fill()
  if (mood !== 'scared') {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(r * 0.06, r * 0.33)
    ctx.lineTo(r * 0.18, r * 0.33)
    ctx.lineTo(r * 0.12, r * 0.47)
    ctx.closePath()
    ctx.fill()
  }
}

/** Traces the bottle outline (see `bottle()` in look.ts); fill, stroke or clip it after. */
export function bottlePath(ctx: CanvasRenderingContext2D, b: Bottle): void {
  const { left, right, bottom, shoulderY, neckL, neckR, neckY, neckBase, radius } = b
  ctx.beginPath()
  ctx.moveTo(neckL, neckY)
  ctx.lineTo(neckL, neckBase)
  // Left shoulder curves out to the body.
  ctx.bezierCurveTo(neckL, shoulderY - 18, left, shoulderY - 30, left, shoulderY + 4)
  ctx.lineTo(left, bottom - radius)
  ctx.quadraticCurveTo(left, bottom, left + radius, bottom)
  ctx.lineTo(right - radius, bottom)
  ctx.quadraticCurveTo(right, bottom, right, bottom - radius)
  ctx.lineTo(right, shoulderY + 4)
  ctx.bezierCurveTo(right, shoulderY - 30, neckR, shoulderY - 18, neckR, neckBase)
  ctx.lineTo(neckR, neckY)
  ctx.closePath()
}
