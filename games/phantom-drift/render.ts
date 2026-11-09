// 2D fallback renderer (no WebGL): the rift in pseudo-3D, depth z maps to a
// vanishing point near the top. Everything is drawn from shapes.

import { Particles } from '@forge/fx/particles'
import { Shake } from '@forge/fx/shake'
import { clamp01, damp, ease, lerp, prefersReducedMotion, progress } from '@forge/fx/tween'
import type { Smoothed } from '@forge/net/smoothing'
import { createCanvas2D, type Canvas2D } from '@forge/render2d/canvas'
import { telegraph } from '@forge/reflex'
import { DEFAULT_CHARACTER } from './characters'
import { drawGhost2D, type GhostLook } from './ghost2d'
import { Blinker, ghostRig, runPose, runPoseOut, type RunInput } from './ghost-motion'
import { DriftHud, traceHeart } from './hud'
import { riftHue } from './ambience'
import { C } from './palette'
import type { DriftView } from './view'
import {
  DEATH_TICKS,
  SPAWN_Z,
  speedLevel,
  type DriftEvent,
  type DriftState,
  type Faller,
  type Obj,
} from './sim'

export const WIDTH = 420
export const HEIGHT = 720
const HORIZON = 120
const PLAYER_Y = 600
const TRACK_W = 340
/** Perspective depth: bigger = flatter. */
const D = 28

const scale = (z: number) => 1 / (1 + Math.max(z, -D * 0.7) / D)

export class DriftRenderer {
  private fx = new Particles()
  private shake = new Shake(12)
  private time = 0
  private travel = 0
  private lanesShown = 3
  private hue = riftHue(0)
  private flash = { at: -10, color: '#fff' }
  private trail: { x: number; t: number }[] = []
  private reduced = prefersReducedMotion()
  private rig = ghostRig()
  private pose = runPoseOut()
  private runIn: RunInput = { time: 0, dt: 0, slide: 0, speed: 0, eyes: 1, glow: 0, reduced: false }
  private blink = new Blinker(11)

  constructor(
    private view: Canvas2D,
    private smooth: Smoothed<DriftState>,
    private hud: DriftHud,
    private character: GhostLook = DEFAULT_CHARACTER,
  ) {}

  /** Screen position for a lane (may be fractional) at depth z. */
  private at(lane: number, z: number): [x: number, y: number, s: number] {
    const s = scale(z)
    const laneW = TRACK_W / this.lanesShown
    const x = WIDTH / 2 + (lane - (this.lanesShown - 1) / 2) * laneW * s
    return [x, HORIZON + (PLAYER_Y - HORIZON) * s, s]
  }

  private laneW() {
    return TRACK_W / this.lanesShown
  }

  onState(state: DriftState): void {
    for (const e of state.events) this.onEvent(e, state)
  }

  private onEvent(e: DriftEvent, s: DriftState) {
    const [px, py] = this.at(s.player.x, 0)
    switch (e.type) {
      case 'wisp': {
        const [x, y] = this.at(e.lane, 0)
        this.fx.burst(x, y - 20, { count: 16, color: [C.wisp, '#fff'], speed: 170, life: 0.45, size: 5 })
        this.hud.text(x, y - 60, `+${e.points}`, C.wisp, 20)
        this.hud.spark(x, y - 30)
        break
      }
      case 'nearMiss': {
        const [x, y] = this.at(e.lane, 0)
        const dir = Math.sign(px - x) || 1
        this.fx.burst(lerp(x, px, 0.5), y - 20, {
          count: 22,
          color: [C.gold, '#fff'],
          speed: 260,
          life: 0.4,
          size: 4,
          angle: dir > 0 ? 0 : Math.PI,
          spread: Math.PI * 0.9,
        })
        this.hud.text(px, py - 90, `+${e.points}`, C.gold, 26)
        this.shake.add(0.12)
        break
      }
      case 'die':
        this.hud.clearBanners()
        this.fx.burst(px, py - 30, {
          count: 70,
          color: [C.ghost, C.wisp, '#fff'],
          speed: 300,
          life: 1,
          size: 7,
        })
        this.shake.add(0.8)
        this.flash = { at: this.time, color: '#ffffff' }
        break
      case 'hit':
        this.fx.burst(px, py - 20, {
          count: 30,
          color: [C.shard, '#fff', C.ghost],
          speed: 260,
          life: 0.6,
          size: 6,
        })
        this.shake.add(0.6)
        this.flash = { at: this.time, color: C.shard }
        this.hud.hit()
        break
      case 'slam': {
        const [x, y] = this.at(e.lane, 0)
        this.fx.burst(x, y, {
          count: 18,
          color: [C.faller, '#fff'],
          speed: 200,
          life: 0.4,
          size: 6,
          shape: 'square',
          angle: -Math.PI / 2,
          spread: Math.PI,
        })
        this.shake.add(0.3)
        break
      }
      case 'phantom':
        this.flash = { at: this.time, color: C.phantom }
        this.fx.burst(px, py - 20, { count: 40, color: [C.phantom, '#fff'], speed: 220, life: 0.7, size: 5 })
        break
      case 'charged':
        this.fx.burst(px, py - 20, { count: 20, color: [C.phantom, C.wisp], speed: 140, life: 0.6, size: 4 })
        break
      case 'heart': {
        const [x, y] = this.at(e.lane, 0)
        this.fx.burst(x, y - 30, {
          count: 40,
          color: [C.heart, '#fff', '#ffb3c7'],
          speed: 240,
          life: 0.7,
          size: 6,
        })
        this.hud.heartPickup(x, y - 30)
        this.shake.add(0.1)
        break
      }
      case 'multiplier':
        this.hud.multiplier()
        this.hud.text(px, py - 120, `×${e.mult}`, C.gold, 34)
        break
      case 'tier':
        this.hud.tier()
        this.flash = { at: this.time, color: `hsl(${riftHue(s.tick / 60)} 100% 70%)` }
        break
    }
  }

  frame(dt: number): void {
    this.time += dt
    this.fx.update(dt)
    this.shake.update(dt)
    const { ctx } = this.view
    const curr = this.smooth.curr
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    if (!curr) return
    const prev = this.smooth.prev && this.smooth.prev.tick === curr.tick - 1 ? this.smooth.prev : null
    const a = prev ? this.smooth.alpha() : 1
    const phantom = curr.tick < curr.player.phantomUntil

    this.lanesShown = damp(this.lanesShown, curr.lanes, 6, dt)
    this.hue = riftHue((curr.tick + a) / 60)
    this.travel = prev ? lerp(prev.dist, curr.dist, a) : curr.dist

    ctx.save()
    this.shake.apply(ctx)
    this.drawSky()
    this.drawTrack()
    const prevObjs = new Map(prev?.objects.map((o) => [o.id, o]))
    const objs = [...curr.objects].sort((p, q) => q.z - p.z)
    // Things behind the player row first, the ghost, then things past it.
    for (const o of objs) if (o.z >= 0) this.drawObj(o, prevObjs.get(o.id), a)
    for (const f of curr.fallers) this.drawFaller(f, curr.tick + a)
    const x = prev ? lerp(prev.player.x, curr.player.x, a) : curr.player.x
    if (curr.diedAt === null) this.drawGhost(x, curr, phantom, dt)
    for (const o of objs) if (o.z < 0) this.drawObj(o, prevObjs.get(o.id), a)
    ctx.restore()

    this.fx.draw(ctx)
    this.drawFlash(phantom)
    this.hud.draw(ctx, WIDTH, HEIGHT, curr, dt)
    if (curr.diedAt !== null) {
      // Dying: the screen sinks into the dark before the results.
      const k = Math.min(1, (curr.tick - curr.diedAt) / DEATH_TICKS)
      ctx.fillStyle = `rgb(6 4 18 / ${0.7 * ease.inOutCubic(k)})`
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
    }
  }

  private drawSky() {
    const { ctx } = this.view
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT)
    g.addColorStop(0, C.sky)
    g.addColorStop(0.5, C.skyLow)
    g.addColorStop(1, C.sky)
    ctx.fillStyle = g
    ctx.fillRect(-20, -20, WIDTH + 40, HEIGHT + 40)
    // Rift glow at the vanishing point.
    const glow = ctx.createRadialGradient(WIDTH / 2, HORIZON, 0, WIDTH / 2, HORIZON, 260)
    glow.addColorStop(0, `hsl(${this.hue} 100% 65% / 0.55)`)
    glow.addColorStop(1, `hsl(${this.hue} 100% 50% / 0)`)
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    // Drifting stars.
    ctx.fillStyle = 'rgb(255 255 255 / 0.5)'
    for (let i = 0; i < 40; i++) {
      const sx = (i * 97.3) % WIDTH
      const sy = ((i * 53.7 + this.travel * (0.2 + (i % 5) * 0.08)) % HORIZON) * 1
      ctx.fillRect(sx, sy, 1.5, 1.5)
    }
  }

  private drawTrack() {
    const { ctx } = this.view
    const n = this.lanesShown
    const edge = (side: number, z: number) => this.at(side < 0 ? -0.5 : n - 0.5, z)
    const far = SPAWN_Z * 1.1
    const near = -D * 0.6
    const [lx0, ly0] = edge(-1, far)
    const [rx0] = edge(1, far)
    const [lx1, ly1] = edge(-1, near)
    const [rx1] = edge(1, near)
    ctx.fillStyle = `hsl(${this.hue} 60% 12% / 0.85)`
    ctx.beginPath()
    ctx.moveTo(lx0, ly0)
    ctx.lineTo(rx0, ly0)
    ctx.lineTo(rx1, ly1)
    ctx.lineTo(lx1, ly1)
    ctx.closePath()
    ctx.fill()

    // Scrolling cross lines sell the speed.
    const gap = 12
    const offset = this.travel % gap
    ctx.lineWidth = 1
    for (let z = far - offset; z > near; z -= gap) {
      const [x0, y] = edge(-1, z)
      const [x1] = edge(1, z)
      ctx.strokeStyle = `hsl(${this.hue} 100% 70% / ${0.06 + 0.25 * scale(z) ** 2})`
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(x1, y)
      ctx.stroke()
    }
    // Lane dividers and glowing edges.
    for (let l = 0; l <= Math.ceil(n); l++) {
      const side = l - 0.5
      const fade = l === Math.ceil(n) ? clamp01(n - (l - 1)) : 1
      const isEdge = l === 0 || l === Math.ceil(n)
      const [x0, y0] = this.at(side, far)
      const [x1, y1] = this.at(side, near)
      ctx.strokeStyle = `hsl(${this.hue} 100% ${isEdge ? 70 : 60}% / ${(isEdge ? 0.9 : 0.25) * fade})`
      ctx.lineWidth = isEdge ? 3 : 1.5
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
  }

  private drawObj(o: Obj, before: Obj | undefined, a: number) {
    const z = before ? lerp(before.z, o.z, a) : o.z
    const lane = before ? lerp(before.lane, o.lane, a) : o.lane
    if (z > SPAWN_Z * 1.05) return
    const fadeIn = clamp01((SPAWN_Z - z) / 12)
    const { ctx } = this.view
    ctx.globalAlpha = fadeIn
    if (o.kind === 'shard') this.drawShard(lane, z, o.done)
    else if (o.kind === 'wisp') this.drawWisp(lane, z, o.id)
    else if (o.kind === 'heart') this.drawHeart(lane, z, o.id)
    else if (o.kind === 'wall') this.drawWall(o.gap!, z)
    else this.drawSweeper(lane, z, o.to!)
    ctx.globalAlpha = 1
  }

  private drawShard(lane: number, z: number, spent?: boolean) {
    const { ctx } = this.view
    const [x, y, s] = this.at(lane, z)
    const r = this.laneW() * 0.32 * s
    ctx.save()
    ctx.translate(x, y - r)
    ctx.rotate(Math.sin(this.time * 3 + lane) * 0.15)
    ctx.globalAlpha *= spent ? 0.4 : 1
    ctx.fillStyle = C.shard
    ctx.shadowColor = C.shard
    ctx.shadowBlur = this.reduced ? 0 : 14 * s
    ctx.beginPath()
    // Spiky crystal: alternating long and short points.
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 - Math.PI / 2
      const rr = i % 2 ? r * 0.45 : r * (i === 0 ? 1.25 : 0.95)
      ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr)
    }
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = C.shardCore
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.7)
    ctx.lineTo(r * 0.22, 0)
    ctx.lineTo(0, r * 0.3)
    ctx.lineTo(-r * 0.22, 0)
    ctx.fill()
    ctx.restore()
  }

  private drawWisp(lane: number, z: number, id: number) {
    const { ctx } = this.view
    const [x, y, s] = this.at(lane, z)
    const bob = Math.sin(this.time * 6 + id) * 4 * s
    const r = this.laneW() * 0.16 * s
    const cy = y - r * 2.2 + bob
    const halo = ctx.createRadialGradient(x, cy, 0, x, cy, r * 3)
    halo.addColorStop(0, 'rgb(95 243 255 / 0.6)')
    halo.addColorStop(1, 'rgb(95 243 255 / 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(x, cy, r * 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = C.wisp
    ctx.beginPath()
    ctx.arc(x, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(x - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2)
    ctx.fill()
  }

  /** Heart pickup: a glossy, beating heart in a pink glow (same look as the HUD's). */
  private drawHeart(lane: number, z: number, id: number) {
    const { ctx } = this.view
    const [x, y, s] = this.at(lane, z)
    const bob = this.reduced ? 0 : Math.sin(this.time * 3 + id) * 5 * s
    const k = (this.laneW() / 50) * s * (1 + 0.1 * Math.max(0, Math.sin(this.time * 7)))
    const cy = y - 26 * s + bob
    const r = 26 * k
    const halo = ctx.createRadialGradient(x, cy, 0, x, cy, r * 1.4)
    halo.addColorStop(0, 'rgb(255 143 166 / 0.55)')
    halo.addColorStop(1, 'rgb(255 143 166 / 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(x, cy, r * 1.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.translate(x, cy)
    ctx.scale(k, k)
    traceHeart(ctx)
    ctx.fillStyle = C.heart
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#6e0a26'
    ctx.stroke()
    ctx.fillStyle = 'rgb(255 255 255 / 0.8)'
    ctx.beginPath()
    ctx.ellipse(-4.6, -4.4, 2.6, 1.5, -0.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private drawWall(gap: number, z: number) {
    const { ctx } = this.view
    const lanes = Math.round(this.lanesShown)
    const [, y, s] = this.at(0, z)
    const h = 34 * s
    for (let l = 0; l < lanes; l++) {
      const [x] = this.at(l, z)
      const w = this.laneW() * s * 0.96
      if (l === gap) {
        // The gap shimmers: the way through.
        ctx.strokeStyle = `rgb(95 243 255 / ${0.4 + 0.4 * Math.sin(this.time * 12)})`
        ctx.lineWidth = 2
        ctx.strokeRect(x - w / 2, y - h, w, h)
        continue
      }
      ctx.fillStyle = C.wall
      ctx.shadowColor = C.wall
      ctx.shadowBlur = this.reduced ? 0 : 12 * s
      ctx.fillRect(x - w / 2, y - h, w, h)
      ctx.shadowBlur = 0
      ctx.fillStyle = 'rgb(255 255 255 / 0.35)'
      ctx.fillRect(x - w / 2, y - h, w, h * 0.18)
    }
  }

  private drawSweeper(lane: number, z: number, to: number) {
    const { ctx } = this.view
    // Dotted trail: where it will be when it reaches you.
    ctx.fillStyle = 'rgb(255 154 61 / 0.45)'
    for (let i = 1; i <= 6; i++) {
      const t = i / 6
      const [tx, ty, ts] = this.at(lerp(lane, to, t), lerp(z, 0, t))
      ctx.beginPath()
      ctx.arc(tx, ty - 6 * ts, 3 * ts, 0, Math.PI * 2)
      ctx.fill()
    }
    const [x, y, s] = this.at(lane, z)
    const r = this.laneW() * 0.3 * s
    ctx.save()
    ctx.translate(x, y - r)
    ctx.rotate(this.time * 10)
    ctx.fillStyle = C.sweeper
    ctx.shadowColor = C.sweeper
    ctx.shadowBlur = this.reduced ? 0 : 12 * s
    ctx.beginPath()
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2
      const rr = i % 2 ? r * 0.75 : r
      ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr)
    }
    ctx.closePath()
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = C.sky
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private drawFaller(f: Faller, now: number) {
    const { ctx } = this.view
    const { progress: p, fired } = telegraph(f.slamAt, f.tele, now)
    const [x, y] = this.at(f.lane, 0)
    const w = this.laneW() * 0.8
    // Shadow grows as it gets closer.
    ctx.fillStyle = `rgb(193 61 255 / ${0.15 + 0.45 * p})`
    ctx.beginPath()
    ctx.ellipse(x, y, (w / 2) * (0.4 + 0.6 * p), 10 * (0.4 + 0.6 * p), 0, 0, Math.PI * 2)
    ctx.fill()
    if (fired) return
    // The block shakes harder the closer the slam.
    const jitter = this.reduced ? 0 : Math.sin(this.time * 70) * 4 * p
    const top = lerp(-60, y - w * 0.9, ease.inCubic(p))
    ctx.fillStyle = C.faller
    ctx.shadowColor = C.faller
    ctx.shadowBlur = this.reduced ? 0 : 16
    ctx.beginPath()
    ctx.roundRect(x - w / 2 + jitter, top, w, w * 0.8, 8)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgb(255 255 255 / 0.3)'
    ctx.fillRect(x - w / 2 + jitter + 6, top + 6, w - 12, 6)
  }

  private drawGhost(lx: number, s: DriftState, phantom: boolean, dt: number) {
    const { ctx } = this.view
    const [x, y] = this.at(lx, 0)
    const invuln = s.tick < s.player.invulnUntil
    const flicker = invuln && !phantom && Math.floor(this.time * 14) % 2 === 0
    // Running away from the camera: its back, the face peeking round on a turn.
    const input = this.runIn
    input.time = this.time
    input.dt = dt
    input.slide = s.player.target - lx
    input.speed = speedLevel(s.speed)
    input.eyes = this.reduced ? 1 : this.blink.update(dt)
    input.glow = phantom ? 30 : 16
    input.reduced = this.reduced
    const pose = runPose(this.rig, input, this.pose)
    const look = this.character
    const tint = phantom ? C.phantom : undefined
    // Afterimages trail the slide.
    this.trail.push({ x, t: this.time })
    this.trail = this.trail.filter((p) => this.time - p.t < 0.15)
    for (const p of this.trail) {
      ctx.globalAlpha = 0.25 * (1 - (this.time - p.t) / 0.15)
      drawGhost2D(
        ctx,
        p.x,
        y + pose.lift * 40,
        look,
        { ...pose, glow: 0 },
        1,
        phantom ? C.phantom : look.colors.trail,
      )
    }
    ctx.globalAlpha = flicker ? 0.25 : phantom ? 0.55 + 0.2 * Math.sin(this.time * 20) : 1
    drawGhost2D(ctx, x, y + pose.lift * 40, look, pose, 1, tint)
    ctx.globalAlpha = 1
    // A full meter makes the ghost sparkle: ready to go Phantom.
    if (s.player.charge >= s.perks.phantomCost && !phantom && Math.random() < 0.4)
      this.fx.burst(x + (Math.random() - 0.5) * 40, y - 40, {
        count: 1,
        color: C.phantom,
        speed: 30,
        life: 0.5,
      })
  }

  private drawFlash(phantom: boolean) {
    const { ctx } = this.view
    const t = progress(this.time, this.flash.at, 0.35)
    if (t < 1) {
      ctx.globalAlpha = (1 - ease.outCubic(t)) * 0.35
      ctx.fillStyle = this.flash.color
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
      ctx.globalAlpha = 1
    }
    if (phantom) {
      const v = ctx.createRadialGradient(
        WIDTH / 2,
        HEIGHT / 2,
        HEIGHT * 0.3,
        WIDTH / 2,
        HEIGHT / 2,
        HEIGHT * 0.7,
      )
      v.addColorStop(0, 'rgb(180 140 255 / 0)')
      v.addColorStop(1, 'rgb(180 140 255 / 0.35)')
      ctx.fillStyle = v
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
    }
  }
}

/** The 2D renderer as a {@link DriftView}: used when WebGL2 is unavailable. */
export function createView2D(
  stage: HTMLElement,
  smooth: Smoothed<DriftState>,
  character: GhostLook = DEFAULT_CHARACTER,
): DriftView {
  const view = createCanvas2D(stage, WIDTH, HEIGHT, { maxDpr: 2 })
  const hud = new DriftHud()
  const renderer = new DriftRenderer(view, smooth, hud, character)
  return {
    banner: (m) => hud.banner(m),
    surface: view.canvas,
    onState: (s) => renderer.onState(s),
    frame: (dt) => renderer.frame(dt),
    hudPoint(clientX, clientY) {
      const r = view.canvas.getBoundingClientRect()
      return {
        x: ((clientX - r.left) / r.width) * WIDTH,
        y: ((clientY - r.top) / r.height) * HEIGHT,
        w: WIDTH,
        h: HEIGHT,
      }
    },
    destroy: () => view.destroy(),
  }
}
