import { formatNumber } from '@forge/core/i18n'
// Screen-space HUD shared by both renderers: the multiplier up top; a
// bottom-centre cluster under the ghost (score + distance with the hearts
// under them | Phantom skill ring with its key hint | speed); floating
// "+50"s, sparks, banners and edge flashes. Works at any size (CSS pixels).

import { Particles } from '@forge/fx/particles'
import { clamp, ease, lerp, prefersReducedMotion, progress } from '@forge/fx/tween'
import { FONT } from '@forge/ui/theme'
import type { Moment } from './moments'
import { C } from './palette'
import { MAX_HEARTS, MAX_TIER, comboMultiplier, regenProgress, speedAt, type DriftState } from './sim'
import { distanceText, kmh } from './stats'

const METER_R = 32
const MARGIN = 20
/** Key hint under the ring. */
const KEY_H = 24
/** Gap between the ring and the text on each side. */
const SIDE_GAP = 20
const SPARK_TIME = 0.45
/** Heart row: spacing, drawing scale, half width, and how far below the ring's centre. */
const HEART_GAP = 33
const HEART_SCALE = 1.35
const HEART_HALF_W = 14
const HEART_DROP = 44
/** Heart path bounds (local units, before HEART_SCALE). */
const HEART_TOP = -10
const HEART_BOTTOM = 9
const GAIN_TIME = 0.45
const LOSE_TIME = 0.5
const SHAKE_TIME = 0.35
const BANNER_TIME = 1.4

/** Centre of the Phantom ring for a view of `w` × `h`. */
export const meterAt = (w: number, h: number): [number, number] => [w / 2, h - 12 - KEY_H - 8 - METER_R]

/**
 * Centre of heart slot `i` of `count`: a row under the score and distance,
 * right-aligned with them beside the Phantom ring. Above the ring would sit
 * on the ghost (on phones it stands right on the ring).
 */
export function heartSlot(w: number, h: number, i: number, count = MAX_HEARTS): [number, number] {
  const [mx, my] = meterAt(w, h)
  const right = mx - METER_R - SIDE_GAP - HEART_HALF_W
  return [right - (count - 1 - i) * HEART_GAP, my + HEART_DROP]
}

/** The heart outline around (0, 0), about 22 × 19 units (also the 3D model's curves). */
export function traceHeart(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath()
  ctx.moveTo(0, 9)
  ctx.bezierCurveTo(-14, -1, -8, -12, 0, -5)
  ctx.bezierCurveTo(8, -12, 14, -1, 0, 9)
  ctx.closePath()
}

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
  private reduced = prefersReducedMotion()
  /** Hearts drawn last frame (-1 = not yet), to animate gains and losses. */
  private heartsShown = -1
  private lastTick = -1
  /** Per slot: when it last popped in or cracked. */
  private slotFx: ({ kind: 'gain' | 'lose'; at: number } | null)[] = Array(MAX_HEARTS).fill(null)
  private rowShakeAt = -10
  /** Hearts picked up on the track, flying into their slot. */
  private flights: { x: number; y: number; at: number }[] = []
  /** Built once (in the heart's local units), reused by every heart. */
  private gloss: CanvasGradient | null = null

  /** Floating text at a screen position. */
  text(x: number, y: number, text: string, color: string, size = 22): void {
    this.fx.text(x, y, text, { color, size, rise: 46 })
  }

  /** A heart picked up at a screen point flies into its slot (which pops when it lands). */
  heartPickup(x: number, y: number): void {
    this.flights.push({ x, y, at: this.time })
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
    this.trackHearts(w, h, s)
    this.hearts(ctx, w, h, s)

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
    this.drawFlights(ctx, w, h)
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

  /** Notice hearts gained or lost since last frame and start their animations. */
  private trackHearts(w: number, h: number, s: DriftState) {
    const now = s.player.hearts
    const newRun = s.tick < this.lastTick
    this.lastTick = s.tick
    if (this.heartsShown < 0 || newRun) {
      this.heartsShown = now
      this.slotFx.fill(null)
      this.flights = []
      return
    }
    const was = this.heartsShown
    this.heartsShown = now
    for (let i = now; i < was; i++) {
      this.slotFx[i] = { kind: 'lose', at: this.time }
      this.rowShakeAt = this.time
      const [x, y] = heartSlot(w, h, i)
      this.fx.burst(x, y, {
        count: 16,
        color: [C.heart, '#ff1f4f', '#ffd0da'],
        speed: 160,
        life: 0.6,
        size: 4,
        gravity: 320,
        shape: 'square',
      })
    }
    // A pickup's slot pops when its flying heart lands; a regrown one right away.
    const flying = this.flights.length > 0
    const lands = flying ? this.flights.at(-1)!.at + SPARK_TIME : this.time
    for (let i = was; i < now; i++) {
      this.slotFx[i] = { kind: 'gain', at: lands }
      if (!flying) this.sparkle(...heartSlot(w, h, i))
    }
  }

  private sparkle(x: number, y: number) {
    if (this.reduced) return
    this.fx.burst(x, y, { count: 16, color: ['#fff', C.heart, C.gold], speed: 130, life: 0.5, size: 3 })
  }

  /** The hearts row above the ring: glossy hearts, the next one regrowing, pops and cracks. */
  private hearts(ctx: CanvasRenderingContext2D, w: number, h: number, s: DriftState) {
    const p = s.player
    const shake = this.reduced ? 0 : 1 - progress(this.time, this.rowShakeAt, SHAKE_TIME)
    const dx = shake > 0 ? Math.sin(this.time * 70) * 5 * shake : 0
    const regen = s.diedAt === null ? regenProgress(s) : 0
    for (let i = 0; i < MAX_HEARTS; i++) {
      const [sx, y] = heartSlot(w, h, i)
      const x = sx + dx
      const fx = this.slotFx[i]
      if (i < p.hearts) {
        let scale = HEART_SCALE
        // Last heart: a heartbeat (kept in reduced motion: it's the warning).
        if (p.hearts === 1 && i === 0) scale *= 1 + 0.15 * Math.max(0, Math.sin(this.time * 7))
        if (fx?.kind === 'gain') {
          const t = (this.time - fx.at) / GAIN_TIME
          if (t < 0) {
            this.heart(ctx, x, y, 'empty', HEART_SCALE)
            continue
          }
          if (t < 1) {
            if (!this.reduced) scale *= ease.outBack(t)
            this.gainRing(ctx, x, y, t)
          }
        }
        this.heart(ctx, x, y, 'full', scale)
        continue
      }
      this.heart(ctx, x, y, 'empty', HEART_SCALE)
      if (i === p.hearts && regen > 0) this.regrowing(ctx, x, y, regen)
      if (fx?.kind === 'lose') this.cracking(ctx, x, y, progress(this.time, fx.at, LOSE_TIME))
    }
  }

  /** The next heart filling bottom-up as it regrows. */
  private regrowing(ctx: CanvasRenderingContext2D, x: number, y: number, amount: number) {
    const top = y + (HEART_BOTTOM - (HEART_BOTTOM - HEART_TOP) * amount) * HEART_SCALE
    ctx.save()
    ctx.beginPath()
    ctx.rect(x - 20, top, 40, y + HEART_BOTTOM * HEART_SCALE - top + 2)
    ctx.clip()
    // Almost there: it starts to glow.
    const ready = amount > 0.85 && !this.reduced ? 0.2 * (0.5 + 0.5 * Math.sin(this.time * 10)) : 0
    this.heart(ctx, x, y, 'full', HEART_SCALE, 0.7 + ready)
    // A bright waterline at the fill level, inside the heart.
    ctx.translate(x, y)
    ctx.scale(HEART_SCALE, HEART_SCALE)
    traceHeart(ctx)
    ctx.clip()
    ctx.fillStyle = 'rgb(255 230 236 / 0.9)'
    ctx.fillRect(-15, (top - y) / HEART_SCALE, 30, 1.4)
    ctx.restore()
  }

  /** A lost heart splits in two and falls away (just fades in reduced motion). */
  private cracking(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    if (t >= 1) return
    if (this.reduced) {
      this.heart(ctx, x, y, 'full', HEART_SCALE, 1 - t)
      return
    }
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.translate(x + side * t * 10, y + t * t * 18)
      ctx.rotate(side * t * 0.7)
      ctx.beginPath()
      ctx.rect(side < 0 ? -20 : 0, -20, 20, 40)
      ctx.clip()
      this.heart(ctx, 0, 0, 'full', HEART_SCALE, 1 - t)
      ctx.restore()
    }
    if (t < 0.35) {
      // The crack: a bright zigzag down the middle.
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(HEART_SCALE, HEART_SCALE)
      ctx.globalAlpha = 1 - t / 0.35
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.6
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(0, -6)
      ctx.lineTo(-2, -1)
      ctx.lineTo(2, 3)
      ctx.lineTo(0, 9)
      ctx.stroke()
      ctx.restore()
    }
  }

  /** A ring of light and sparkles as a heart pops in. */
  private gainRing(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    ctx.save()
    ctx.globalAlpha = 1 - t
    ctx.strokeStyle = '#ffd0da'
    ctx.lineWidth = 3 * (1 - t) + 1
    ctx.beginPath()
    ctx.arc(x, y, 10 + t * 18, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  /** Picked-up hearts arcing from the track into their slot. */
  private drawFlights(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.flights.length) return
    const slot = clamp(this.heartsShown - 1, 0, MAX_HEARTS - 1)
    const [tx, ty] = heartSlot(w, h, slot)
    const landed = this.flights.filter((f) => this.time - f.at >= SPARK_TIME).length
    for (let i = 0; i < landed; i++) this.sparkle(tx, ty)
    this.flights = this.flights.filter((f) => this.time - f.at < SPARK_TIME)
    for (const f of this.flights) {
      const t = ease.inCubic(progress(this.time, f.at, SPARK_TIME))
      const x = lerp(f.x, tx, t)
      const y = lerp(f.y, ty, t) - Math.sin(t * Math.PI) * 90
      this.heart(ctx, x, y, 'full', HEART_SCALE * (1.6 - 0.6 * t))
    }
  }

  /** A glossy heart (gradient, dark edge, shine) or an empty slot (dim outline). */
  private heart(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    look: 'full' | 'empty',
    scale = 1,
    alpha = 1,
  ) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(scale, scale)
    ctx.globalAlpha *= alpha
    traceHeart(ctx)
    ctx.lineJoin = 'round'
    if (look === 'empty') {
      ctx.fillStyle = 'rgb(10 6 30 / 0.45)'
      ctx.fill()
      ctx.lineWidth = 1.4
      ctx.strokeStyle = 'rgb(255 255 255 / 0.4)'
      ctx.stroke()
      ctx.restore()
      return
    }
    if (!this.gloss) {
      this.gloss = ctx.createLinearGradient(0, HEART_TOP, 0, HEART_BOTTOM)
      this.gloss.addColorStop(0, '#ffa3b5')
      this.gloss.addColorStop(0.45, C.heart)
      this.gloss.addColorStop(1, '#c8173f')
    }
    ctx.shadowColor = 'rgb(0 0 0 / 0.45)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 2
    ctx.fillStyle = this.gloss
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#6e0a26'
    ctx.stroke()
    // Shine on the left lobe.
    ctx.fillStyle = 'rgb(255 255 255 / 0.75)'
    ctx.beginPath()
    ctx.ellipse(-4.6, -4.4, 2.6, 1.5, -0.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}
