// Screen-space HUD for 2D reaction games (Halo Guard, Synthstride): hearts and
// combo multiplier up top; a bottom-centre cluster (score | skill ring with its
// key hint | a second readout); floating text, banners and red edge flashes.
// Draws in whatever units the canvas uses. Import from '@forge/reflex/hud2d'
// (kept apart from '@forge/reflex' so pure sims never pull in drawing code).

import { Particles } from '../fx/particles'
import { ease, progress } from '../fx/tween'
import { FONT } from '../ui/theme'

/** A big celebratory message ("NEW BEST!"). */
export interface Banner {
  text: string
  color: string
  /** The biggest ones are drawn larger (games usually add a fanfare). */
  big?: boolean
}

/** Everything the HUD shows for one frame. */
export interface HudFrame {
  hearts: number
  maxHearts: number
  score: number
  /** Small label under the score (time, distance…). */
  scoreLabel: string
  /** Readout right of the skill ring, styled like the score. */
  right: { value: string; label: string; color: string }
  /** Combo multiplier; shown top right when above 1. */
  mult: number
  skill: {
    /** 0..1 charge. */
    fill: number
    /** 0..1 time left while the skill runs, else 0. */
    active: number
    /** Ring colour while charging, and when ready / active. */
    color: string
    readyColor: string
    /** Draws the skill's icon centred on (0, 0), about 20 units across. */
    icon(ctx: CanvasRenderingContext2D): void
  }
}

export interface HudOptions {
  heartColor?: string
  goldColor?: string
  /** Keycap text for the skill, e.g. "SPACE". */
  keyLabel?: string
  /** Shown instead of the keycap on touch-only devices, e.g. "TAP". */
  touchLabel?: string
}

const METER_R = 32
const MARGIN = 20
const KEY_H = 24
const SIDE_GAP = 20
const BANNER_TIME = 1.4

/** Centre of the skill ring for a view of `w` × `h`. */
export const skillRingAt = (w: number, h: number): [number, number] => [w / 2, h - 12 - KEY_H - 8 - METER_R]

/** True when a point is on the skill ring (tap target on touch). */
export function skillRingHit(x: number, y: number, w: number, h: number): boolean {
  const [cx, cy] = skillRingAt(w, h)
  return Math.hypot(x - cx, y - cy) < METER_R * 1.5
}

/** Touch-only devices get the touch label; anything with a keyboard gets the keycap. */
export function prefersTouch(): boolean {
  try {
    return globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false
  } catch {
    return false
  }
}

/** Top of the bottom HUD cluster: keep gameplay above this. */
export const hudBottomTop = (h: number) => skillRingAt(1, h)[1] - METER_R - 12

export class ReflexHud {
  private fx = new Particles()
  private time = 0
  private scoreShown = 0
  private scorePop = -10
  private rightPop = -10
  private multPop = -10
  private hitAt = -10
  private banners: (Banner & { at: number })[] = []
  private touch = prefersTouch()
  private opts: Required<HudOptions>

  constructor(opts: HudOptions = {}) {
    this.opts = {
      heartColor: '#ff5d7a',
      goldColor: '#ffd84d',
      keyLabel: 'SPACE',
      touchLabel: 'TAP',
      ...opts,
    }
  }

  /** Floating text at a point. */
  text(x: number, y: number, text: string, color: string, size = 22): void {
    this.fx.text(x, y, text, { color, size, rise: 46 })
  }

  burst(x: number, y: number, color: string | string[], count = 14): void {
    this.fx.burst(x, y, { count, color, speed: 140, life: 0.5, size: 5 })
  }

  heal(): void {
    this.burst(MARGIN + 8, MARGIN + 12, [this.opts.heartColor, '#fff'], 16)
  }

  multiplier(): void {
    this.multPop = this.time
  }

  hit(): void {
    this.hitAt = this.time
  }

  /** Pop the right-hand readout (tempo up, speed up…). */
  popRight(): void {
    this.rightPop = this.time
  }

  clearBanners(): void {
    this.banners = []
  }

  /** Big centred message; queued so they never overlap. */
  banner(b: Banner): void {
    const last = this.banners.at(-1)
    const at = last ? Math.max(this.time, last.at + BANNER_TIME * 0.7) : this.time
    this.banners.push({ ...b, at })
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, f: HudFrame, dt: number): void {
    this.time += dt
    this.fx.update(dt)
    this.edges(ctx, w, h, f.hearts)

    for (let i = 0; i < f.maxHearts; i++) {
      const beat = f.hearts === 1 && i === 0 ? 1 + 0.15 * Math.max(0, Math.sin(this.time * 7)) : 1
      this.heart(ctx, MARGIN + 8 + i * 30, MARGIN + 12, i < f.hearts, beat)
    }

    const [mx, my] = skillRingAt(w, h)
    const score = Math.floor(f.score)
    if (score - this.scoreShown >= 5) this.scorePop = this.time
    this.scoreShown = score
    this.readout(
      ctx,
      mx - METER_R - SIDE_GAP,
      my,
      'right',
      score.toLocaleString(),
      f.scoreLabel,
      this.scorePop,
      '#fff',
    )
    this.readout(
      ctx,
      mx + METER_R + SIDE_GAP,
      my,
      'left',
      f.right.value,
      f.right.label,
      this.rightPop,
      f.right.color,
    )

    if (f.mult > 1) {
      const mp = 1 - ease.outCubic(progress(this.time, this.multPop, 0.4))
      ctx.font = `700 ${Math.round((22 + f.mult * 2) * (1 + mp * 0.8))}px ${FONT}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      this.shadowed(ctx, `×${f.mult}`, w - MARGIN, MARGIN + 14, mp > 0.05 ? '#fff' : this.opts.goldColor)
    }

    this.ring(ctx, mx, my, f.skill)
    this.drawBanners(ctx, w, h)
    this.fx.draw(ctx)
  }

  private drawBanners(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.banners = this.banners.filter((b) => this.time - b.at < BANNER_TIME)
    const b = this.banners.find((x) => this.time >= x.at)
    if (!b) return
    const t = (this.time - b.at) / BANNER_TIME
    const scale = t < 0.18 ? ease.outBack(t / 0.18) : 1 + (t - 0.18) * 0.08
    const alpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1
    const size = Math.min(b.big ? 52 : 38, w / (b.big ? 9 : 12))
    ctx.save()
    ctx.translate(w / 2, h * 0.14)
    ctx.scale(scale, scale)
    ctx.globalAlpha = alpha
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `800 ${Math.round(size)}px ${FONT}`
    ctx.lineJoin = 'round'
    ctx.lineWidth = size * 0.16
    ctx.strokeStyle = 'rgb(10 6 30 / 0.85)'
    ctx.strokeText(b.text, 0, 0)
    ctx.shadowColor = b.color
    ctx.shadowBlur = size * 0.5
    ctx.fillStyle = b.color
    ctx.fillText(b.text, 0, 0)
    ctx.restore()
  }

  private shadowed(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
    ctx.fillStyle = 'rgb(0 0 0 / 0.4)'
    ctx.fillText(text, x + 1, y + 2)
    ctx.fillStyle = color
    ctx.fillText(text, x, y)
  }

  /** Red edges: a flash on a hit, a slow pulse on the last heart. */
  private edges(ctx: CanvasRenderingContext2D, w: number, h: number, hearts: number) {
    const flash = 1 - progress(this.time, this.hitAt, 0.45)
    const pulse = hearts === 1 ? 0.18 + 0.12 * Math.sin(this.time * 7) : 0
    const a = Math.max(flash * 0.5, pulse)
    if (a <= 0.01) return
    const g = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.35,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.75,
    )
    g.addColorStop(0, 'rgb(255 40 80 / 0)')
    g.addColorStop(1, `rgb(255 40 80 / ${a})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  private readout(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    align: CanvasTextAlign,
    value: string,
    label: string,
    popAt: number,
    color: string,
  ) {
    const pop = 1 + 0.2 * (1 - ease.outCubic(progress(this.time, popAt, 0.3)))
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.save()
    ctx.translate(x, y - 8)
    ctx.scale(pop, pop)
    ctx.font = `800 30px ${FONT}`
    this.shadowed(ctx, value, 0, 0, color)
    ctx.restore()
    ctx.font = `700 14px ${FONT}`
    this.shadowed(ctx, label, x, y + 17, 'rgb(220 235 255 / 0.85)')
  }

  /** Skill ring: fills with charge, pulses when ready, drains while active. */
  private ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, sk: HudFrame['skill']) {
    const ready = sk.fill >= 1 && sk.active <= 0
    const active = sk.active > 0
    ctx.fillStyle = 'rgb(8 6 24 / 0.55)'
    ctx.beginPath()
    ctx.arc(cx, cy, METER_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgb(255 255 255 / 0.15)'
    ctx.beginPath()
    ctx.arc(cx, cy, METER_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = ready || active ? sk.readyColor : sk.color
    ctx.beginPath()
    const amount = active ? sk.active : Math.min(1, sk.fill)
    ctx.arc(cx, cy, METER_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * amount)
    ctx.stroke()
    if (ready) {
      ctx.globalAlpha = 0.3 + 0.2 * Math.sin(this.time * 8)
      ctx.fillStyle = sk.readyColor
      ctx.beginPath()
      ctx.arc(cx, cy, METER_R + 8 + 3 * Math.sin(this.time * 8), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = ready ? 0.75 + 0.25 * Math.sin(this.time * 8) : 0.55
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(1.4, 1.4)
    sk.icon(ctx)
    ctx.restore()
    ctx.globalAlpha = 1
    this.keyHint(ctx, cx, cy + METER_R + 8 + KEY_H / 2, ready, sk.readyColor)
  }

  /** Which input fires the skill: a keycap, or the touch label on touch-only devices. */
  private keyHint(ctx: CanvasRenderingContext2D, cx: number, cy: number, ready: boolean, color: string) {
    const label = this.touch ? this.opts.touchLabel : this.opts.keyLabel
    ctx.font = `800 12px ${FONT}`
    const bw = Math.max(34, ctx.measureText(label).width + 22)
    const bh = KEY_H
    const pulse = ready ? 0.5 + 0.5 * Math.sin(this.time * 8) : 0
    ctx.save()
    ctx.globalAlpha = ready ? 1 : 0.55
    ctx.fillStyle = 'rgb(255 255 255 / 0.18)'
    ctx.beginPath()
    ctx.roundRect(cx - bw / 2, cy - bh / 2 + 2, bw, bh, 5)
    ctx.fill()
    ctx.fillStyle = ready ? 'rgb(40 30 90 / 0.95)' : 'rgb(14 12 36 / 0.85)'
    ctx.beginPath()
    ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 5)
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = ready ? color : 'rgb(255 255 255 / 0.35)'
    if (ready) {
      ctx.shadowColor = color
      ctx.shadowBlur = 8 + pulse * 8
    }
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, cx, cy + 1)
    ctx.restore()
  }

  private heart(ctx: CanvasRenderingContext2D, x: number, y: number, full: boolean, scale = 1) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    ctx.fillStyle = full ? this.opts.heartColor : 'rgb(255 255 255 / 0.15)'
    ctx.beginPath()
    ctx.moveTo(0, 9)
    ctx.bezierCurveTo(-14, -1, -8, -12, 0, -5)
    ctx.bezierCurveTo(8, -12, 14, -1, 0, 9)
    ctx.fill()
    ctx.restore()
  }
}
