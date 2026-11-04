// Synthstride renderer (canvas 2D). The board breathes with the beat; warned
// tiles fill up and tick down with the music; a beat timeline under the board
// shows what lands on the next beats, so the rhythm itself is the warning.
// Build-ups brighten the floor, drops turn it hot, Overdrive makes it rainbow.
//
// Multiplayer: the view follows one "focus" dancer (you; on own boards, the
// leader once you are out). Everyone on that board is drawn in their seat
// colour; your own moves animate the moment you press (local prediction),
// others' from the host's events. Other boards show as minis up top.

import { Particles } from '@forge/fx/particles'
import { Shake } from '@forge/fx/shake'
import { clamp01, ease, lerp, prefersReducedMotion, progress } from '@forge/fx/tween'
import type { Smoothed } from '@forge/net/smoothing'
import { createCanvas2D } from '@forge/render2d/canvas'
import { ReflexHud, type Banner } from '@forge/reflex/hud2d'
import { FONT } from '@forge/ui/theme'
import { colOf, rowOf } from './grid'
import { isNext } from './notes'
import { isOffBeat } from './patterns'
import { C } from './palette'
import {
  alive,
  dancerOf,
  DEATH_TICKS,
  grooveMult,
  MAX_HEARTS,
  MAX_TIER,
  mult,
  openHoles,
  OVERDRIVE_BEATS,
  OVERDRIVE_COST,
  overdriveActive,
  ranking,
  TICK_RATE,
  type Board,
  type Dancer,
  type Rating,
  type StrideEvent,
  type StrideState,
  type Strike,
} from './sim'
import { sectionAt, sectionProgress } from './song'
import { timeText } from './stats'

export const WIDTH = 420
export const HEIGHT = 720
const GAP = 6
const BOARD = 338
const BX = (WIDTH - BOARD) / 2
const BY = 150
const TIMELINE_Y = BY + BOARD + 52
/** Pixels per beat on the timeline. */
const BEAT_PX = 62
const TRAIL_TIME = 0.35

const cellOf = (n: number) => (BOARD - (n - 1) * GAP) / n
const tileX = (t: number, n: number) => BX + colOf(t, n) * (cellOf(n) + GAP) + cellOf(n) / 2
const tileY = (t: number, n: number) => BY + rowOf(t, n) * (cellOf(n) + GAP) + cellOf(n) / 2

/** The tile under a point (game units), or null off the board. */
export function tileAtPoint(x: number, y: number, n: number): number | null {
  const step = cellOf(n) + GAP
  const c = Math.floor((x - BX + GAP / 2) / step)
  const r = Math.floor((y - BY + GAP / 2) / step)
  return c >= 0 && c < n && r >= 0 && r < n ? r * n + c : null
}

/** Groove level colours: ×1 cyan, ×2 green, ×3 gold, ×4 pink. */
const GROOVE_COLORS = ['#5ff3ff', '#7dffb0', '#ffd84d', '#ff6ad5']

/**
 * A warned tile's stage, stepping once per beat: `p` 0..1 (1 = last beat),
 * `left` beats (stages) until it lands, `kick` pops on each beat.
 */
interface WarnStep {
  left: number
  p: number
  kick: number
  st: Strike
}

export interface StrideLabels {
  tap: string
  rating: Record<Rating, string>
  /** Small tag on a dancer who is out (mini boards). */
  out: string
}

/** Who is watching, and how to name and colour the others. */
export interface StrideViewOptions {
  selfId: string
  nameOf(id: string): string
  colorOf(slot: number): string
  /** Your predicted tile (moves not yet confirmed by the host), or null. */
  predictedPos(): number | null
}

export interface StrideView {
  onState(s: StrideState): void
  frame(dt: number): void
  banner(b: Banner): void
  /** Your own move, shown the moment you press (before the host confirms it). */
  localMove(from: number, to: number, rating: Rating | null): void
  surface: HTMLElement
  point(clientX: number, clientY: number): { x: number; y: number }
  destroy(): void
}

const HOP_TIME = 7 / 60
const MINI = 52

export class StrideRenderer {
  private fx = new Particles()
  private shake = new Shake(12)
  private hud: ReflexHud
  private time = 0
  /** Hop animation per dancer (render time). */
  private hops = new Map<string, { from: number; to: number; at: number }>()
  private hitAt = -10
  private overdriveAt = -10
  private popAt = -10
  private growAt = -10
  /** Dancers whose death burst has played. */
  private burst = new Set<string>()
  private blasts: { tiles: number[]; at: number; n: number }[] = []
  private bumps: { tile: number; at: number }[] = []
  /** Tiles you stepped on light up for a moment. */
  private lit = new Map<number, number>()
  private trail: { x: number; y: number; at: number }[] = []
  private reduced = prefersReducedMotion()

  constructor(
    private ctx: CanvasRenderingContext2D,
    private smooth: Smoothed<StrideState>,
    private labels: StrideLabels,
    private view: StrideViewOptions,
  ) {
    this.hud = new ReflexHud({ keyLabel: 'SPACE', touchLabel: labels.tap })
  }

  /** Whom the camera follows: you, or (out, on own boards) the leader still dancing. */
  private focusOf(s: StrideState): Dancer {
    const self = dancerOf(s, this.view.selfId)
    // Stay on yourself while your death plays out, then (own boards) follow the leader.
    if (self && (alive(self) || s.mode === 'shared' || s.tick - self.diedAt! < DEATH_TICKS)) return self
    return ranking(s).find(alive) ?? self ?? s.dancers[0]
  }

  /** Your own move, shown at once (the host confirms it a moment later). */
  localMove(from: number, to: number, rating: Rating | null) {
    const s = this.smooth.curr
    if (!s) return
    const self = dancerOf(s, this.view.selfId)
    if (!self) return
    const n = s.boards[self.board].n
    this.hops.set(self.id, { from, to, at: this.time })
    this.lit.set(to, this.time)
    if (!rating) return
    const color = rating === 'perfect' ? C.perfect : rating === 'good' ? C.good : C.off
    const x = tileX(to, n)
    const y = tileY(to, n)
    this.hud.text(x, y - 44, this.labels.rating[rating], color, rating === 'perfect' ? 18 : 15)
    if (rating === 'perfect') {
      this.popAt = this.time
      this.fx.burst(x, y, { count: 14, color: [color, '#fff'], speed: 130, life: 0.35, size: 3 })
    } else if (rating === 'good')
      this.fx.burst(x, y, { count: 5, color: [color, '#fff'], speed: 90, life: 0.35, size: 3 })
  }

  banner(b: Banner) {
    this.hud.banner(b)
  }

  onState(s: StrideState): void {
    for (const e of s.events) this.onEvent(e, s)
  }

  private onEvent(e: StrideEvent, s: StrideState) {
    const focus = this.focusOf(s)
    const b = s.boards[focus.board]
    const n = b.n
    const mine = 'p' in e && e.p === focus.id
    const here = (id: string) => dancerOf(s, id)?.board === b.id
    switch (e.type) {
      case 'move':
        // Yours were already shown when you pressed; others hop when the host says so.
        if (e.p !== this.view.selfId && here(e.p))
          this.hops.set(e.p, { from: e.from, to: e.to, at: this.time })
        if (mine && e.p !== this.view.selfId) this.lit.set(e.to, this.time)
        break
      case 'strike': {
        if (e.b !== b.id) break
        const st = b.strikes.find((k) => k.id === e.id)
        if (!st) break
        this.blasts.push({ tiles: st.tiles, at: this.time, n })
        const color = st.kind === 'hole' ? '#9a7cff' : isOffBeat(st) ? C.offbeat : C.strike
        for (const t of st.tiles)
          this.fx.burst(tileX(t, n), tileY(t, n), {
            count: 6,
            color: [color, '#ffd0e0'],
            speed: 140,
            life: 0.4,
            size: 4,
          })
        this.shake.add(st.tiles.length >= n ? 0.18 : 0.08)
        break
      }
      case 'bump':
        if (!mine) break
        this.bumps.push({ tile: e.tile, at: this.time })
        this.shake.add(0.1)
        break
      case 'hit': {
        const d = dancerOf(s, e.p)
        if (!d || d.board !== b.id) break
        if (mine) {
          this.hitAt = this.time
          this.hud.hit()
          this.shake.add(0.55)
        }
        this.fx.burst(tileX(d.pos, n), tileY(d.pos, n), {
          count: mine ? 30 : 14,
          color: [C.strike, '#fff'],
          speed: mine ? 240 : 160,
          life: 0.6,
          size: mine ? 5 : 4,
        })
        break
      }
      case 'dodge':
        if (mine) this.hud.text(tileX(focus.pos, n), tileY(focus.pos, n) - 26, `+${e.points}`, C.good, 16)
        break
      case 'note': {
        if (e.b !== b.id) break
        const x = tileX(e.tile, n)
        const y = tileY(e.tile, n)
        this.fx.burst(x, y, {
          count: 16 + e.index * 4,
          color: [mine ? C.note : this.view.colorOf(dancerOf(s, e.p)?.slot ?? 0), '#fff'],
          speed: 150 + e.index * 25,
          life: 0.5,
          size: 4,
        })
        if (mine) this.hud.text(x, y - 30, `+${e.points}`, C.note, 18 + e.index * 2)
        break
      }
      case 'chain': {
        if (!mine) break
        const x = tileX(focus.pos, n)
        const y = tileY(focus.pos, n)
        this.fx.burst(x, y, { count: 40, color: [C.note, '#fff', C.perfect], speed: 300, life: 0.8, size: 5 })
        this.hud.text(x, y - 60, `+${e.points}`, '#fff', 26)
        this.shake.add(0.2)
        break
      }
      case 'overdrive':
        if (!mine) break
        this.overdriveAt = this.time
        this.shake.add(0.4)
        this.fx.burst(WIDTH / 2, BY + BOARD / 2, {
          count: 70,
          color: [C.drop, '#fff', C.note],
          speed: 360,
          life: 0.8,
          size: 5,
        })
        break
      case 'section':
        if (e.section === 'drop') {
          this.shake.add(0.45)
          this.fx.burst(WIDTH / 2, BY + BOARD / 2, {
            count: 60,
            color: [C.warn, '#fff', C.note],
            speed: 420,
            life: 0.9,
            size: 5,
          })
        }
        break
      case 'beat':
        // Confetti on the drop's beats.
        if (s.section === 'drop' && !this.reduced)
          for (const side of [BX - 20, BX + BOARD + 20])
            this.fx.burst(side, BY + BOARD / 2, {
              count: 4,
              color: [C.warn, C.note, C.edge],
              speed: 160,
              life: 0.6,
              size: 3,
              gravity: 200,
            })
        break
      case 'grow':
        if (e.b !== b.id) break
        this.growAt = this.time
        this.hops.clear()
        this.lit.clear()
        this.trail = []
        this.shake.add(0.3)
        break
      case 'multiplier':
        if (mine) this.hud.multiplier()
        break
      case 'heal':
        if (mine) this.hud.heal()
        break
      case 'tier':
        this.hud.popRight()
        break
      case 'die':
        if (e.p === this.view.selfId) {
          this.hud.clearBanners()
          this.shake.add(0.7)
        }
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
    const focus = this.focusOf(curr)
    const b = curr.boards[focus.board]
    // Smooth beat position: beats so far plus progress to the next.
    const beatPos = curr.beat + Math.min(0.999, curr.phase + (alpha * curr.bpm) / (60 * TICK_RATE))
    const frac = beatPos - Math.floor(beatPos)
    const pulse = this.reduced ? 0 : ease.outCubic(1 - frac) ** 2
    // The screen dims as the match ends; if you're out while others dance on,
    // it dims for your death, then clears so you can watch.
    const self = dancerOf(curr, this.view.selfId)
    let deathT = 0
    if (curr.endAt !== null) deathT = progress(tick, curr.endAt - DEATH_TICKS + 1, DEATH_TICKS)
    else if (self && self.diedAt !== null) {
      const t = (tick - self.diedAt) / DEATH_TICKS
      deathT = t < 1 ? clamp01(t) : clamp01(1 - (t - 1) * 2)
    }
    const boardFade = deathT

    ctx.save()
    this.shake.apply(ctx)
    this.background(curr, focus, pulse, beatPos, boardFade)
    // The board pops in when it grows.
    const grow = progress(this.time, this.growAt, 0.6)
    if (grow < 1) {
      const k = 1 + 0.08 * (1 - ease.outBack(grow))
      ctx.translate(WIDTH / 2, BY + BOARD / 2)
      ctx.scale(k, k)
      ctx.translate(-WIDTH / 2, -(BY + BOARD / 2))
    }
    this.board(curr, b, focus, pulse, beatPos, boardFade)
    this.drawNotes(b, beatPos, boardFade)
    this.drawBlasts()
    this.drawBumps(b.n)
    this.dancers(curr, b, focus, tick, pulse)
    ctx.restore()
    ctx.save()
    this.shake.apply(ctx)
    this.timeline(b, beatPos, boardFade)
    if (curr.mode === 'race') this.minis(curr, focus, beatPos)
    this.fx.draw(ctx)
    ctx.restore()

    const df = progress(this.time, this.overdriveAt, 0.5)
    if (df < 1) {
      ctx.fillStyle = `rgb(200 170 255 / ${0.35 * (1 - df)})`
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
    }
    if (deathT > 0) {
      ctx.fillStyle = `rgb(4 2 12 / ${ease.inCubic(deathT) * 0.55})`
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
    }
    this.hud.draw(ctx, WIDTH, HEIGHT, this.hudFrame(curr, focus), dt)
  }

  private hudFrame(s: StrideState, d: Dancer) {
    const od = overdriveActive(s, d)
    return {
      hearts: d.vitals.hearts,
      maxHearts: MAX_HEARTS,
      score: d.score,
      scoreLabel: timeText(d.diedAt ?? s.tick),
      right: {
        value: String(s.bpm),
        label: 'BPM',
        color: `hsl(${lerp(185, 320, s.tier / MAX_TIER)} 100% 80%)`,
      },
      mult: mult(s, d),
      skill: {
        fill: d.charge / OVERDRIVE_COST,
        active: od ? (d.overdriveUntil - s.beat) / OVERDRIVE_BEATS : 0,
        color: C.note,
        readyColor: C.drop,
        icon: (ctx: CanvasRenderingContext2D) => this.noteGlyph(ctx, 0, 0, 1, '#fff'),
      },
    }
  }

  private background(s: StrideState, d: Dancer, pulse: number, beatPos: number, deathT: number) {
    const ctx = this.ctx
    const drop = s.section === 'drop'
    const build = s.section === 'build' ? sectionProgress(Math.floor(beatPos)) : 0
    const od = overdriveActive(s, d)
    const hue = lerp(262, 300, s.tier / MAX_TIER) + (drop ? 50 : 0) + (od ? Math.sin(this.time * 3) * 30 : 0)
    const light = (drop ? 4 : 0) + build * 5
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT)
    g.addColorStop(0, `hsl(${hue} 60% ${8 + light + pulse * (drop ? 6 : 3)}%)`)
    g.addColorStop(0.55, `hsl(${hue + 20} 55% ${12 + light + pulse * 4}%)`)
    g.addColorStop(1, C.bg)
    ctx.fillStyle = g
    ctx.fillRect(-20, -20, WIDTH + 40, HEIGHT + 40)

    // Rings roll out from the board on every beat: more of them with more groove.
    const groove = grooveMult(d)
    const cx = WIDTH / 2
    const cy = BY + BOARD / 2
    const frac = beatPos - Math.floor(beatPos)
    ctx.lineWidth = 2
    const rings = 2 + groove + (drop ? 2 : 0)
    for (let i = 0; i < rings; i++) {
      const f = frac + i
      ctx.strokeStyle = `hsl(${hue + 60} 100% 70% / ${0.22 * (1 - f / rings) * (1 - deathT)})`
      ctx.beginPath()
      ctx.arc(cx, cy, BOARD * 0.72 + f * 60, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Equaliser bars down both sides, jumping on the beat, taller with groove.
    const beat = Math.floor(beatPos)
    const barW = 6
    const gain = 1 + (groove - 1) * 0.3 + (drop ? 0.4 : 0) + build * 0.5
    for (let i = 0; i < 14; i++) {
      const seed = Math.sin(beat * 12.9898 + i * 78.233) * 43758.5453
      const level = (seed - Math.floor(seed)) * 0.7 + 0.3
      const h = Math.min(BX - 6, (6 + level * 22) * gain * (0.35 + pulse * 0.65)) * (1 - deathT)
      const y = BY + 8 + i * ((BOARD - 16) / 13)
      ctx.fillStyle = `hsl(${hue + 40 + i * 6} 100% 65% / 0.55)`
      ctx.fillRect(BX - 14 - h, y - barW / 2, h, barW)
      ctx.fillRect(BX + BOARD + 14, y - barW / 2, h, barW)
    }
  }

  private board(s: StrideState, b: Board, d: Dancer, pulse: number, beatPos: number, deathT: number) {
    const ctx = this.ctx
    const n = b.n
    const cell = cellOf(n)
    const od = overdriveActive(s, d)
    const drop = s.section === 'drop'
    const build = s.section === 'build' ? sectionProgress(Math.floor(beatPos)) : 0
    // Board plate; its edge glows harder through a build-up.
    ctx.fillStyle = `rgb(10 6 30 / 0.7)`
    ctx.beginPath()
    ctx.roundRect(BX - 10, BY - 10, BOARD + 20, BOARD + 20, 18)
    ctx.fill()
    ctx.save()
    if (build > 0 || drop) {
      ctx.shadowColor = drop ? C.warn : C.edge
      ctx.shadowBlur = 10 + build * 30 + (drop ? 20 * pulse : 0)
    }
    ctx.strokeStyle = drop
      ? `rgb(255 61 142 / ${(0.5 + pulse * 0.5) * (1 - deathT)})`
      : `rgb(95 243 255 / ${(0.25 + pulse * 0.35 + build * 0.4) * (1 - deathT)})`
    ctx.lineWidth = 2 + build * 2
    ctx.stroke()
    ctx.restore()

    // Danger per tile: the strongest pending warning covering it.
    // Warnings step with the music: one stage per whole beat, never in between.
    const beat = Math.floor(beatPos)
    const kick = this.reduced ? 0 : (1 - (beatPos - beat)) ** 4
    const warn = new Map<number, WarnStep>()
    for (const st of b.strikes) {
      if (st.firedAt !== undefined) continue
      const total = Math.ceil(st.beat - st.warnBeat)
      const stage = Math.min(total - 1, Math.max(0, beat - st.warnBeat))
      const step = { p: (stage + 1) / total, left: total - stage, kick, st }
      for (const t of st.tiles) {
        const w = warn.get(t)
        if (!w || st.beat < w.st.beat) warn.set(t, step)
      }
    }
    const holes = new Set(openHoles(s, b).flatMap((h) => h.tiles))
    const grooveColor = GROOVE_COLORS[grooveMult(d) - 1]

    for (let t = 0; t < n * n; t++) {
      const x = tileX(t, n) - cell / 2
      const y = tileY(t, n) - cell / 2
      if (holes.has(t)) {
        this.hole(x, y, cell)
        continue
      }
      const w = warn.get(t)
      const hue = od ? (this.time * 120 + t * 22) % 360 : drop ? 320 : 250
      const lift = pulse * (drop ? 0.14 : 0.08) + build * 0.05
      ctx.fillStyle = od ? `hsl(${hue} 70% ${16 + lift * 60}%)` : `hsl(${hue} 50% ${14 + lift * 50}%)`
      ctx.beginPath()
      ctx.roundRect(x, y, cell, cell, 12)
      ctx.fill()
      // Where you stepped glows in your groove colour for a moment.
      const litAt = this.lit.get(t)
      const glow = litAt === undefined ? 0 : 1 - progress(this.time, litAt, 0.7)
      if (glow > 0 && deathT === 0) {
        ctx.fillStyle = this.rgba(grooveColor, glow * 0.35)
        ctx.fill()
      }
      ctx.strokeStyle = od
        ? `hsl(${hue} 100% 70% / 0.6)`
        : `rgb(95 243 255 / ${0.16 + pulse * 0.22 + glow * 0.4})`
      ctx.lineWidth = 1.5
      ctx.stroke()
      if (w && deathT === 0) this.warning(x, y, cell, w, t, n)
    }
  }

  /**
   * A warned tile changes pattern on each beat, so "how long" reads without
   * comparing sizes or colours: a dashed outline means it lands in 2 beats or
   * more, bold stripes mean it lands on the next beat, and the strike itself
   * is a solid flash. Each change pops on the beat and holds until the next.
   * Holes use violet; off-beat strikes carry a half-moon.
   */
  private warning(x: number, y: number, cell: number, w: WarnStep, tile: number, n: number) {
    const ctx = this.ctx
    const hole = w.st.kind === 'hole'
    const rgb = hole ? '154 124 255' : '255 61 120'
    const next = w.left <= 1
    ctx.beginPath()
    ctx.roundRect(x, y, cell, cell, 12)
    ctx.fillStyle = `rgb(${rgb} / ${(next ? 0.3 : 0.12) + w.kick * 0.15})`
    ctx.fill()
    if (next) {
      // Lands on the next beat: bold diagonal stripes and a solid bright edge.
      ctx.save()
      ctx.clip()
      ctx.strokeStyle = `rgb(${rgb} / ${0.8 + w.kick * 0.2})`
      ctx.lineWidth = cell * 0.09
      const gap = cell * 0.22
      ctx.beginPath()
      for (let d = -cell; d < cell * 2; d += gap) {
        ctx.moveTo(x + d, y + cell)
        ctx.lineTo(x + d + cell, y)
      }
      ctx.stroke()
      ctx.restore()
      ctx.beginPath()
      ctx.roundRect(x, y, cell, cell, 12)
      ctx.strokeStyle = `rgb(255 235 242 / ${0.9 + w.kick * 0.1})`
      ctx.lineWidth = 3.5 + w.kick * 3
      ctx.stroke()
    } else {
      // Two beats or more: a dashed outline, a beat-locked "heads up".
      ctx.beginPath()
      ctx.roundRect(x + 3, y + 3, cell - 6, cell - 6, 10)
      ctx.strokeStyle = `rgb(${rgb} / ${0.85 + w.kick * 0.15})`
      ctx.lineWidth = 2.5 + w.kick * 2
      ctx.setLineDash([cell * 0.12, cell * 0.08])
      ctx.stroke()
      ctx.setLineDash([])
    }
    const cx = x + cell / 2
    const cy = y + cell / 2
    if (w.st.kind === 'bomb' && tile === w.st.tiles[0]) this.bombMark(tile, n)
    if (hole) {
      // Cracks spreading as it gets close.
      ctx.strokeStyle = `rgb(240 235 255 / ${0.3 + w.p * 0.6})`
      ctx.lineWidth = 1.5
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + 0.4
        const r = cell * 0.4 * w.p
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6)
        ctx.lineTo(cx + Math.cos(a + 0.3) * r, cy + Math.sin(a + 0.3) * r)
        ctx.stroke()
      }
    }
    if (isOffBeat(w.st)) {
      // Off-beat: a half-moon in the corner, it lands between beats.
      const r = cell * 0.13
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = `rgb(${rgb})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x + cell - r - 6, y + r + 6, r, Math.PI / 2, -Math.PI / 2)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }

  /** The bomb sits on the centre of its plus (its first tile), fuse fizzing. */
  private bombMark(centre: number, n: number) {
    const ctx = this.ctx
    const x = tileX(centre, n)
    const y = tileY(centre, n)
    const r = cellOf(n) * 0.2
    ctx.fillStyle = '#1a1030'
    ctx.strokeStyle = '#ff9cc4'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y + 3, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + r * 0.6, y + 3 - r * 0.6)
    ctx.quadraticCurveTo(x + r, y - r * 1.3, x + r * 1.4, y - r)
    ctx.stroke()
    if (!this.reduced && Math.random() < 0.5)
      this.fx.burst(x + r * 1.4, y - r, {
        count: 1,
        color: ['#ffd84d', '#fff'],
        speed: 50,
        life: 0.25,
        size: 2,
      })
  }

  /** An open hole: a dark pit you can't step into. */
  private hole(x: number, y: number, cell: number) {
    const ctx = this.ctx
    const g = ctx.createRadialGradient(x + cell / 2, y + cell / 2, 2, x + cell / 2, y + cell / 2, cell * 0.7)
    g.addColorStop(0, '#000000')
    g.addColorStop(0.7, '#0c0620')
    g.addColorStop(1, '#3b2470')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.roundRect(x, y, cell, cell, 12)
    ctx.fill()
    ctx.strokeStyle = 'rgb(154 124 255 / 0.7)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 5])
    ctx.lineDashOffset = -this.time * 20
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
  }

  private drawBumps(n: number) {
    const ctx = this.ctx
    this.bumps = this.bumps.filter((b) => this.time - b.at < 0.3)
    for (const b of this.bumps) {
      const a = 1 - (this.time - b.at) / 0.3
      const x = tileX(b.tile, n)
      const y = tileY(b.tile, n)
      ctx.strokeStyle = `rgb(255 80 120 / ${a})`
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x - 12, y - 12)
      ctx.lineTo(x + 12, y + 12)
      ctx.moveTo(x + 12, y - 12)
      ctx.lineTo(x - 12, y + 12)
      ctx.stroke()
    }
  }

  private drawBlasts() {
    const ctx = this.ctx
    this.blasts = this.blasts.filter((b) => this.time - b.at < 0.45)
    for (const b of this.blasts) {
      const n = b.n
      const cell = cellOf(n)
      const t = (this.time - b.at) / 0.45
      const a = 1 - ease.outCubic(t)
      for (const tile of b.tiles) {
        const grow = 1 + t * 0.15
        ctx.save()
        ctx.translate(tileX(tile, n), tileY(tile, n))
        ctx.scale(grow, grow)
        ctx.fillStyle = `rgb(255 ${Math.round(lerp(255, 47, t))} ${Math.round(lerp(255, 110, t))} / ${a * 0.85})`
        ctx.shadowColor = C.strike
        ctx.shadowBlur = 24 * a
        ctx.beginPath()
        ctx.roundRect(-cell / 2, -cell / 2, cell, cell, 12)
        ctx.fill()
        ctx.restore()
      }
      // Lasers sweep every fully covered row and column.
      ctx.strokeStyle = `rgb(255 230 240 / ${a})`
      ctx.lineWidth = 10 * a + 2
      ctx.lineCap = 'round'
      for (let i = 0; i < n; i++) {
        const lineAt = i * (cell + GAP) + cell / 2
        if (b.tiles.filter((t) => rowOf(t, n) === i).length === n) {
          ctx.beginPath()
          ctx.moveTo(BX - 20, BY + lineAt)
          ctx.lineTo(BX + BOARD + 20, BY + lineAt)
          ctx.stroke()
        }
        if (b.tiles.filter((t) => colOf(t, n) === i).length === n) {
          ctx.beginPath()
          ctx.moveTo(BX + lineAt, BY - 20)
          ctx.lineTo(BX + lineAt, BY + BOARD + 20)
          ctx.stroke()
        }
      }
    }
  }

  private drawNotes(b: Board, beatPos: number, deathT: number) {
    if (deathT > 0) return
    const ctx = this.ctx
    const n = b.n
    // Dotted path through each chain, in order.
    const chains = new Map<number, typeof b.notes>()
    for (const note of b.notes) chains.set(note.chain, [...(chains.get(note.chain) ?? []), note])
    ctx.save()
    ctx.setLineDash([3, 6])
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgb(255 216 77 / 0.35)'
    for (const notes of chains.values()) {
      if (notes.length < 2) continue
      const sorted = [...notes].sort((a, b) => a.index - b.index)
      ctx.beginPath()
      sorted.forEach((note, i) =>
        i
          ? ctx.lineTo(tileX(note.tile, n), tileY(note.tile, n))
          : ctx.moveTo(tileX(note.tile, n), tileY(note.tile, n)),
      )
      ctx.stroke()
    }
    ctx.restore()
    for (const note of b.notes) {
      const left = note.until - beatPos
      // Blink when about to vanish.
      if (left < 2 && Math.floor(this.time * 10) % 2 === 0) continue
      const next = isNext(note, b.notes)
      const x = tileX(note.tile, n)
      const y = tileY(note.tile, n) + (next ? Math.sin(this.time * 6 + note.id) * 3 : 0)
      ctx.save()
      ctx.globalAlpha = next ? 1 : 0.45
      ctx.shadowColor = C.note
      ctx.shadowBlur = next ? 18 : 4
      ctx.fillStyle = `rgb(255 216 77 / ${next ? 0.22 : 0.1})`
      ctx.beginPath()
      ctx.arc(x, y, cellOf(n) * 0.28, 0, Math.PI * 2)
      ctx.fill()
      this.noteGlyph(ctx, x - (note.length > 1 ? 4 : 0), y, cellOf(n) / 55, C.note)
      if (note.length > 1) {
        ctx.shadowBlur = 0
        ctx.fillStyle = '#fff'
        ctx.font = `800 13px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(note.index + 1), x + cellOf(n) * 0.24, y - cellOf(n) * 0.22)
      }
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

  /** Everyone on the board: others first (in their seat colour, named), the focus dancer on top. */
  private dancers(s: StrideState, b: Board, focus: Dancer, tick: number, pulse: number) {
    const n = b.n
    const many = s.dancers.length > 1
    const others = s.dancers.filter((d) => d.board === b.id && d !== focus)
    for (const d of others) this.dancer(s, d, n, tick, pulse, false, many)
    this.dancer(s, focus, n, tick, pulse, true, many)
  }

  private dancer(
    s: StrideState,
    d: Dancer,
    n: number,
    tick: number,
    pulse: number,
    focus: boolean,
    many: boolean,
  ) {
    const ctx = this.ctx
    const predicted = d.id === this.view.selfId ? this.view.predictedPos() : null
    const pos = predicted ?? d.pos
    const hop = this.hops.get(d.id)
    const t = hop ? clamp01((this.time - hop.at) / HOP_TIME) : 1
    const moving = hop !== undefined && hop.to === pos && t < 1 && hop.from < n * n
    const from = moving ? hop.from : pos
    const k = ease.outCubic(t)
    const x = lerp(tileX(from, n), tileX(pos, n), moving ? k : 1)
    const y = lerp(tileY(from, n), tileY(pos, n), moving ? k : 1) - (moving ? Math.sin(t * Math.PI) * 14 : 0)
    const seat = this.view.colorOf(d.slot)
    const size = (n >= 5 ? 0.85 : 1) * (focus ? 1 : 0.78)

    if (d.diedAt !== null) {
      const dt = progress(tick, d.diedAt, DEATH_TICKS)
      if (dt < 0.2) this.gem(x, y, size * (1 + ease.inCubic(dt / 0.2) * 0.6), C.strike, 1)
      else if (!this.burst.has(d.id)) {
        this.burst.add(d.id)
        this.fx.burst(x, y, {
          count: focus ? 80 : 40,
          color: [C.player, focus ? C.playerGlow : seat, C.strike, '#fff'],
          speed: focus ? 360 : 260,
          life: 1.1,
          size: focus ? 6 : 5,
        })
        if (focus) {
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
      }
      return
    }
    if (!focus) {
      // Another dancer: their seat colour, a little smaller, with a name tag.
      this.gem(x, y, size * (moving ? 1 : 1 + pulse * 0.08), seat, 0.92)
      this.nameTag(x, y - 30 * size, this.view.nameOf(d.id), seat)
      return
    }
    // Groove-coloured trail.
    const groove = GROOVE_COLORS[grooveMult(d) - 1]
    this.trail.push({ x, y, at: this.time })
    this.trail = this.trail.filter((p) => this.time - p.at < TRAIL_TIME)
    for (const p of this.trail) {
      const a = 1 - (this.time - p.at) / TRAIL_TIME
      ctx.fillStyle = this.rgba(groove, a * 0.35)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4 + a * 10, 0, Math.PI * 2)
      ctx.fill()
    }
    // Shadow on the tile; with company, a ring in your seat colour so you can find yourself.
    ctx.fillStyle = 'rgb(0 0 0 / 0.35)'
    ctx.beginPath()
    ctx.ellipse(x, tileY(pos, n) + cellOf(n) * 0.28, 18, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    if (many) {
      ctx.strokeStyle = this.rgba(seat, 0.9)
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(x, tileY(pos, n) + cellOf(n) * 0.28, 22, 8, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    const hurt = progress(this.time, this.hitAt, 0.4) < 1
    const invuln = s.tick < d.vitals.invulnUntil && Math.floor(this.time * 16) % 2 === 0
    const od = overdriveActive(s, d)
    // Pop on a Perfect, squash on landing, bounce with the beat.
    const pop = 1 + 0.3 * (1 - ease.outCubic(progress(this.time, this.popAt, 0.18)))
    const squash = (moving ? 1 : 1 + pulse * 0.12) * pop
    this.gem(x, y, squash * size, hurt ? C.strike : od ? C.drop : groove, invuln ? 0.4 : 1)
    if (many && d.id !== this.view.selfId) this.nameTag(x, y - 34, this.view.nameOf(d.id), seat)
    if (od && !this.reduced && Math.random() < 0.5)
      this.fx.burst(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, {
        count: 1,
        color: [C.drop, C.note],
        speed: 40,
        life: 0.5,
      })
  }

  private nameTag(x: number, y: number, name: string, color: string) {
    const ctx = this.ctx
    const text = name.length > 10 ? `${name.slice(0, 9)}…` : name
    ctx.save()
    ctx.font = `700 11px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const w = ctx.measureText(text).width + 10
    ctx.fillStyle = 'rgb(8 6 24 / 0.75)'
    ctx.beginPath()
    ctx.roundRect(x - w / 2, y - 8, w, 16, 8)
    ctx.fill()
    ctx.fillStyle = color
    ctx.fillText(text, x, y + 1)
    ctx.restore()
  }

  /** Own boards: the other dancers' boards, small, along the top. */
  private minis(s: StrideState, focus: Dancer, beatPos: number) {
    const ctx = this.ctx
    const others = s.dancers.filter((d) => d !== focus)
    if (!others.length) return
    const gap = 14
    const total = others.length * MINI + (others.length - 1) * gap
    let x0 = (WIDTH - total) / 2
    const y0 = 48
    for (const d of others) {
      const b = s.boards[d.board]
      const n = b.n
      const cell = MINI / n
      const out = d.diedAt !== null
      ctx.save()
      ctx.globalAlpha = out ? 0.45 : 1
      ctx.fillStyle = 'rgb(10 6 30 / 0.8)'
      ctx.beginPath()
      ctx.roundRect(x0 - 3, y0 - 3, MINI + 6, MINI + 6, 6)
      ctx.fill()
      ctx.strokeStyle = this.view.colorOf(d.slot)
      ctx.lineWidth = 1.5
      ctx.stroke()
      const danger = new Map<number, number>()
      for (const st of b.strikes) {
        if (st.firedAt !== undefined) continue
        const left = st.beat - beatPos
        for (const t of st.tiles) danger.set(t, Math.min(danger.get(t) ?? Infinity, left))
      }
      for (let t = 0; t < n * n; t++) {
        const left = danger.get(t)
        ctx.fillStyle =
          left === undefined
            ? 'rgb(60 40 110 / 0.6)'
            : left <= 1
              ? 'rgb(255 61 120 / 0.9)'
              : 'rgb(255 61 120 / 0.4)'
        ctx.fillRect(x0 + (t % n) * cell + 1, y0 + Math.floor(t / n) * cell + 1, cell - 2, cell - 2)
      }
      if (!out) {
        ctx.fillStyle = this.view.colorOf(d.slot)
        ctx.beginPath()
        ctx.arc(
          x0 + ((d.pos % n) + 0.5) * cell,
          y0 + (Math.floor(d.pos / n) + 0.5) * cell,
          cell * 0.32,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      // One line under it: name · score (or "out").
      ctx.font = `700 10px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const name = this.view.nameOf(d.id)
      const short = name.length > 7 ? `${name.slice(0, 6)}…` : name
      const tail = out ? this.labels.out : Math.floor(d.score).toLocaleString()
      ctx.fillStyle = this.view.colorOf(d.slot)
      ctx.fillText(`${short} · ${tail}`, x0 + MINI / 2, y0 + MINI + 5)
      ctx.restore()
      x0 += MINI + gap
    }
  }

  private gem(x: number, y: number, scale: number, glow: string, alpha: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(x, y)
    ctx.scale(scale / Math.sqrt(scale), scale)
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

  /**
   * Beat timeline: beats scroll in to the marker from both sides. Struck beats
   * carry a diamond (orange halfway between beats for off-beats), and the
   * start of the next drop shows a star.
   */
  private timeline(b: Board, beatPos: number, deathT: number) {
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
    const struck = b.strikes.filter((k) => k.firedAt === undefined).map((k) => k.beat)
    const marks = (d: number, draw: (x: number, fade: number) => void) => {
      const fade = clamp01(1 - Math.abs(d) / 3.3)
      for (const side of [-1, 1]) draw(cx + side * d * BEAT_PX, fade)
    }
    for (let beat = Math.ceil(beatPos - 0.3); beat < beatPos + 3.3; beat++) {
      const dropStart = sectionAt(beat) === 'drop' && sectionAt(beat - 1) === 'build'
      marks(beat - beatPos, (x, fade) => {
        if (dropStart) this.star(x, y, 10, `rgb(255 216 77 / ${fade})`)
        else if (!struck.includes(beat)) {
          ctx.fillStyle = `rgb(200 230 255 / ${fade * 0.8})`
          ctx.fillRect(x - 1.5, y - 7, 3, 14)
        }
      })
    }
    for (const beat of new Set(struck)) {
      const d = beat - beatPos
      if (d < -0.3 || d > 3.3) continue
      const off = beat % 1 !== 0
      marks(d, (x, fade) => {
        ctx.fillStyle = off ? `rgb(255 154 61 / ${fade})` : `rgb(255 61 142 / ${fade})`
        const r = off ? 6 : 9
        ctx.beginPath()
        ctx.moveTo(x, y - r)
        ctx.lineTo(x + r * 0.78, y)
        ctx.lineTo(x, y + r)
        ctx.lineTo(x - r * 0.78, y)
        ctx.closePath()
        ctx.fill()
      })
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

  private star(x: number, y: number, r: number, color: string) {
    const ctx = this.ctx
    ctx.fillStyle = color
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fill()
  }

  private rgba(hex: string, a: number): string {
    const v = parseInt(hex.slice(1), 16)
    return `rgb(${(v >> 16) & 255} ${(v >> 8) & 255} ${v & 255} / ${clamp01(a)})`
  }
}

/** Canvas + renderer as a {@link StrideView}. */
export function createView(
  stage: HTMLElement,
  smooth: Smoothed<StrideState>,
  labels: StrideLabels,
  options: StrideViewOptions,
): StrideView {
  const view = createCanvas2D(stage, WIDTH, HEIGHT, { maxDpr: 2 })
  const renderer = new StrideRenderer(view.ctx, smooth, labels, options)
  return {
    surface: view.canvas,
    banner: (b) => renderer.banner(b),
    onState: (s) => renderer.onState(s),
    frame: (dt) => renderer.frame(dt),
    localMove: (from, to, rating) => renderer.localMove(from, to, rating),
    point(clientX, clientY) {
      const r = view.canvas.getBoundingClientRect()
      return { x: ((clientX - r.left) / r.width) * WIDTH, y: ((clientY - r.top) / r.height) * HEIGHT }
    },
    destroy: () => view.destroy(),
  }
}
