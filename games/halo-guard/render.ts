// Halo Guard renderer (canvas 2D). The core sits mid-screen with four lanes
// running out to the edges; threats glow down their lane as they close in, and
// the lane itself brightens, so you can read danger from the edge of your eye.

import { Particles } from '@forge/fx/particles'
import { Shake } from '@forge/fx/shake'
import { damp, ease, lerp, prefersReducedMotion, progress } from '@forge/fx/tween'
import type { Smoothed } from '@forge/net/smoothing'
import { createCanvas2D } from '@forge/render2d/canvas'
import { ReflexHud, type Banner } from '@forge/reflex/hud2d'
import { C, KIND_COLOR } from './palette'
import {
  DEATH_TICKS,
  MAX_HEARTS,
  MAX_TIER,
  mult,
  NOVA_COST,
  NOVA_TICKS,
  novaActive,
  PERFECT_WINDOW,
  SHIELD_D,
  SPAWN_D,
  TICK_RATE,
  type Dir,
  type GuardEvent,
  type GuardState,
  type Proj,
} from './sim'
import { timeText } from './stats'

export const WIDTH = 420
export const HEIGHT = 720
export const CX = WIDTH / 2
export const CY = 318
const CORE_R = 26
const SHIELD_PX = 58
const SPAWN_PX = 200
/** Shield arc half-width (radians). */
const ARC = 0.62

const px = (d: number) => SHIELD_PX + ((d - SHIELD_D) * (SPAWN_PX - SHIELD_PX)) / (SPAWN_D - SHIELD_D)
/** Screen angle of a lane: up, right, down, left. */
export const laneAngle = (dir: Dir) => ((dir - 1) * Math.PI) / 2

/** Lane under a point (taps): the one whose direction is closest. */
export function laneAt(x: number, y: number): Dir {
  const a = Math.atan2(y - CY, x - CX)
  return ((((Math.round(a / (Math.PI / 2)) + 1) % 4) + 4) % 4) as Dir
}

/** Shards of a destroyed core / reflected bolt, purely visual. */
interface Streak {
  x: number
  y: number
  vx: number
  vy: number
  at: number
  color: string
}

export interface GuardView {
  onState(s: GuardState): void
  frame(dt: number): void
  banner(b: Banner): void
  surface: HTMLElement
  /** A pointer position in game units. */
  point(clientX: number, clientY: number): { x: number; y: number }
  destroy(): void
}

export class GuardRenderer {
  private fx = new Particles()
  private shake = new Shake(14)
  private hud: ReflexHud
  private time = 0
  private shieldAngle = laneAngle(0)
  private parryFlash = -10
  private hitAt = -10
  private novaAt = -10
  private tierAt = -10
  private hops = new Map<number, { from: Dir; at: number }>()
  private reflected: Streak[] = []
  private stars = Array.from({ length: 70 }, (_, i) => ({
    a: (i * 2.399) % (Math.PI * 2),
    r: 30 + ((i * 97) % 330),
    s: 0.6 + ((i * 13) % 10) / 10,
  }))
  private reduced = prefersReducedMotion()

  constructor(
    private ctx: CanvasRenderingContext2D,
    private smooth: Smoothed<GuardState>,
    tapLabel: string,
  ) {
    this.hud = new ReflexHud({ keyLabel: 'SPACE', touchLabel: tapLabel })
  }

  banner(b: Banner) {
    this.hud.banner(b)
  }

  onState(s: GuardState): void {
    for (const e of s.events) this.onEvent(e)
  }

  private onEvent(e: GuardEvent) {
    switch (e.type) {
      case 'turn':
        this.parryFlash = this.time
        break
      case 'hop':
        this.hops.set(e.id, { from: e.from, at: this.time })
        break
      case 'block': {
        const [x, y] = this.lanePoint(e.dir, SHIELD_PX)
        const color = KIND_COLOR[e.kind]
        this.fx.burst(x, y, {
          count: e.perfect ? 26 : 12,
          color: e.perfect ? [color, '#fff', C.shield] : [color, C.shield],
          speed: e.perfect ? 260 : 150,
          life: 0.45,
          size: e.perfect ? 5 : 4,
          angle: laneAngle(e.dir),
          spread: Math.PI * 0.9,
        })
        const a = laneAngle(e.dir)
        if (e.perfect) {
          // The bolt flies back out the way it came.
          this.reflected.push({ x, y, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, at: this.time, color })
          this.hud.text(x, y - 26, `+${e.points}`, C.perfect, 22)
          this.shake.add(e.kind === 'heavy' ? 0.35 : 0.12)
        } else {
          this.hud.text(x, y - 22, `+${e.points}`, C.shield, 17)
          this.shake.add(e.kind === 'heavy' ? 0.3 : 0.06)
        }
        break
      }
      case 'spark': {
        this.fx.burst(CX, CY, { count: 22, color: [C.spark, '#fff'], speed: 160, life: 0.55, size: 4 })
        this.hud.text(CX, CY - 46, `+${e.points}`, C.spark, 20)
        break
      }
      case 'fizzle': {
        const [x, y] = this.lanePoint(e.dir, SHIELD_PX)
        this.fx.burst(x, y, { count: 10, color: ['#8a7a40', '#555'], speed: 80, life: 0.5, size: 3 })
        break
      }
      case 'hit': {
        this.hitAt = this.time
        this.hud.hit()
        this.shake.add(0.6)
        this.fx.burst(CX, CY, {
          count: 34,
          color: [KIND_COLOR[e.kind], '#fff'],
          speed: 280,
          life: 0.6,
          size: 5,
        })
        break
      }
      case 'nova':
        this.novaAt = this.time
        this.shake.add(0.5)
        this.fx.burst(CX, CY, { count: 60, color: [C.nova, '#fff'], speed: 420, life: 0.7, size: 5 })
        if (e.points > 0) this.hud.text(CX, CY - 60, `+${e.points}`, C.nova, 24)
        break
      case 'charged':
        this.fx.burst(CX, CY, { count: 20, color: [C.nova, '#fff'], speed: 120, life: 0.5, size: 4 })
        break
      case 'multiplier':
        this.hud.multiplier()
        break
      case 'heal':
        this.hud.heal()
        break
      case 'tier':
        this.tierAt = this.time
        this.hud.popRight()
        break
      case 'die':
        this.hud.clearBanners()
        this.shake.add(0.8)
        break
      case 'over':
        break
    }
  }

  private lanePoint(dir: Dir, r: number): [number, number] {
    const a = laneAngle(dir)
    return [CX + Math.cos(a) * r, CY + Math.sin(a) * r]
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
    const dying = curr.diedAt !== null
    const deathT = dying ? progress(curr.tick + alpha, curr.diedAt!, DEATH_TICKS) : 0

    ctx.save()
    this.shake.apply(ctx)
    this.background(curr, deathT)
    this.lanes(curr, prev, alpha, deathT)
    this.drawProjs(curr, prev, alpha, deathT)
    this.drawReflected()
    this.core(curr, deathT)
    if (!dying || deathT < 0.25) this.shield(curr, dt, deathT)
    this.novaWave()
    this.fx.draw(ctx)
    ctx.restore()

    if (dying) {
      ctx.fillStyle = `rgb(4 4 14 / ${ease.inCubic(deathT) * 0.55})`
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
    }
    this.hud.draw(ctx, WIDTH, HEIGHT, this.hudFrame(curr), dt)
  }

  private hudFrame(s: GuardState) {
    return {
      hearts: s.vitals.hearts,
      maxHearts: MAX_HEARTS,
      score: s.score,
      scoreLabel: timeText(s.diedAt ?? s.tick),
      right: { value: String(s.stats.perfects), label: this.perfectLabel, color: C.gold },
      mult: mult(s),
      skill: {
        fill: s.charge / NOVA_COST,
        active: novaActive(s) ? (s.novaUntil - s.tick) / NOVA_TICKS : 0,
        color: C.shield,
        readyColor: C.nova,
        icon: (ctx: CanvasRenderingContext2D) => this.novaIcon(ctx),
      },
    }
  }

  /** Set by the view (translated). */
  perfectLabel = 'perfect'

  private background(s: GuardState, deathT: number) {
    const ctx = this.ctx
    const g = ctx.createRadialGradient(CX, CY, 20, CX, CY, 520)
    const danger = Math.min(1, s.tier / MAX_TIER)
    g.addColorStop(0, `hsl(${lerp(226, 262, danger)} 55% ${lerp(16, 14, deathT)}%)`)
    g.addColorStop(1, C.bg)
    ctx.fillStyle = g
    ctx.fillRect(-20, -20, WIDTH + 40, HEIGHT + 40)
    // Slowly turning star dust.
    const spin = this.reduced ? 0 : this.time * 0.03
    ctx.fillStyle = '#cfe8ff'
    for (const st of this.stars) {
      const a = st.a + spin * st.s
      const x = CX + Math.cos(a) * st.r
      const y = CY + Math.sin(a) * st.r * 1.25
      ctx.globalAlpha = 0.15 + 0.25 * Math.max(0, Math.sin(this.time * st.s * 2 + st.a * 5))
      ctx.fillRect(x, y, 1.6 * st.s, 1.6 * st.s)
    }
    ctx.globalAlpha = 1
    // Concentric guard rings, pulsing out from the core.
    ctx.lineWidth = 1
    for (let i = 0; i < 4; i++) {
      const r = SHIELD_PX + (((this.time * 26 + i * 40) % 160) | 0)
      ctx.strokeStyle = `rgb(127 212 255 / ${0.12 * (1 - (r - SHIELD_PX) / 160)})`
      ctx.beginPath()
      ctx.arc(CX, CY, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    // A tier-up flash ring.
    const tp = progress(this.time, this.tierAt, 0.8)
    if (tp < 1) {
      ctx.strokeStyle = `rgb(127 233 255 / ${0.6 * (1 - tp)})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(CX, CY, lerp(SHIELD_PX, 360, ease.outCubic(tp)), 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  /** Lane beams: brighten (in the threat's colour) as something closes in. */
  private lanes(s: GuardState, prev: GuardState | null, alpha: number, deathT: number) {
    const ctx = this.ctx
    for (let dir = 0 as Dir; dir < 4; dir = (dir + 1) as Dir) {
      let heat = 0
      let color = '#7fd4ff'
      for (const p of s.projs) {
        if (p.dir !== dir) continue
        const h = 1 - (this.dist(p, prev, alpha) - SHIELD_D) / (SPAWN_D - SHIELD_D)
        if (h > heat) {
          heat = h
          color = KIND_COLOR[p.kind]
        }
      }
      const a = laneAngle(dir)
      const [x0, y0] = this.lanePoint(dir, SHIELD_PX + 6)
      const [x1, y1] = this.lanePoint(dir, 440)
      const fade = 1 - deathT
      // Soft glow band, then a thin bright core line: both heat up with danger.
      for (const [width, a0] of [
        [14 + heat * 26, (0.05 + heat * 0.16) * fade],
        [6 + heat * 8, (0.04 + heat * 0.22) * fade],
        [1.5 + heat * 1.5, (0.1 + heat * 0.6) * fade],
      ]) {
        const grad = ctx.createLinearGradient(x0, y0, x1, y1)
        grad.addColorStop(0, this.alpha(color, a0))
        grad.addColorStop(0.6, this.alpha(color, a0 * 0.6))
        grad.addColorStop(1, this.alpha(color, 0))
        ctx.strokeStyle = grad
        ctx.lineWidth = width
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }
      // Tick marks along the lane, like a runway.
      ctx.fillStyle = this.alpha('#cfe8ff', 0.18 * (1 - deathT))
      for (let r = SHIELD_PX + 24; r < SPAWN_PX + 40; r += 24) {
        const tx = CX + Math.cos(a) * r
        const ty = CY + Math.sin(a) * r
        ctx.beginPath()
        ctx.arc(tx, ty, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  private dist(p: Proj, prev: GuardState | null, alpha: number): number {
    const before = prev?.projs.find((q) => q.id === p.id)
    return before ? lerp(before.d, p.d, alpha) : p.d
  }

  private drawProjs(s: GuardState, prev: GuardState | null, alpha: number, deathT: number) {
    const ctx = this.ctx
    ctx.globalAlpha = 1 - deathT
    for (const p of s.projs) {
      const d = this.dist(p, prev, alpha)
      const r = px(d)
      let a = laneAngle(p.dir)
      const hop = this.hops.get(p.id)
      if (hop) {
        const t = progress(this.time, hop.at, 0.14)
        if (t >= 1) this.hops.delete(p.id)
        else {
          let from = laneAngle(hop.from)
          if (from - a > Math.PI) from -= Math.PI * 2
          if (a - from > Math.PI) from += Math.PI * 2
          a = lerp(from, a, ease.outCubic(t))
        }
      }
      // Feints wobble across their lane before they hop.
      if (p.kind === 'feint' && p.hopAt !== undefined && s.tick < p.hopAt && !this.reduced)
        a += Math.sin(this.time * 22 + p.id) * 0.07
      const x = CX + Math.cos(a) * r
      const y = CY + Math.sin(a) * r
      this.projectile(p, x, y, a)
    }
    ctx.globalAlpha = 1
  }

  private projectile(p: Proj, x: number, y: number, a: number) {
    const ctx = this.ctx
    const color = KIND_COLOR[p.kind]
    // Trail back out along the lane.
    const tx = Math.cos(a)
    const ty = Math.sin(a)
    const trail = p.kind === 'heavy' ? 70 : p.kind === 'spark' ? 30 : 52
    const g = ctx.createLinearGradient(x, y, x + tx * trail, y + ty * trail)
    g.addColorStop(0, this.alpha(color, 0.75))
    g.addColorStop(1, this.alpha(color, 0))
    ctx.strokeStyle = g
    ctx.lineCap = 'round'
    ctx.lineWidth = p.kind === 'heavy' ? 16 : 7
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + tx * trail, y + ty * trail)
    ctx.stroke()

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(a)
    ctx.shadowColor = color
    ctx.shadowBlur = 16
    ctx.fillStyle = color
    switch (p.kind) {
      case 'bolt':
        // A dart pointing at the core.
        ctx.beginPath()
        ctx.moveTo(-14, 0)
        ctx.lineTo(4, -7)
        ctx.lineTo(10, 0)
        ctx.lineTo(4, 7)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#ffd0dc'
        ctx.beginPath()
        ctx.arc(-4, 0, 3, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'heavy': {
        // A spiked, slowly spinning mine.
        ctx.rotate(this.time * 3)
        ctx.beginPath()
        for (let i = 0; i < 16; i++) {
          const rr = i % 2 ? 11 : 18
          const aa = (i / 16) * Math.PI * 2
          ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr)
        }
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#ffe0bd'
        ctx.beginPath()
        ctx.arc(0, 0, 6, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'feint': {
        // A flickering twin-diamond.
        ctx.globalAlpha *= 0.75 + 0.25 * Math.sin(this.time * 30)
        for (const off of [-5, 5]) {
          ctx.beginPath()
          ctx.moveTo(-10 + off, 0)
          ctx.lineTo(off, -8)
          ctx.lineTo(10 + off, 0)
          ctx.lineTo(off, 8)
          ctx.closePath()
          ctx.fill()
        }
        break
      }
      case 'spark': {
        // A twinkling four-point star with a halo: friendly.
        ctx.rotate(-a + this.time * 2)
        const pulse = 1 + 0.15 * Math.sin(this.time * 12)
        ctx.scale(pulse, pulse)
        ctx.beginPath()
        for (let i = 0; i < 8; i++) {
          const rr = i % 2 ? 4 : 13
          const aa = (i / 8) * Math.PI * 2
          ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr)
        }
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha *= 0.25
        ctx.beginPath()
        ctx.arc(0, 0, 18, 0, Math.PI * 2)
        ctx.fill()
        if (!this.reduced && Math.random() < 0.3)
          this.fx.burst(x, y, { count: 1, color: C.spark, speed: 25, life: 0.4, size: 2.5 })
        break
      }
    }
    ctx.restore()
  }

  private drawReflected() {
    const ctx = this.ctx
    this.reflected = this.reflected.filter((r) => this.time - r.at < 0.4)
    for (const r of this.reflected) {
      const t = this.time - r.at
      const x = r.x + r.vx * t
      const y = r.y + r.vy * t
      ctx.strokeStyle = this.alpha(r.color, 1 - t / 0.4)
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - r.vx * 0.05, y - r.vy * 0.05)
      ctx.stroke()
    }
  }

  private core(s: GuardState, deathT: number) {
    const ctx = this.ctx
    const hurt = 1 - s.vitals.hearts / MAX_HEARTS
    const hitT = progress(this.time, this.hitAt, 0.4)
    const beat = 1 + 0.05 * Math.sin(this.time * (4 + hurt * 5))
    let r = CORE_R * beat * (1 + (1 - ease.outCubic(hitT)) * 0.2)
    if (deathT > 0) {
      // Swell, then burst into shards.
      if (deathT < 0.25) r *= 1 + ease.inCubic(deathT / 0.25) * 0.5
      else {
        if (!this.burst) this.shatter()
        return
      }
    }
    const glow = ctx.createRadialGradient(CX, CY, r * 0.2, CX, CY, r * 2.6)
    glow.addColorStop(0, this.alpha(hitT < 1 ? '#ffd0dc' : C.core, 0.55))
    glow.addColorStop(1, this.alpha(C.shield, 0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(CX, CY, r * 2.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = hitT < 0.3 ? '#ffffff' : C.core
    ctx.beginPath()
    ctx.arc(CX, CY, r, 0, Math.PI * 2)
    ctx.fill()
    // Inner iris.
    ctx.fillStyle = novaActive(s) ? C.nova : `hsl(${lerp(190, 350, hurt)} 90% 60%)`
    ctx.beginPath()
    ctx.arc(CX, CY, r * 0.45, 0, Math.PI * 2)
    ctx.fill()
    // Cracks for each lost heart.
    ctx.strokeStyle = 'rgb(20 10 40 / 0.6)'
    ctx.lineWidth = 2
    for (let i = 0; i < MAX_HEARTS - s.vitals.hearts; i++) {
      const a = 0.6 + i * 2.1
      ctx.beginPath()
      ctx.moveTo(CX + Math.cos(a) * r * 0.5, CY + Math.sin(a) * r * 0.5)
      ctx.lineTo(CX + Math.cos(a + 0.3) * r * 0.8, CY + Math.sin(a + 0.3) * r * 0.8)
      ctx.lineTo(CX + Math.cos(a + 0.1) * r, CY + Math.sin(a + 0.1) * r)
      ctx.stroke()
    }
  }

  private burst = false
  private shatter() {
    this.burst = true
    this.fx.burst(CX, CY, {
      count: 90,
      color: [C.core, C.shield, '#fff', C.bolt],
      speed: 380,
      life: 1.1,
      size: 6,
    })
    this.fx.burst(CX, CY, { count: 30, color: [C.shield], speed: 120, life: 1.4, size: 8, shape: 'square' })
    this.shake.add(0.9)
  }

  private shield(s: GuardState, dt: number, deathT: number) {
    const ctx = this.ctx
    const target = laneAngle(s.shield)
    let diff = target - this.shieldAngle
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    // Snappy: the shield is where you pressed within ~60 ms.
    this.shieldAngle = damp(this.shieldAngle, this.shieldAngle + diff, 40, dt)
    const a = this.shieldAngle
    const armed = s.tick - s.parryAt <= PERFECT_WINDOW
    const flash = 1 - progress(this.time, this.parryFlash, PERFECT_WINDOW / TICK_RATE)
    const nova = novaActive(s)
    ctx.save()
    ctx.globalAlpha = 1 - deathT * 4
    ctx.lineCap = 'round'
    // Outer glow arc, then the bright edge.
    ctx.strokeStyle = this.alpha(nova ? C.nova : C.shield, 0.25 + flash * 0.3)
    ctx.lineWidth = 18 + flash * 8
    ctx.beginPath()
    ctx.arc(CX, CY, SHIELD_PX, a - ARC, a + ARC)
    ctx.stroke()
    ctx.shadowColor = armed ? '#fff' : C.shield
    ctx.shadowBlur = 14 + flash * 14
    ctx.strokeStyle = armed ? '#ffffff' : C.shield
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(CX, CY, SHIELD_PX, a - ARC, a + ARC)
    ctx.stroke()
    if (nova) {
      // During Nova the whole ring guards.
      ctx.globalAlpha = 0.4 + 0.2 * Math.sin(this.time * 20)
      ctx.strokeStyle = C.nova
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(CX, CY, SHIELD_PX, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
    // A full Nova charge makes the core sparkle.
    if (s.charge >= NOVA_COST && !nova && !this.reduced && Math.random() < 0.3)
      this.fx.burst(CX + (Math.random() - 0.5) * 50, CY + (Math.random() - 0.5) * 50, {
        count: 1,
        color: C.nova,
        speed: 30,
        life: 0.5,
      })
  }

  private novaWave() {
    const t = progress(this.time, this.novaAt, 0.6)
    if (t >= 1) return
    const ctx = this.ctx
    ctx.strokeStyle = this.alpha(C.nova, 1 - t)
    ctx.lineWidth = 14 * (1 - t) + 2
    ctx.beginPath()
    ctx.arc(CX, CY, lerp(SHIELD_PX, 460, ease.outCubic(t)), 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = this.alpha('#ffffff', 0.25 * (1 - t))
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }

  private novaIcon(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? 4 : 10
      const a = (i / 16) * Math.PI * 2
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
  }

  private alpha(hex: string, a: number): string {
    const n = parseInt(hex.slice(1), 16)
    return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${Math.max(0, Math.min(1, a))})`
  }
}

/** Canvas + renderer as a {@link GuardView}. */
export function createView(
  stage: HTMLElement,
  smooth: Smoothed<GuardState>,
  labels: { tap: string; perfect: string },
): GuardView {
  const view = createCanvas2D(stage, WIDTH, HEIGHT, { maxDpr: 2 })
  const renderer = new GuardRenderer(view.ctx, smooth, labels.tap)
  renderer.perfectLabel = labels.perfect
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
