import { formatNumber } from '@forge/core/i18n'
// Screen-space HUD shared by both renderers: hearts and multiplier up top;
// a bottom-centre cluster under the ghost (score + distance | Phantom skill
// ring with its key hint | speed); floating "+50"s, sparks, banners and edge
// flashes. Works at any size (CSS pixels).

import { Particles } from '@forge/fx/particles'
import { clamp, ease, lerp, progress } from '@forge/fx/tween'
import { FONT } from '@forge/ui/theme'
import type { Moment } from './moments'
import { C } from './palette'
import { MAX_HEARTS, MAX_TIER, comboMultiplier, speedAt, type DriftState } from './sim'
import { distanceText, kmh } from './stats'

const METER_R = 32
const MARGIN = 20
/** Key hint under the ring. */
const KEY_H = 24
/** Gap between the ring and the text on each side. */
const SIDE_GAP = 20
const SPARK_TIME = 0.45
const BANNER_TIME = 1.4

/** Centre of the Phantom ring for a view of `w` × `h`. */
export const meterAt = (w: number, h: number): [number, number] => [w / 2, h - 12 - KEY_H - 8 - METER_R]

/** Touch-only devices get a swipe-up hint; anything with a keyboard/mouse gets the key. */
export function prefersTouchHint(): boolean {
  try {
    return globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false
  } catch {
    return false
  }
}

/** True when a point (same units as the view) is on the Phantom ring: tap target for touch. */
export function meterHit(x: number, y: number, w: number, h: number): boolean {
  const [cx, cy] = meterAt(w, h)
  return Math.hypot(x - cx, y - cy) < METER_R * 1.5
}

export class DriftHud {
  private fx = new Particles()
  private time = 0
  private scoreShown = 0
  private scorePop = -10
  private multPop = -10
  private hitAt = -10
  private tierAt = -10
  private sparks: { x: number; y: number; at: number }[] = []
  private banners: (Moment & { at: number })[] = []
  private touch = prefersTouchHint()

  /** Floating text at a screen position. */
  text(x: number, y: number, text: string, color: string, size = 22): void {
    this.fx.text(x, y, text, { color, size, rise: 46 })
  }

  heal(): void {
    this.fx.burst(MARGIN + 8, MARGIN + 12, {
      count: 16,
      color: [C.heart, '#fff'],
      speed: 120,
      life: 0.6,
      size: 5,
    })
  }

  /** A wisp's spark flies from a screen point into the Phantom ring. */
  spark(x: number, y: number): void {
    this.sparks.push({ x, y, at: this.time })
  }

  multiplier(): void {
    this.multPop = this.time
  }

  hit(): void {
    this.hitAt = this.time
  }

  tier(): void {
    this.tierAt = this.time
  }

  /** Drop any queued messages (the run just ended). */
  clearBanners(): void {
    this.banners = []
  }

  /** Big centred message for a moment; queued so they never overlap. */
  banner(m: Moment): void {
    const last = this.banners.at(-1)
    const at = last ? Math.max(this.time, last.at + BANNER_TIME * 0.7) : this.time
    this.banners.push({ ...m, at })
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, s: DriftState, dt: number): void {
    this.time += dt
    this.fx.update(dt)
    const p = s.player
    this.edges(ctx, w, h, p.hearts)

    for (let i = 0; i < MAX_HEARTS; i++) {
      const beat = p.hearts === 1 && i === 0 ? 1 + 0.15 * Math.max(0, Math.sin(this.time * 7)) : 1
      this.heart(ctx, MARGIN + 8 + i * 30, MARGIN + 12, i < p.hearts, beat)
    }

    // Bottom-centre cluster under the ghost: score + distance on the left,
    // the Phantom ring in the middle, speed on the right, mirrored.
    const [mx, my] = meterAt(w, h)
    const score = Math.floor(s.score)
    if (score - this.scoreShown >= 10) this.scorePop = this.time
    this.scoreShown = score
    this.readout(
      ctx,
      mx - METER_R - SIDE_GAP,
      my,
      'right',
      formatNumber(score),
      distanceText(s.diedDist ?? s.dist),
      this.scorePop,
      '#fff',
    )
    const level = clamp((s.speed - speedAt(0)) / (speedAt(MAX_TIER) - speedAt(0)), 0, 1)
    const speedColor = `hsl(${lerp(185, 330, level)} 100% ${lerp(88, 75, level)}%)`
    this.readout(
      ctx,
      mx + METER_R + SIDE_GAP,
      my,
      'left',
      String(kmh(s.speed)),
      'km/h',
      this.tierAt,
      speedColor,
    )

    const mult = comboMultiplier(s)
    if (mult > 1) {
      const mp = 1 - ease.outCubic(progress(this.time, this.multPop, 0.4))
      ctx.font = `700 ${Math.round((22 + mult * 2) * (1 + mp * 0.8))}px ${FONT}`
      ctx.textAlign = 'right'
      this.shadowed(ctx, `×${mult}`, w - MARGIN, MARGIN + 14, mp > 0.05 ? '#fff' : C.gold)
    }

    this.meter(ctx, w, h, s)
    this.drawSparks(ctx, w, h)
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
    const size = Math.min(b.big ? 56 : 40, w / (b.big ? 9 : 12))
    ctx.save()
    ctx.translate(w / 2, h * 0.3)
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

  /** Big number over a small label; pops when `popAt` is recent. Used for score and speed alike. */
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

  /** Phantom ring: fills with wisps, pulses when ready, drains while active. */
  private meter(ctx: CanvasRenderingContext2D, w: number, h: number, s: DriftState) {
    const p = s.player
    const [cx, cy] = meterAt(w, h)
    const phantom = s.tick < p.phantomUntil
    const fill = Math.min(1, p.charge / s.perks.phantomCost)
    const ready = fill >= 1
    ctx.fillStyle = 'rgb(8 6 24 / 0.5)'
    ctx.beginPath()
    ctx.arc(cx, cy, METER_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgb(255 255 255 / 0.15)'
    ctx.beginPath()
    ctx.arc(cx, cy, METER_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = ready || phantom ? C.phantom : C.wisp
    ctx.beginPath()
    const amount = phantom ? (p.phantomUntil - s.tick) / s.perks.phantomTicks : fill
    ctx.arc(cx, cy, METER_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * amount)
    ctx.stroke()
    if (ready) {
      ctx.globalAlpha = 0.3 + 0.2 * Math.sin(this.time * 8)
      ctx.fillStyle = C.phantom
      ctx.beginPath()
      ctx.arc(cx, cy, METER_R + 8 + 3 * Math.sin(this.time * 8), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = ready ? 0.75 + 0.25 * Math.sin(this.time * 8) : 0.5
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(1.7, 1.7)
    this.ghostIcon(ctx, 0, 0, '#fff')
    ctx.restore()
    ctx.globalAlpha = 1
    this.skillHint(ctx, cx, cy + METER_R + 8 + KEY_H / 2, ready && !phantom)
  }

  /** Which input fires the skill: a SPACE keycap, or a swipe-up chevron on touch. */
  private skillHint(ctx: CanvasRenderingContext2D, cx: number, cy: number, ready: boolean) {
    const pulse = ready ? 0.5 + 0.5 * Math.sin(this.time * 8) : 0
    const bw = this.touch ? 34 : 60
    const bh = KEY_H
    ctx.save()
    ctx.globalAlpha = ready ? 1 : 0.55
    // Keycap: dark face, a lighter bottom lip, glowing edge when ready.
    ctx.fillStyle = 'rgb(255 255 255 / 0.18)'
    ctx.beginPath()
    ctx.roundRect(cx - bw / 2, cy - bh / 2 + 2, bw, bh, 5)
    ctx.fill()
    ctx.fillStyle = ready ? 'rgb(60 36 110 / 0.95)' : 'rgb(14 12 36 / 0.85)'
    ctx.beginPath()
    ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 5)
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = ready ? C.phantom : 'rgb(255 255 255 / 0.35)'
    if (ready) {
      ctx.shadowColor = C.phantom
      ctx.shadowBlur = 8 + pulse * 8
    }
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#fff'
    if (this.touch) {
      // Two stacked chevrons: swipe up.
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const dy of [2, -3]) {
        ctx.beginPath()
        ctx.moveTo(cx - 5, cy + dy + 2)
        ctx.lineTo(cx, cy + dy - 3)
        ctx.lineTo(cx + 5, cy + dy + 2)
        ctx.stroke()
      }
    } else {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `800 12px ${FONT}`
      ctx.fillText('SPACE', cx, cy + 1)
    }
    ctx.restore()
  }

  private drawSparks(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const [mx, my] = meterAt(w, h)
    const done = this.sparks.filter((sp) => this.time - sp.at >= SPARK_TIME)
    for (let i = 0; i < done.length; i++)
      this.fx.burst(mx, my, { count: 6, color: [C.wisp, '#fff'], speed: 90, life: 0.3, size: 4 })
    this.sparks = this.sparks.filter((sp) => this.time - sp.at < SPARK_TIME)
    for (const sp of this.sparks) {
      const t = ease.inCubic(progress(this.time, sp.at, SPARK_TIME))
      // Arc up and over into the ring.
      const x = lerp(sp.x, mx, t)
      const y = lerp(sp.y, my, t) - Math.sin(t * Math.PI) * 80
      ctx.fillStyle = C.wisp
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      ctx.arc(x, y, 11 * (1 - t * 0.5), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 0.95
      ctx.beginPath()
      ctx.arc(x, y, 5 * (1 - t * 0.5), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  private ghostIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy - 2, 9, Math.PI, 0)
    ctx.lineTo(cx + 9, cy + 10)
    ctx.lineTo(cx + 3, cy + 6)
    ctx.lineTo(cx - 3, cy + 10)
    ctx.lineTo(cx - 9, cy + 6)
    ctx.closePath()
    ctx.fill()
  }

  private heart(ctx: CanvasRenderingContext2D, x: number, y: number, full: boolean, scale = 1) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    ctx.fillStyle = full ? C.heart : 'rgb(255 255 255 / 0.15)'
    ctx.beginPath()
    ctx.moveTo(0, 9)
    ctx.bezierCurveTo(-14, -1, -8, -12, 0, -5)
    ctx.bezierCurveTo(8, -12, 14, -1, 0, 9)
    ctx.fill()
    ctx.restore()
  }
}
