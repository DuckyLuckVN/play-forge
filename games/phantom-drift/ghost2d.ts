// The ghost drawn with 2D canvas shapes: the no-WebGL rift and the character
// picker's previews. Shaded body (lit from the top left), a wavy scalloped
// skirt, eyes that blink and look, and each character's accessory.

import type { Character } from './characters'

export type GhostLook = Pick<Character, 'colors' | 'accessory'>

export interface GhostPose {
  /** Seconds; drives the skirt waves and the accessory sway. */
  time: number
  /** Lean in radians (positive = clockwise). */
  tilt: number
  /** Eye height: 1 open … 0.1 shut. */
  eyes: number
  /** Eyes glance -1 (left) … 1 (right). */
  look: number
  sx: number
  sy: number
  /** Glow blur in px (0 = none, e.g. reduced motion or cheap previews). */
  glow: number
  /** Seen from behind (running away from the camera): no face. Missing = front. */
  back?: boolean
}

export const RESTING: GhostPose = { time: 0, tilt: 0, eyes: 1, look: 0, sx: 1, sy: 1, glow: 0 }

/** Head radius in design units (the ghost is about 56 tall at scale 1). */
const R = 22
const HEAD_Y = -6
const SKIRT_Y = 24

/** Blend two #rrggbb colours (t = 0 → a, 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (shift: number) => {
    const x = (pa >> shift) & 255
    const y = (pb >> shift) & 255
    return Math.round(x + (y - x) * t)
  }
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}

function bodyPath(ctx: CanvasRenderingContext2D, time: number, sway: number) {
  ctx.beginPath()
  ctx.arc(0, HEAD_Y, R, Math.PI, 0)
  ctx.lineTo(R, SKIRT_Y)
  // Three soft scallops, rippling: right to left.
  const humps = 3
  const step = (2 * R) / humps
  for (let i = 0; i < humps; i++) {
    const x0 = R - i * step
    const x1 = x0 - step
    const wave = Math.sin(time * 8 + i * 1.9) * 3
    ctx.bezierCurveTo(
      x0 - step * 0.15 + sway,
      SKIRT_Y + 11 + wave,
      x1 + step * 0.15 + sway,
      SKIRT_Y + 11 - wave,
      x1,
      SKIRT_Y + (i === humps - 1 ? 0 : 2),
    )
  }
  ctx.closePath()
}

/**
 * Draw a ghost standing on (x, y) (its base), `scale` times the design size.
 * `tint` overrides the body colour (Phantom).
 */
export function drawGhost2D(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  look: GhostLook,
  pose: GhostPose,
  scale = 1,
  tint?: string,
): void {
  const { colors } = look
  const core = tint ?? colors.core
  const rim = tint ?? colors.rim
  ctx.save()
  ctx.translate(x, y - 38 * scale)
  ctx.rotate(pose.tilt)
  ctx.scale(scale * pose.sx, scale * pose.sy)

  if (look.accessory === 'halo') halo(ctx, colors.accent, pose.time)
  // Shaded body: bright where the light hits (top left), the character's
  // colour in the middle, a glowing rim at the edge.
  const g = ctx.createRadialGradient(-8, HEAD_Y - 10, 2, 0, 2, R * 1.7)
  g.addColorStop(0, mixHex(core, '#ffffff', 0.55))
  g.addColorStop(0.45, mixHex(core, rim, 0.25))
  g.addColorStop(1, rim)
  ctx.fillStyle = g
  if (pose.glow > 0) {
    ctx.shadowColor = rim
    ctx.shadowBlur = pose.glow
  }
  bodyPath(ctx, pose.time, -pose.tilt * 14)
  ctx.fill()
  ctx.shadowBlur = 0

  if (look.accessory === 'hood') hood(ctx, colors.accent, rim)
  if (!pose.back) {
    // Eyes: blink (height) and glance (shift).
    ctx.fillStyle = colors.eye
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(side * 9 + pose.look * 3, HEAD_Y + 2, 4, Math.max(0.6, 6 * pose.eyes), 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // Blush.
    ctx.globalAlpha *= 0.55
    ctx.fillStyle = colors.blush
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(side * 15, HEAD_Y + 11, 4.5, 2.5, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha /= 0.55
  }
  if (look.accessory === 'horns') horns(ctx, colors.accent)
  else if (look.accessory === 'crown') crown(ctx, colors.accent, colors.rim)
  else if (look.accessory === 'flower') flower(ctx, colors.blush, colors.accent, pose.time)
  ctx.restore()
}

const TOP = HEAD_Y - R

function horns(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(side * 8, TOP + 5)
    ctx.quadraticCurveTo(side * 18, TOP - 2, side * 17, TOP - 12)
    ctx.quadraticCurveTo(side * 13, TOP - 2, side * 15, TOP + 8)
    ctx.closePath()
    ctx.fill()
  }
}

function crown(ctx: CanvasRenderingContext2D, color: string, edge: string) {
  ctx.fillStyle = color
  ctx.strokeStyle = edge
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-12, TOP + 4)
  const spikes = [-12, -6, 0, 6, 12]
  spikes.forEach((sx, i) => {
    ctx.lineTo(sx, TOP - (i % 2 ? 6 : 12))
    if (i < spikes.length - 1) ctx.lineTo(sx + 3, TOP - 2)
  })
  ctx.lineTo(12, TOP + 4)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

function flower(ctx: CanvasRenderingContext2D, petal: string, centre: string, time: number) {
  ctx.save()
  ctx.translate(13, TOP + 4)
  ctx.rotate(Math.sin(time * 2) * 0.15)
  ctx.fillStyle = petal
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    ctx.beginPath()
    ctx.ellipse(Math.cos(a) * 5, Math.sin(a) * 5, 4.5, 3, a, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = centre
  ctx.beginPath()
  ctx.arc(0, 0, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function hood(ctx: CanvasRenderingContext2D, color: string, edge: string) {
  // A cowl with a pointed tip; the face shows through an oval opening.
  ctx.fillStyle = color
  ctx.strokeStyle = edge
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(-R - 3, HEAD_Y + 16)
  ctx.arc(0, HEAD_Y, R + 3, Math.PI, Math.PI * 1.5 - 0.25)
  ctx.lineTo(5, TOP - 13)
  ctx.arc(0, HEAD_Y, R + 3, Math.PI * 1.5 + 0.25, Math.PI * 2)
  ctx.lineTo(R + 3, HEAD_Y + 16)
  ctx.closePath()
  ctx.moveTo(R - 5, HEAD_Y + 3)
  ctx.ellipse(0, HEAD_Y + 3, R - 5, R - 9, 0, 0, Math.PI * 2)
  ctx.fill('evenodd')
  ctx.stroke()
}

function halo(ctx: CanvasRenderingContext2D, color: string, time: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(0, TOP - 9 + Math.sin(time * 2.5) * 1.5, 13, 4, 0, 0, Math.PI * 2)
  ctx.stroke()
}
