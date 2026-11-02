/** Shared drawing kit for creature heroes: one thick outline, thin inner lines, two-tone cel shading, gloss, faces. */

import type { Frame } from './types'

type Ctx = CanvasRenderingContext2D

export const OUTLINE = '#141a2e'
const GOLD = '#ffc531'

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
export function mix(a: string, b: string, t: number): string {
  const x = hex(a)
  const y = hex(b)
  return (
    '#' +
    x
      .map((v, i) =>
        Math.round(v + (y[i] - v) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}
export const darkOf = (c: string) => mix(c, '#1e2a5a', 0.38)
export const lightOf = (c: string) => mix(c, '#ffffff', 0.3)

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
/** Smoothstep on 0..1. */
export const smooth = (k: number) => k * k * (3 - 2 * k)
export const easeOut = (k: number) => 1 - (1 - clamp(k)) ** 3
/** 0..1..0 bump over [a, b]. */
const bump = (x: number, a: number, b: number) =>
  x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI)

/** Smooth "look around": holds, then glides to a new spot. */
export function look(t: number, seed: number): number {
  const k = t * 0.45 + seed
  const i = Math.floor(k)
  const f = clamp((k - i - 0.75) * 4)
  const at = (n: number) => Math.sin(n * 12.9898 + seed * 78.233) * 0.5 + Math.sin(n * 4.1) * 0.5
  return at(i) + (at(i + 1) - at(i)) * (f * f * (3 - 2 * f))
}

/** Idle sway: 0 when still (reduced motion / static portraits). */
export const idleOffset = (t: number, still: boolean, phase: number, amp: number): number =>
  still ? 0 : Math.sin(t * 2 + phase) * amp

/** Ellipse path. */
export const ell = (x: number, y: number, rx: number, ry: number, rot = 0): Path2D => {
  const p = new Path2D()
  p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  return p
}

/** Rounded-rectangle path (x, y = top-left). */
export const box = (x: number, y: number, w: number, h: number, r: number | number[]): Path2D => {
  const p = new Path2D()
  p.roundRect(x, y, w, h, r)
  return p
}

/** The joyful moods (and happy eyes) that draw happy arcs. */
export const happy = (f: Frame): boolean => f.mood === 'cheer' || f.mood === 'pump' || f.eyes === 'happy'

export interface Part {
  p: Path2D
  c: string
  /** Shade strength; 0 = flat. */
  k?: number
  /** Skip the thick silhouette pass in `group`. */
  inner?: boolean
  /** Thin inner line width; 0 = none. */
  lw?: number
}

/** Fill + cel shade + thin inner line. Clips (no even-odd), so unions of shapes work. */
export function paint(ctx: Ctx, { p, c, k = 1, lw = 1.6 }: Part): void {
  if (k) {
    ctx.save()
    ctx.clip(p)
    ctx.fillStyle = darkOf(c)
    ctx.fill(p)
    // Clip to the part shifted up-left (translate, clip, translate back: the clip stays).
    ctx.translate(-4 * k, -3.2 * k)
    ctx.clip(p)
    ctx.translate(4 * k, 3.2 * k)
    ctx.fillStyle = lightOf(c)
    ctx.fill(p)
    ctx.fillStyle = c
    ctx.save()
    ctx.translate(1.6 * k, 1.8 * k)
    ctx.fill(p)
    ctx.restore()
    ctx.restore()
  } else {
    ctx.fillStyle = c
    ctx.fill(p)
  }
  if (lw) {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = lw
    ctx.lineJoin = 'round'
    ctx.stroke(p)
  }
}

/** Thick silhouette pass for all non-inner parts, then each part painted. */
export function group(ctx: Ctx, parts: Part[]): void {
  ctx.strokeStyle = OUTLINE
  ctx.lineJoin = 'round'
  ctx.lineWidth = 6
  for (const q of parts) if (!q.inner) ctx.stroke(q.p)
  // A glow (rim light) belongs on the silhouette only: blurring every fill and inner line looks heavy and costs per path.
  const blur = ctx.shadowBlur
  if (blur) ctx.shadowBlur = 0
  for (const q of parts) paint(ctx, q)
  if (blur) ctx.shadowBlur = blur
}

export function gloss(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = -0.5): void {
  ctx.fillStyle = 'rgb(255 255 255 / 0.92)'
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  ctx.fill()
}

export function happyEye(ctx: Ctx, x: number, y: number, r: number, color = OUTLINE, lw = 2.4): void {
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(x, y + r * 0.5, r, Math.PI * 1.15, Math.PI * 1.85)
  ctx.stroke()
}

export function dotEye(
  ctx: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  blink: boolean,
  lx = 0,
  ly = 0,
): void {
  if (blink) {
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x - rx, y)
    ctx.lineTo(x + rx, y)
    ctx.stroke()
    return
  }
  x += lx
  y += ly
  ctx.fillStyle = OUTLINE
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(x - rx * 0.3, y - ry * 0.4, rx * 0.42, 0, Math.PI * 2)
  ctx.fill()
}

export function openMouth(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const m = new Path2D(
    `M${x - w} ${y} Q${x} ${y - 1} ${x + w} ${y} Q${x + w * 0.6} ${y + h} ${x} ${y + h} Q${x - w * 0.6} ${y + h} ${x - w} ${y} Z`,
  )
  ctx.fillStyle = '#7a1f2b'
  ctx.fill(m)
  ctx.save()
  ctx.clip(m)
  ctx.fillStyle = '#ff7a8a'
  ctx.beginPath()
  ctx.ellipse(x, y + h, w * 0.7, h * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.strokeStyle = OUTLINE
  ctx.lineWidth = 1.8
  ctx.lineJoin = 'round'
  ctx.stroke(m)
}

/** Joy ticks that burst out and fade over 1.1s after a tap (`jt` = seconds since). */
export function ticks(ctx: Ctx, x: number, y: number, jt: number): void {
  const k = bump(jt, 0, 1.1)
  if (k <= 0) return
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 2.6
  ctx.lineCap = 'round'
  const out = 4 * easeOut(jt / 0.4)
  ctx.globalAlpha = Math.min(1, k * 2)
  for (const [a, len] of [
    [-1.1, 5],
    [-0.55, 6],
    [0, 5],
  ]) {
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * (4 + out), y + Math.sin(a) * (4 + out))
    ctx.lineTo(x + Math.cos(a) * (4 + out + len), y + Math.sin(a) * (4 + out + len))
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

export function shadow(ctx: Ctx, w: number, lift = 0): void {
  ctx.fillStyle = `rgb(0 0 0 / ${0.3 - Math.min(0.15, lift / 100)})`
  ctx.beginPath()
  ctx.ellipse(0, 1, Math.max(6, w - lift * 0.35), 3.5, 0, 0, Math.PI * 2)
  ctx.fill()
}
