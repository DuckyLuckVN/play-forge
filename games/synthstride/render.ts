// Synthstride renderer (canvas 2D). The board breathes with the beat; warned
// tiles fill up and tick down with the music; a beat timeline under the board
// shows what lands on the next beats, so the rhythm itself is the warning.

import { Particles } from '@forge/fx/particles'
import { Shake } from '@forge/fx/shake'
import { clamp01, ease, lerp, prefersReducedMotion, progress } from '@forge/fx/tween'
import type { Smoothed } from '@forge/net/smoothing'
import { createCanvas2D } from '@forge/render2d/canvas'
import { ReflexHud, type Banner } from '@forge/reflex/hud2d'
import { C } from './palette'
import {
  colOf,
  DEATH_TICKS,
  DROP_BEATS,
  DROP_COST,
  dropActive,
  MAX_HEARTS,
  MAX_TIER,
  mult,
  N,
  rowOf,
  TICK_RATE,
  type Rating,
  type StrideEvent,
  type StrideState,
} from './sim'
import { timeText } from './stats'

export const WIDTH = 420
export const HEIGHT = 720
const CELL = 80
const GAP = 6
const BOARD = N * CELL + (N - 1) * GAP
const BX = (WIDTH - BOARD) / 2
const BY = 150
const TIMELINE_Y = BY + BOARD + 52
/** Pixels per beat on the timeline. */
const BEAT_PX = 62
const HOP_TICKS = 7

const tileX = (t: number) => BX + colOf(t) * (CELL + GAP) + CELL / 2
const tileY = (t: number) => BY + rowOf(t) * (CELL + GAP) + CELL / 2

export interface StrideLabels {
  tap: string
  rating: Record<Rating, string>
}

export interface StrideView {
  onState(s: StrideState): void
  frame(dt: number): void
  banner(b: Banner): void
  surface: HTMLElement
  point(clientX: number, clientY: number): { x: number; y: number }
  destroy(): void
}

export class StrideRenderer {
  private fx = new Particles()
  private shake = new Shake(12)
  private hud: ReflexHud
  private time = 0
  private hop = { from: -1, to: -1, at: -Infinity }
  private hitAt = -10
  private dropAt = -10
  private burst = false
  private blasts: { tiles: number[]; at: number }[] = []
  private reduced = prefersReducedMotion()

  constructor(
    private ctx: CanvasRenderingContext2D,
    private smooth: Smoothed<StrideState>,
    private labels: StrideLabels,
  ) {
    this.hud = new ReflexHud({ keyLabel: 'SPACE', touchLabel: labels.tap })
  }

  banner(b: Banner) {
    this.hud.banner(b)
  }

  onState(s: StrideState): void {
    for (const e of s.events) this.onEvent(e, s)
  }

  private onEvent(e: StrideEvent, s: StrideState) {
    switch (e.type) {
      case 'move': {
        this.hop = { from: e.from, to: e.to, at: s.tick }
        if (e.rating) {
          const color = e.rating === 'perfect' ? C.perfect : e.rating === 'good' ? C.good : C.off
          const x = tileX(e.to)
          const y = tileY(e.to)
          this.hud.text(x, y - 44, this.labels.rating[e.rating], color, e.rating === 'perfect' ? 18 : 15)
          if (e.rating !== 'off')
            this.fx.burst(x, y, {
              count: e.rating === 'perfect' ? 10 : 5,
              color: [color, '#fff'],
              speed: 90,
              life: 0.35,
              size: 3,
            })
        }
        break
      }
      case 'strike': {
        const st = s.strikes.find((k) => k.id === e.id)
        if (!st) break
        this.blasts.push({ tiles: st.tiles, at: this.time })
        for (const t of st.tiles)
          this.fx.burst(tileX(t), tileY(t), {
            count: 6,
            color: [C.strike, '#ffd0e0'],
            speed: 140,
            life: 0.4,
            size: 4,
          })
        this.shake.add(st.tiles.length >= N ? 0.18 : 0.08)
        break
      }
      case 'hit':
        this.hitAt = this.time
        this.hud.hit()
        this.shake.add(0.55)
        this.fx.burst(tileX(s.pos), tileY(s.pos), {
          count: 30,
          color: [C.strike, '#fff'],
          speed: 240,
          life: 0.6,
          size: 5,
        })
        break
      case 'dodge':
        this.hud.text(tileX(s.pos), tileY(s.pos) - 26, `+${e.points}`, C.good, 16)
        break
      case 'note':
        this.fx.burst(tileX(e.tile), tileY(e.tile), {
          count: 20,
          color: [C.note, '#fff'],
          speed: 170,
          life: 0.5,
          size: 4,
        })
        this.hud.text(tileX(e.tile), tileY(e.tile) - 30, `+${e.points}`, C.note, 20)
        break
      case 'drop':
        this.dropAt = this.time
        this.shake.add(0.4)
        this.fx.burst(WIDTH / 2, BY + BOARD / 2, {
          count: 70,
          color: [C.drop, '#fff', C.note],
          speed: 360,
          life: 0.8,
          size: 5,
        })
        break
      case 'multiplier':
        this.hud.multiplier()
        break
      case 'heal':
        this.hud.heal()
        break
      case 'tier':
        this.hud.popRight()
        break
      case 'die':
        this.hud.clearBanners()
        this.shake.add(0.7)
        break
    }
  }

  frame(dt: number): void {
    const curr = this.smooth.curr
    if (!curr) return
    const prev = this.smooth.prev && this.smooth.prev.tick === curr.tick - 1 ? this.smooth.prev : null
    const alpha = prev ? this.smooth.alpha() : 1
    this.time += dt
    this.fx.update(dt)
    this.shake.update(dt)
    const ctx = this.ctx
    const tick = curr.tick + alpha
    // Smooth beat position: beats so far plus progress to the next.
    const beatPos = curr.beat + Math.min(0.999, curr.phase + (alpha * curr.bpm) / (60 * TICK_RATE))
    const frac = beatPos - Math.floor(beatPos)
    const pulse = this.reduced ? 0 : ease.outCubic(1 - frac) ** 2
    const deathT = curr.diedAt !== null ? progress(tick, curr.diedAt, DEATH_TICKS) : 0

    ctx.save()
    this.shake.apply(ctx)
    this.background(curr, pulse, beatPos, deathT)
    this.board(curr, pulse, beatPos, deathT)
    this.drawNotes(curr, beatPos, deathT)
    this.drawBlasts()
    this.player(curr, tick, pulse, deathT)
    this.timeline(curr, beatPos, deathT)
    this.fx.draw(ctx)
    ctx.restore()

    const df = progress(this.time, this.dropAt, 0.5)
    if (df < 1) {
      ctx.fillStyle = `rgb(200 170 255 / ${0.35 * (1 - df)})`
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
    }
    if (deathT > 0) {
      ctx.fillStyle = `rgb(4 2 12 / ${ease.inCubic(deathT) * 0.55})`
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
    }
    this.hud.draw(ctx, WIDTH, HEIGHT, this.hudFrame(curr), dt)
  }

  private hudFrame(s: StrideState) {
    const drop = dropActive(s)
    return {
      hearts: s.vitals.hearts,
      maxHearts: MAX_HEARTS,
      score: s.score,
      scoreLabel: timeText(s.diedAt ?? s.tick),
      right: {
        value: String(s.bpm),
        label: 'BPM',
        color: `hsl(${lerp(185, 320, s.tier / MAX_TIER)} 100% 80%)`,
      },
      mult: mult(s),
      skill: {
        fill: s.charge / DROP_COST,
        active: drop ? (s.dropUntil - s.beat) / DROP_BEATS : 0,
        color: C.note,
        readyColor: C.drop,
        icon: (ctx: CanvasRenderingContext2D) => this.noteGlyph(ctx, 0, 0, 1, '#fff'),
      },
    }
  }

  private background(s: StrideState, pulse: number, beatPos: number, deathT: number) {
    const ctx = this.ctx
    const hue = lerp(262, 300, s.tier / MAX_TIER) + (dropActive(s) ? Math.sin(this.time * 3) * 30 : 0)
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT)
    g.addColorStop(0, `hsl(${hue} 60% ${8 + pulse * 3}%)`)
    g.addColorStop(0.55, `hsl(${hue + 20} 55% ${12 + pulse * 4}%)`)
    g.addColorStop(1, C.bg)
    ctx.fillStyle = g
    ctx.fillRect(-20, -20, WIDTH + 40, HEIGHT + 40)

    // A ring rolls out from the board on every beat.
    const cx = WIDTH / 2
    const cy = BY + BOARD / 2
    const frac = beatPos - Math.floor(beatPos)
    ctx.lineWidth = 2
    for (let i = 0; i < 3; i++) {
      const f = frac + i
      ctx.strokeStyle = `hsl(${hue + 60} 100% 70% / ${0.22 * (1 - f / 3) * (1 - deathT)})`
      ctx.beginPath()
      ctx.arc(cx, cy, BOARD * 0.72 + f * 70, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Equaliser bars down both sides, jumping on the beat.
    const beat = Math.floor(beatPos)
    const barW = 6
    for (let i = 0; i < 14; i++) {
      const seed = Math.sin(beat * 12.9898 + i * 78.233) * 43758.5453
      const level = (seed - Math.floor(seed)) * 0.7 + 0.3
      const h = (8 + level * 36) * (0.35 + pulse * 0.65) * (1 - deathT)
      const y = BY + 8 + i * ((BOARD - 16) / 13)
      ctx.fillStyle = `hsl(${hue + 40 + i * 6} 100% 65% / 0.55)`
      ctx.fillRect(BX - 14 - h, y - barW / 2, h, barW)
      ctx.fillRect(BX + BOARD + 14, y - barW / 2, h, barW)
    }
  }

  private board(s: StrideState, pulse: number, beatPos: number, deathT: number) {
    const ctx = this.ctx
    const drop = dropActive(s)
    // Board plate.
    ctx.fillStyle = `rgb(10 6 30 / 0.7)`
    ctx.beginPath()
    ctx.roundRect(BX - 10, BY - 10, BOARD + 20, BOARD + 20, 18)
    ctx.fill()
    ctx.strokeStyle = `rgb(95 243 255 / ${(0.25 + pulse * 0.35) * (1 - deathT)})`
    ctx.lineWidth = 2
    ctx.stroke()

    // Danger per tile: the strongest pending warning covering it.
    const warn = new Map<number, { p: number; left: number }>()
    for (const st of s.strikes) {
      if (st.firedAt !== undefined) continue
      const lead = st.beat - st.warnBeat
      const left = st.beat - beatPos
      const p = clamp01(1 - left / lead)
      for (const t of st.tiles) {
        const w = warn.get(t)
        if (!w || p > w.p) warn.set(t, { p, left })
      }
    }

    for (let t = 0; t < N * N; t++) {
      const x = tileX(t) - CELL / 2
      const y = tileY(t) - CELL / 2
      const w = warn.get(t)
      const hue = drop ? (this.time * 120 + t * 22) % 360 : 250
      const lift = pulse * 0.08
      ctx.fillStyle = drop ? `hsl(${hue} 70% ${16 + lift * 60}%)` : `hsl(${hue} 50% ${14 + lift * 50}%)`
      ctx.beginPath()
      ctx.roundRect(x, y, CELL, CELL, 12)
      ctx.fill()
      ctx.strokeStyle = drop ? `hsl(${hue} 100% 70% / 0.6)` : `rgb(95 243 255 / ${0.16 + pulse * 0.22})`
      ctx.lineWidth = 1.5
      ctx.stroke()
      if (!w || deathT > 0) continue
      // Warning: fills in, flashing on each beat, with one pip per beat left.
      const flash = 0.5 + 0.5 * pulse
      ctx.fillStyle = `rgb(255 61 142 / ${0.12 + w.p * 0.5 * flash})`
      ctx.beginPath()
      ctx.roundRect(x, y, CELL, CELL, 12)
      ctx.fill()
      ctx.strokeStyle = `rgb(255 120 170 / ${0.5 + w.p * 0.5})`
      ctx.lineWidth = 2 + w.p * 2
      ctx.stroke()
      // Inner square closing in: lands exactly on the beat.
      const inset = (CELL / 2 - 6) * clamp01(w.left / 2)
      ctx.strokeStyle = `rgb(255 220 235 / ${0.35 + w.p * 0.4})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(x + inset + 4, y + inset + 4, CELL - inset * 2 - 8, CELL - inset * 2 - 8, 8)
      ctx.stroke()
      const pips = Math.max(1, Math.ceil(w.left))
      ctx.fillStyle = '#ffd0e0'
      for (let i = 0; i < pips; i++) {
        ctx.beginPath()
        ctx.arc(x + 12 + i * 10, y + 12, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  private drawBlasts() {
    const ctx = this.ctx
    this.blasts = this.blasts.filter((b) => this.time - b.at < 0.45)
    for (const b of this.blasts) {
      const t = (this.time - b.at) / 0.45
      const a = 1 - ease.outCubic(t)
      for (const tile of b.tiles) {
        const x = tileX(tile) - CELL / 2
        const y = tileY(tile) - CELL / 2
        const grow = 1 + t * 0.15
        ctx.save()
        ctx.translate(x + CELL / 2, y + CELL / 2)
        ctx.scale(grow, grow)
        ctx.fillStyle = `rgb(255 ${Math.round(lerp(255, 47, t))} ${Math.round(lerp(255, 110, t))} / ${a * 0.85})`
        ctx.shadowColor = C.strike
        ctx.shadowBlur = 24 * a
        ctx.beginPath()
        ctx.roundRect(-CELL / 2, -CELL / 2, CELL, CELL, 12)
        ctx.fill()
        ctx.restore()
      }
      // Lasers sweep every fully covered row and column.
      ctx.strokeStyle = `rgb(255 230 240 / ${a})`
      ctx.lineWidth = 10 * a + 2
      ctx.lineCap = 'round'
      for (let i = 0; i < N; i++) {
        const lineAt = i * (CELL + GAP) + CELL / 2
        if (b.tiles.filter((t) => rowOf(t) === i).length === N) {
          ctx.beginPath()
          ctx.moveTo(BX - 20, BY + lineAt)
          ctx.lineTo(BX + BOARD + 20, BY + lineAt)
          ctx.stroke()
        }
        if (b.tiles.filter((t) => colOf(t) === i).length === N) {
          ctx.beginPath()
          ctx.moveTo(BX + lineAt, BY - 20)
          ctx.lineTo(BX + lineAt, BY + BOARD + 20)
          ctx.stroke()
        }
      }
    }
  }

  private drawNotes(s: StrideState, beatPos: number, deathT: number) {
    if (deathT > 0) return
    const ctx = this.ctx
    for (const n of s.notes) {
      const left = n.until - beatPos
      // Blink when about to vanish.
      if (left < 2 && Math.floor(this.time * 10) % 2 === 0) continue
      const x = tileX(n.tile)
      const y = tileY(n.tile) + Math.sin(this.time * 4 + n.id) * 3
      ctx.save()
      ctx.shadowColor = C.note
      ctx.shadowBlur = 16
      ctx.fillStyle = 'rgb(255 216 77 / 0.18)'
      ctx.beginPath()
      ctx.arc(x, y, 22, 0, Math.PI * 2)
      ctx.fill()
      this.noteGlyph(ctx, x, y, 1.5, C.note)
      ctx.restore()
    }
  }

  /** A beamed pair of eighth notes, ~20 units across at scale 1. */
  private noteGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s, s)
    ctx.fillStyle = color
    ctx.strokeStyle = color
    ctx.lineWidth = 2.2
    for (const hx of [-5, 6]) {
      ctx.beginPath()
      ctx.ellipse(hx - 2, 6, 3.6, 2.8, -0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(hx + 1.2, 6)
      ctx.lineTo(hx + 1.2, -8)
      ctx.stroke()
    }
    ctx.lineWidth = 3.4
    ctx.beginPath()
    ctx.moveTo(-3.8, -8)
    ctx.lineTo(7.2, -8)
    ctx.stroke()
    ctx.restore()
  }

  private player(s: StrideState, tick: number, pulse: number, deathT: number) {
    const ctx = this.ctx
    const t = clamp01((tick - this.hop.at) / HOP_TICKS)
    const moving = this.hop.to === s.pos && t < 1
    const from = moving ? this.hop.from : s.pos
    const k = ease.outCubic(t)
    const x = lerp(tileX(from), tileX(s.pos), moving ? k : 1)
    const y = lerp(tileY(from), tileY(s.pos), moving ? k : 1) - (moving ? Math.sin(t * Math.PI) * 14 : 0)

    if (deathT > 0) {
      if (deathT < 0.2) {
        const sw = 1 + ease.inCubic(deathT / 0.2) * 0.6
        this.gem(x, y, sw, C.strike, 1)
      } else if (!this.burst) {
        this.burst = true
        this.fx.burst(x, y, {
          count: 80,
          color: [C.player, C.playerGlow, C.strike, '#fff'],
          speed: 360,
          life: 1.1,
          size: 6,
        })
        this.fx.burst(x, y, {
          count: 24,
          color: [C.playerGlow],
          speed: 110,
          life: 1.4,
          size: 8,
          shape: 'square',
        })
        this.shake.add(0.8)
      }
      return
    }
    // Shadow on the tile.
    ctx.fillStyle = 'rgb(0 0 0 / 0.35)'
    ctx.beginPath()
    ctx.ellipse(x, tileY(moving ? s.pos : from) + 22, 18, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    const hurt = progress(this.time, this.hitAt, 0.4) < 1
    const invuln = s.tick < s.vitals.invulnUntil && Math.floor(this.time * 16) % 2 === 0
    const drop = dropActive(s)
    // Squash on landing, bounce with the beat.
    const squash = moving ? 1 : 1 + pulse * 0.12
    this.gem(x, y, squash, hurt ? C.strike : drop ? C.drop : C.playerGlow, invuln ? 0.4 : 1)
    if (drop && !this.reduced && Math.random() < 0.5)
      this.fx.burst(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, {
        count: 1,
        color: [C.drop, C.note],
        speed: 40,
        life: 0.5,
      })
  }

  private gem(x: number, y: number, scale: number, glow: string, alpha: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(x, y)
    ctx.scale(1 / Math.sqrt(scale), scale)
    ctx.shadowColor = glow
    ctx.shadowBlur = 22
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.moveTo(0, -24)
    ctx.lineTo(18, 0)
    ctx.lineTo(0, 24)
    ctx.lineTo(-18, 0)
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = C.player
    ctx.beginPath()
    ctx.moveTo(0, -15)
    ctx.lineTo(10, 0)
    ctx.lineTo(0, 15)
    ctx.lineTo(-10, 0)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgb(255 255 255 / 0.9)'
    ctx.beginPath()
    ctx.moveTo(0, -15)
    ctx.lineTo(10, 0)
    ctx.lineTo(0, 0)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  /** Beat timeline: beats scroll in to the marker; struck beats carry a pink diamond. */
  private timeline(s: StrideState, beatPos: number, deathT: number) {
    const ctx = this.ctx
    const cx = WIDTH / 2
    const y = TIMELINE_Y
    ctx.save()
    ctx.globalAlpha = 1 - deathT
    const g = ctx.createLinearGradient(0, 0, WIDTH, 0)
    g.addColorStop(0, 'rgb(255 255 255 / 0)')
    g.addColorStop(0.5, 'rgb(255 255 255 / 0.25)')
    g.addColorStop(1, 'rgb(255 255 255 / 0)')
    ctx.strokeStyle = g
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(20, y)
    ctx.lineTo(WIDTH - 20, y)
    ctx.stroke()
    const struck = new Set(s.strikes.filter((k) => k.firedAt === undefined).map((k) => k.beat))
    const first = Math.ceil(beatPos - 0.3)
    for (let b = first; b < beatPos + 3.3; b++) {
      const d = b - beatPos
      // Beats come in from both sides and meet at the marker.
      for (const side of [-1, 1]) {
        const x = cx + side * d * BEAT_PX
        const fade = clamp01(1 - Math.abs(d) / 3.3)
        if (struck.has(b)) {
          ctx.fillStyle = `rgb(255 61 142 / ${fade})`
          ctx.beginPath()
          ctx.moveTo(x, y - 9)
          ctx.lineTo(x + 7, y)
          ctx.lineTo(x, y + 9)
          ctx.lineTo(x - 7, y)
          ctx.closePath()
          ctx.fill()
        } else {
          ctx.fillStyle = `rgb(200 230 255 / ${fade * 0.8})`
          ctx.fillRect(x - 1.5, y - 7, 3, 14)
        }
      }
    }
    // The marker: a ring that pops on each beat.
    const frac = beatPos - Math.floor(beatPos)
    const pop = 1 - ease.outCubic(Math.min(1, frac * 3))
    ctx.strokeStyle = `rgb(255 255 255 / ${0.5 + pop * 0.5})`
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(cx, y, 11 + pop * 5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

/** Canvas + renderer as a {@link StrideView}. */
export function createView(
  stage: HTMLElement,
  smooth: Smoothed<StrideState>,
  labels: StrideLabels,
): StrideView {
  const view = createCanvas2D(stage, WIDTH, HEIGHT, { maxDpr: 2 })
  const renderer = new StrideRenderer(view.ctx, smooth, labels)
  return {
    surface: view.canvas,
    banner: (b) => renderer.banner(b),
    onState: (s) => renderer.onState(s),
    frame: (dt) => renderer.frame(dt),
    point(clientX, clientY) {
      const r = view.canvas.getBoundingClientRect()
      return { x: ((clientX - r.left) / r.width) * WIDTH, y: ((clientY - r.top) / r.height) * HEIGHT }
    },
    destroy: () => view.destroy(),
  }
}
