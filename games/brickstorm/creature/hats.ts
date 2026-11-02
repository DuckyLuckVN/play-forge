/** The 14 hero hats, redrawn in the creature style (thick outline, cel shade, gloss). Each fits any head box. */

import type { HeroHat } from '../sim/heroes'
import type { HeadBox } from './types'
import { OUTLINE, darkOf, gloss, group, lightOf, mix, paint, type Part } from './paint'

type Ctx = CanvasRenderingContext2D

const STEEL = '#c3ccd8'
const GOLD = '#ffd43b'
const HORN = '#f1e6c8'
const DARK = '#232a40'
const LENS = '#a5d8ff'

/** Maps hat units (1 = crown half-width, +x forward, -y up, 0 = brim line) onto a head box. */
class Fit {
  readonly w: number
  readonly x: number
  readonly y: number
  constructor(box: HeadBox) {
    this.w = box.rx * 1.05
    this.x = box.x
    this.y = box.y - box.ry * 0.55
  }
  /** SVG path in hat units; every coordinate must be an `x y` pair (M L Q C Z only). */
  path(d: string): Path2D {
    return new Path2D(
      d.replace(
        /(-?[\d.]+) (-?[\d.]+)/g,
        (_, a: string, b: string) => `${this.x + +a * this.w} ${this.y + +b * this.w}`,
      ),
    )
  }
  ell(cx: number, cy: number, rx: number, ry: number, rot = 0): Path2D {
    const p = new Path2D()
    p.ellipse(this.x + cx * this.w, this.y + cy * this.w, rx * this.w, ry * this.w, rot, 0, Math.PI * 2)
    return p
  }
  gloss(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rot = -0.5): void {
    gloss(ctx, this.x + cx * this.w, this.y + cy * this.w, rx * this.w, ry * this.w, rot)
  }
  line(ctx: Ctx, d: string, color: string, lw: number): void {
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    ctx.lineCap = 'round'
    ctx.stroke(this.path(d))
  }
}

const DOME = 'M-1 0 C-1 -1.25 1 -1.25 1 0 Z'
const gem = (f: Fit, cx: number, cy: number, r: number, c: string): Part => ({
  p: f.ell(cx, cy, r, r),
  c,
  k: 0,
  inner: true,
  lw: 1.2,
})

type HatPainter = (ctx: Ctx, f: Fit, c: string) => void

const HAT_PAINTERS: Record<Exclude<HeroHat, 'none'>, HatPainter> = {
  cap(ctx, f) {
    const cap = '#3b8cff'
    group(ctx, [
      {
        p: f.path('M0.1 -0.02 Q1.2 -0.32 1.75 -0.02 Q1.85 0.22 1.5 0.28 Q0.9 0.18 0.1 0.22 Z'),
        c: mix(cap, '#173f8f', 0.25),
      },
      { p: f.path(DOME), c: cap, k: 1.3 },
    ])
    f.line(ctx, 'M0 -0.94 Q0.45 -0.5 0.42 0', darkOf(cap), 1.3)
    f.gloss(ctx, -0.38, -0.62, 0.24, 0.15, -0.6)
    paint(ctx, { p: f.ell(0, -0.95, 0.13, 0.1), c: '#ffffff', k: 0, lw: 1.3 })
  },
  helmet(ctx, f, c) {
    group(ctx, [
      { p: f.path('M-0.1 -0.9 L-0.1 -1.55 L0.12 -1.55 L0.12 -0.9 Z'), c },
      { p: f.path('M-1 0 C-1 -1.05 1 -1.05 1 0 Z'), c: STEEL, k: 1.2 },
      { p: f.path('M-1.08 -0.35 L1.08 -0.35 L1.08 0.1 L-1.08 0.1 Z'), c: darkOf(c) },
    ])
    f.gloss(ctx, -0.4, -0.65, 0.22, 0.12, -0.6)
  },
  horns(ctx, f, c) {
    const horn = (s: number): Part => ({
      p: f.path(
        `M${0.7 * s} -0.2 C${1.3 * s} -0.3 ${1.6 * s} -0.9 ${1.5 * s} -1.5 C${1.2 * s} -1 ${0.9 * s} -0.8 ${0.4 * s} -0.7 Z`,
      ),
      c: HORN,
    })
    group(ctx, [horn(-1), horn(1), { p: f.path(DOME), c: darkOf(c), k: 1.2 }])
    f.line(ctx, 'M-0.95 -0.18 L0.95 -0.18', GOLD, 2)
    f.gloss(ctx, -0.4, -0.65, 0.22, 0.12, -0.6)
  },
  hood(ctx, f, c) {
    const hood = mix(c, '#1e2a5a', 0.2)
    group(ctx, [
      {
        p: f.path(
          'M-1.2 1.1 C-1.5 -0.4 -0.8 -1.35 0 -1.35 C0.8 -1.35 1.5 -0.4 1.2 1.1 L0.9 1.1 C1 -0.2 0.6 -0.95 0 -0.95 C-0.6 -0.95 -1 -0.2 -0.9 1.1 Z',
        ),
        c: hood,
        k: 1.2,
      },
    ])
    f.line(ctx, 'M0 -1.35 L0 -1.0', darkOf(hood), 1.4)
    f.gloss(ctx, -0.6, -0.85, 0.22, 0.12, -0.9)
  },
  wizard(ctx, f, c) {
    group(ctx, [
      { p: f.path('M-0.85 0 Q-0.5 -1 0.95 -1.85 Q0.7 -0.9 0.9 0 Z'), c, k: 1.2 },
      {
        p: f.path('M-1.35 0 C-1.35 -0.25 1.35 -0.25 1.35 0 C1.35 0.25 -1.35 0.25 -1.35 0 Z'),
        c: darkOf(c),
        k: 0.8,
      },
    ])
    paint(ctx, {
      p: f.path(
        'M0 -0.9 L0.1 -0.65 L0.35 -0.62 L0.15 -0.45 L0.2 -0.2 L0 -0.33 L-0.2 -0.2 L-0.15 -0.45 L-0.35 -0.62 L-0.1 -0.65 Z',
      ),
      c: GOLD,
      k: 0,
      lw: 1.1,
    })
    f.gloss(ctx, -0.45, -0.5, 0.12, 0.07, -1)
  },
  crown(ctx, f) {
    group(ctx, [
      {
        p: f.path('M-0.85 0.05 L-0.85 -0.8 L-0.42 -0.4 L0 -1.05 L0.42 -0.4 L0.85 -0.8 L0.85 0.05 Z'),
        c: GOLD,
        k: 1.1,
      },
      gem(f, 0, -0.35, 0.13, '#ff6b6b'),
      gem(f, -0.5, -0.3, 0.09, '#4dabf7'),
      gem(f, 0.5, -0.3, 0.09, '#4dabf7'),
    ])
    f.gloss(ctx, -0.55, -0.55, 0.14, 0.07, -1)
  },
  halo(ctx, f) {
    const ring = f.ell(0, -0.85, 0.95, 0.28)
    ctx.lineCap = 'round'
    ctx.strokeStyle = OUTLINE
    ctx.lineWidth = 7
    ctx.stroke(ring)
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 4
    ctx.stroke(ring)
    f.gloss(ctx, -0.5, -1.05, 0.22, 0.06, -0.2)
  },
  tophat(ctx, f, c) {
    group(ctx, [
      { p: f.path('M-1.2 0 C-1.2 -0.25 1.2 -0.25 1.2 0 C1.2 0.2 -1.2 0.2 -1.2 0 Z'), c: DARK },
      { p: f.path('M-0.6 -0.05 L-0.52 -1.3 Q0 -1.4 0.52 -1.3 L0.6 -0.05 Z'), c: DARK, k: 1.2 },
      { p: f.path('M-0.59 -0.4 L0.59 -0.4 L0.6 -0.05 L-0.6 -0.05 Z'), c, k: 1.2 },
    ])
    f.gloss(ctx, -0.33, -0.95, 0.1, 0.25, 0.1)
  },
  bandana(ctx, f, c) {
    group(ctx, [
      { p: f.path('M-0.95 0.25 L-1.7 -0.1 L-1.5 0.4 L-1.85 0.9 L-0.9 0.65 Z'), c: darkOf(c), k: 0.8 },
      { p: f.path('M-1 0.3 Q0 -0.75 1 0.3 L1 0.7 Q0 -0.15 -1 0.7 Z'), c, k: 1.2 },
    ])
    for (const [x, y] of [
      [-0.4, 0.05],
      [0.25, -0.12],
      [0.7, 0.12],
    ])
      paint(ctx, { p: f.ell(x, y, 0.07, 0.07), c: '#ffffff', k: 0, lw: 0 })
    f.gloss(ctx, -0.6, 0.15, 0.2, 0.06, -0.5)
  },
  mask(ctx, f, c) {
    group(ctx, [
      { p: f.path('M0.9 0.2 L1.9 -0.2 L1.65 0.35 L2 0.8 L0.85 0.55 Z'), c, k: 1 },
      { p: f.path(DOME), c: DARK, k: 1.2 },
      { p: f.path('M-1 0.1 L1 0.1 Q1 0.9 0 0.95 Q-1 0.9 -1 0.1 Z'), c: DARK, k: 1 },
    ])
    f.line(ctx, 'M-1 0.1 L1 0.1', c, 1.8)
    for (const x of [-0.42, 0.42]) paint(ctx, { p: f.ell(x, 0.5, 0.22, 0.12), c: '#f4f7ff', k: 0, lw: 0 })
    f.gloss(ctx, -0.4, -0.65, 0.2, 0.11, -0.6)
  },
  tricorn(ctx, f, c) {
    group(ctx, [{ p: f.path('M-1.35 0.1 Q0 -1.5 1.35 0.1 Q0 -0.45 -1.35 0.1 Z'), c: '#4a3a3a', k: 1.2 }])
    f.line(ctx, 'M-1.1 -0.05 Q0 -0.65 1.1 -0.05', GOLD, 1.6)
    paint(ctx, { p: f.ell(0, -0.55, 0.16, 0.16), c: mix(c, '#ffffff', 0.7), k: 0, lw: 1.2 })
    f.gloss(ctx, -0.5, -0.65, 0.2, 0.09, -0.5)
  },
  spikes(ctx, f, c) {
    const s = mix(c, '#1e2a5a', 0.25)
    group(ctx, [
      {
        p: f.path(
          'M-1 0.3 L-1.2 -0.7 L-0.6 -0.35 L-0.4 -1.4 L0 -0.65 L0.4 -1.55 L0.6 -0.5 L1.3 -0.95 L1 0.3 Q0 -0.15 -1 0.3 Z',
        ),
        c: s,
        k: 1.2,
      },
    ])
    f.gloss(ctx, -0.55, -0.5, 0.12, 0.2, 0.3)
  },
  goggles(ctx, f, c) {
    f.line(ctx, 'M-1 0 L1 0', DARK, 3.4)
    group(ctx, [
      { p: f.ell(-0.4, -0.1, 0.34, 0.34), c: darkOf(c), k: 0.8 },
      { p: f.ell(0.4, -0.1, 0.34, 0.34), c: darkOf(c), k: 0.8 },
    ])
    for (const x of [-0.4, 0.4]) paint(ctx, { p: f.ell(x, -0.1, 0.23, 0.23), c: LENS, k: 1, lw: 1.2 })
    for (const x of [-0.48, 0.32]) f.gloss(ctx, x, -0.2, 0.09, 0.05, -0.6)
    paint(ctx, {
      p: f.path('M-0.1 -0.15 L0.1 -0.15 L0.1 -0.05 L-0.1 -0.05 Z'),
      c: lightOf(DARK),
      k: 0,
      lw: 1.2,
    })
  },
}

/** Draws `hat` on a head `box` (creatures face +x). `none` draws nothing. */
export function drawHat(ctx: Ctx, hat: HeroHat, box: HeadBox, color: string): void {
  if (hat === 'none') return
  ctx.save()
  HAT_PAINTERS[hat](ctx, new Fit(box), color)
  ctx.restore()
}
