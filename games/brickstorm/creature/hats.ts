/** The 14 hero hats, redrawn in the creature style (thick outline, cel shade, gloss). Each fits any head box. */

import type { HeroHat } from '../sim/heroes'
import type { HeadBox } from './types'
import { darkOf, gloss, group, lightOf, mix, paint, type Part } from './paint'

type Ctx = CanvasRenderingContext2D

const STEEL = '#c3ccd8'
const GOLD = '#ffd43b'
const HORN = '#f1e6c8'
const DARK = '#232a40'
const LENS = '#a5d8ff'

/**
 * Maps hat units (1 = crown half-width, +x forward, -y up, 0 = brim line) onto a head box.
 * w = 1.05 * max(rx, 1.15 ry): wide short heads do not get extra-tall hats. Brim line sits at box.y - 0.35 ry (on the forehead).
 */
export class Fit {
  readonly w: number
  readonly x: number
  readonly y: number
  constructor(box: HeadBox) {
    this.w = Math.max(box.rx, box.ry * 1.15) * 1.05
    this.x = box.x
    this.y = box.y - box.ry * 0.35
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
  /** Flat ring: outer ellipse clockwise, inner counter-clockwise (nonzero fill leaves the hole). */
  ring(cx: number, cy: number, rx: number, ry: number, t: number): Path2D {
    const p = new Path2D()
    const [x, y] = [this.x + cx * this.w, this.y + cy * this.w]
    p.ellipse(x, y, rx * this.w, ry * this.w, 0, 0, Math.PI * 2)
    p.moveTo(x + (rx - t) * this.w, y)
    p.ellipse(x, y, (rx - t) * this.w, (ry - t) * this.w, 0, 0, Math.PI * 2, true)
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
  cap(ctx, f, c) {
    group(ctx, [
      {
        p: f.path('M0.1 -0.02 Q1.2 -0.32 1.75 -0.02 Q1.85 0.22 1.5 0.28 Q0.9 0.18 0.1 0.22 Z'),
        c: darkOf(c),
      },
      { p: f.path(DOME), c, k: 1.3 },
    ])
    f.line(ctx, 'M0 -0.94 Q0.45 -0.5 0.42 0', darkOf(c), 1.3)
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
    // Outer cowl and the face opening wind in opposite directions, so the nonzero fill leaves a hole.
    const cowl = f.path(
      'M1.35 1.5 C1.8 -0.2 1.1 -1.5 0 -1.55 C-0.6 -1.55 -1.2 -1.5 -1.95 -2 C-1.65 -1.3 -1.75 -0.4 -1.5 1.5 Z M-0.95 1.5 C-1.1 0 -0.8 -0.95 0 -0.95 C0.8 -0.95 1.1 0 0.95 1.5 Z',
    )
    group(ctx, [{ p: cowl, c: hood, k: 1.2 }])
    f.line(ctx, 'M-0.95 1.5 C-1.1 0 -0.8 -0.95 0 -0.95 C0.8 -0.95 1.1 0 0.95 1.5', darkOf(hood), 3)
    f.gloss(ctx, -0.6, -1.15, 0.28, 0.12, -0.7)
  },
  wizard(ctx, f, c) {
    group(ctx, [
      { p: f.path('M-0.95 0.05 Q-0.7 -1.3 0.4 -2 Q1.1 -2.3 1.3 -1.9 Q0.7 -1.1 0.95 0.05 Z'), c, k: 1.2 },
      {
        p: f.path('M-1.4 0.05 C-1.4 -0.3 1.4 -0.3 1.4 0.05 C1.4 0.4 -1.4 0.4 -1.4 0.05 Z'),
        c: darkOf(c),
        k: 0.8,
      },
    ])
    f.line(ctx, 'M-0.95 -0.12 Q0 -0.3 0.95 -0.12', GOLD, 2)
    paint(ctx, {
      p: f.path(
        'M0 -1 L0.12 -0.72 L0.4 -0.7 L0.18 -0.5 L0.25 -0.22 L0 -0.37 L-0.25 -0.22 L-0.18 -0.5 L-0.4 -0.7 L-0.12 -0.72 Z',
      ),
      c: GOLD,
      k: 0,
      lw: 1.1,
    })
    f.gloss(ctx, -0.5, -0.9, 0.12, 0.3, 0.3)
  },
  crown(ctx, f) {
    group(ctx, [
      {
        p: f.path('M-1 0.1 L-1.05 -0.95 L-0.5 -0.45 L0 -1.3 L0.5 -0.45 L1.05 -0.95 L1 0.1 Z'),
        c: GOLD,
        k: 1.1,
      },
      gem(f, 0, -0.4, 0.15, '#ff6b6b'),
      gem(f, -0.6, -0.3, 0.11, '#4dabf7'),
      gem(f, 0.6, -0.3, 0.11, '#4dabf7'),
    ])
    f.gloss(ctx, -0.65, -0.6, 0.16, 0.08, -1)
  },
  halo(ctx, f) {
    group(ctx, [{ p: f.ring(0, -0.9, 1.05, 0.38, 0.14), c: GOLD, k: 1 }])
    f.gloss(ctx, -0.55, -1.2, 0.2, 0.05, -0.2)
  },
  tophat(ctx, f, c) {
    const felt = mix(c, DARK, 0.7)
    group(ctx, [
      { p: f.path('M-1.4 0.1 C-1.4 -0.2 1.4 -0.2 1.4 0.1 C1.4 0.35 -1.4 0.35 -1.4 0.1 Z'), c: felt },
      { p: f.path('M-0.85 0 L-0.78 -1.85 Q0 -1.98 0.78 -1.85 L0.85 0 Z'), c: felt, k: 1.2 },
      { p: f.path('M-0.84 -0.5 L0.84 -0.5 L0.85 0 L-0.85 0 Z'), c, k: 1.2 },
    ])
    f.gloss(ctx, -0.5, -1.25, 0.1, 0.35, 0.1)
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
    const cloth = mix(c, DARK, 0.7)
    group(ctx, [
      { p: f.path('M-0.9 0.2 L-1.9 -0.2 L-1.65 0.35 L-2 0.8 L-0.85 0.55 Z'), c, k: 1 },
      { p: f.path(DOME), c: cloth, k: 1.2 },
      { p: f.path('M-1 0.1 L1 0.1 Q1 0.9 0 0.95 Q-1 0.9 -1 0.1 Z'), c: cloth, k: 1 },
    ])
    f.line(ctx, 'M-1 0.1 L1 0.1', c, 1.8)
    for (const x of [-0.42, 0.42]) paint(ctx, { p: f.ell(x, 0.5, 0.22, 0.12), c: '#f4f7ff', k: 0, lw: 0 })
    f.gloss(ctx, -0.4, -0.65, 0.2, 0.11, -0.6)
  },
  tricorn(ctx, f, c) {
    const felt = mix(c, '#3b2f2f', 0.65)
    group(ctx, [
      {
        p: f.path('M-1.45 -0.3 Q-0.7 0.5 0.1 0.45 Q0.9 0.5 1.45 -0.3 Q0 -0.15 -1.45 -0.3 Z'),
        c: darkOf(felt),
        k: 0.8,
      },
      {
        p: f.path('M-1.05 -0.2 Q-0.95 -1.15 0 -1.15 Q0.95 -1.15 1.05 -0.2 Q0 0 -1.05 -0.2 Z'),
        c: felt,
        k: 1.2,
      },
    ])
    f.line(ctx, 'M-1.4 -0.3 Q-0.7 0.45 0.1 0.4 Q0.9 0.45 1.4 -0.3', GOLD, 2.4)
    paint(ctx, { p: f.ell(0.1, -0.6, 0.17, 0.17), c: mix(c, '#ffffff', 0.7), k: 0, lw: 1.2 })
    f.gloss(ctx, -0.5, -0.8, 0.22, 0.09, -0.5)
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
