import { celebrate } from '@forge/fx/confetti'
import { Particles } from '@forge/fx/particles'
import { Shake } from '@forge/fx/shake'
import { clamp01, damp, ease, lerp, prefersReducedMotion } from '@forge/fx/tween'
import type { Canvas2D } from '@forge/render2d/canvas'
import { FONT, playerColor, theme } from '@forge/ui/theme'
import { ROCK, type Dir } from './board'
import { t } from './i18n'
import {
  cellPos,
  clockText,
  fontSize,
  GLOW_TIER,
  label,
  layoutFor,
  RAINBOW_TIER,
  tileColor,
  textColor,
  type Layout,
} from './look'
import { boardOf, isRace, MAX_BLASTS, METER_MAX, TICK_RATE, type Board, type FuseState } from './sim'

/** Seconds a tile takes to slide. Short: the game should feel instant. */
const SLIDE = 0.1
const POP = 0.18
const ROCK_DROP = 0.34
const STONE = '#767b9c'
const DUST = ['#9aa0c2', '#6b6f8f', '#c9cce0']

interface Sprite {
  v: number
  hp: number
  cell: number
  fx: number
  fy: number
  tx: number
  ty: number
  t0: number
  born: number
  kind: 'still' | 'spawn' | 'merge' | 'rock'
}

interface Ghost {
  v: number
  fx: number
  fy: number
  tx: number
  ty: number
  t0: number
}

interface Callout {
  x: number
  y: number
  text: string
  color: string
  size: number
  at: number
  /** Comic-book starburst behind the text. */
  burst?: boolean
}

/** Per-frame inputs that live outside the game state. */
export interface ViewInput {
  /** Blast is armed: the next tap destroys a tile. */
  armed: boolean
  /** Cell under the mouse (blast aiming), or -1. */
  hover: number
  /** Keyboard aiming cursor, or -1. */
  cursor: number
}

const BUMP: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

export class FuseRenderer {
  readonly particles = new Particles()
  private readonly shake = new Shake(12)
  private time = 0
  layout: Layout = layoutFor(5, 0)
  private state: FuseState | null = null
  private sprites = new Map<number, Sprite>()
  private ghosts: Ghost[] = []
  private callouts: Callout[] = []
  private boardId = ''
  private lastTick = -1
  private bump: [number, number] = [0, 0]
  private scoreShown = 0
  private meterFlash = -10
  private hitFlash = -10
  private boomFlash = -10
  private sized = false
  private rings: { x: number; y: number; t0: number; size: number; color: string }[] = []
  private readonly still = prefersReducedMotion()

  constructor(
    private readonly view: Canvas2D,
    private readonly selfId: string,
  ) {}

  /** The board this screen plays (or watches). */
  myBoard(s: FuseState): Board {
    return boardOf(s, this.selfId) ?? s.boards[0]
  }

  onState(s: FuseState): void {
    this.state = s
    const rivals = s.boards.length - 1
    const l = this.layout
    if (!this.sized || l.size !== s.size || l.rivals !== rivals) {
      this.sized = true
      this.layout = layoutFor(s.size, rivals)
      this.view.setSize(this.layout.width, this.layout.height)
      this.sprites.clear()
    }
    const b = this.myBoard(s)
    // A new match (tick went back) or a new board: snap, don't animate.
    const fresh = b.id !== this.boardId || s.tick < this.lastTick
    if (fresh) {
      this.sprites.clear()
      this.ghosts = []
      this.scoreShown = b.score
    }
    this.boardId = b.id
    this.lastTick = s.tick
    const blasted = new Map<number, number>()
    for (const e of s.events)
      if (e.type === 'blast' && e.p === b.id)
        for (const sp of this.sprites.values()) if (sp.cell === e.cell) blasted.set(e.cell, sp.v)
    this.sync(s, b, fresh)
    this.effects(s, b, blasted)
  }

  private spritePos(sp: { fx: number; fy: number; tx: number; ty: number; t0: number }): [number, number] {
    const p = this.still ? 1 : ease.outCubic(clamp01((this.time - sp.t0) / SLIDE))
    return [lerp(sp.fx, sp.tx, p), lerp(sp.fy, sp.ty, p)]
  }

  private center(cell: number): [number, number] {
    const [x, y] = cellPos(this.layout, cell)
    return [x + this.layout.cell / 2, y + this.layout.cell / 2]
  }

  /** Matches tiles to sprites by id, so each one glides from where it was to where it is. */
  private sync(s: FuseState, b: Board, fresh: boolean) {
    const now = this.time
    const into = new Map<number, number>()
    const merged = new Set<number>()
    for (const e of s.events)
      if (e.type === 'move' && e.p === b.id)
        for (const m of e.merges) {
          into.set(m.from[0], m.cell)
          into.set(m.from[1], m.cell)
          const tile = b.cells[m.cell]
          if (tile) merged.add(tile.id)
        }
    const seen = new Set<number>()
    b.cells.forEach((c, i) => {
      if (!c) return
      seen.add(c.id)
      const [x, y] = cellPos(this.layout, i)
      const sp = this.sprites.get(c.id)
      if (sp) {
        if (sp.cell !== i) {
          ;[sp.fx, sp.fy] = this.spritePos(sp)
          ;[sp.tx, sp.ty, sp.t0, sp.cell] = [x, y, now, i]
        }
        sp.v = c.v
        sp.hp = c.hp ?? 0
        return
      }
      const kind = fresh ? 'still' : c.v === ROCK ? 'rock' : merged.has(c.id) ? 'merge' : 'spawn'
      this.sprites.set(c.id, {
        v: c.v,
        hp: c.hp ?? 0,
        cell: i,
        fx: x,
        fy: y,
        tx: x,
        ty: y,
        t0: now,
        born: now,
        kind,
      })
    })
    for (const [id, sp] of this.sprites) {
      if (seen.has(id)) continue
      const cell = into.get(id)
      if (cell !== undefined) {
        const [fx, fy] = this.spritePos(sp)
        const [tx, ty] = cellPos(this.layout, cell)
        this.ghosts.push({ v: sp.v, fx, fy, tx, ty, t0: now })
      }
      this.sprites.delete(id)
    }
  }

  say(x: number, y: number, text: string, color: string, size = 30, burst = false): void {
    this.callouts.push({ x, y, text, color, size, at: this.time, burst })
    if (this.callouts.length > 6) this.callouts.shift()
  }

  /** Bursts, callouts and shakes for this tick's events on the local board. */
  private effects(s: FuseState, b: Board, blasted: Map<number, number>) {
    const l = this.layout
    const mid = l.bx + l.bw / 2
    for (const e of s.events) {
      if ('p' in e && e.p !== b.id) continue
      switch (e.type) {
        case 'move': {
          const [dx, dy] = BUMP[e.dir]
          this.bump = [dx * 5, dy * 5]
          let sx = 0
          let sy = 0
          for (const m of e.merges) {
            const [x, y] = this.center(m.cell)
            sx += x
            sy += y
            this.particles.burst(x, y, {
              count: 6 + m.tier * 2,
              color: [tileColor(m.tier, this.time), '#ffffff'],
              speed: 110 + m.tier * 14,
              life: 0.45,
              size: 3 + m.tier * 0.25,
            })
          }
          if (e.combo >= 2) {
            const n = e.merges.length
            this.say(
              sx / n,
              sy / n,
              t('Combo ×{n}', { n: e.combo }),
              e.combo >= 4 ? theme.yolk : '#ffffff',
              26 + e.combo * 3,
            )
            this.shake.add(0.06 * e.combo)
          }
          break
        }
        case 'record': {
          const cell = b.cells.findIndex((c) => c?.v === e.tier)
          const [x, y] = cell >= 0 ? this.center(cell) : [mid, l.by + l.bw / 2]
          this.say(x, y - 10, `${label(e.tier)}!`, theme.yolk, 40 + Math.min(20, e.tier * 2))
          this.particles.burst(x, y, {
            count: 40,
            color: [theme.yolk, '#ffffff', tileColor(e.tier)],
            speed: 320,
            life: 0.9,
          })
          this.shake.add(0.3)
          if (e.tier >= 11) celebrate()
          break
        }
        case 'crumble':
          for (const c of e.cracked) {
            const [x, y] = this.center(c)
            this.particles.burst(x, y, { count: 8, color: DUST, speed: 90, life: 0.4, size: 3, gravity: 300 })
          }
          for (const c of e.broken) {
            const [x, y] = this.center(c)
            this.particles.burst(x, y, {
              count: 22,
              color: DUST,
              speed: 220,
              life: 0.7,
              size: 6,
              gravity: 700,
              shape: 'square',
            })
            this.say(x, y, t('Smash!'), '#c9cce0', 24)
            this.shake.add(0.12)
          }
          break
        case 'rock':
          if (e.sent) {
            this.hitFlash = this.time
            const [x, y] = this.center(e.cell)
            this.say(x, y, t('Incoming!'), theme.coral, 26)
          }
          break
        case 'blast': {
          const [x, y] = this.center(e.cell)
          const tier = blasted.get(e.cell) ?? (e.rock ? ROCK : 1)
          const chunk = tier === ROCK ? DUST : [tileColor(tier, this.time), '#ffffff']
          this.boomFlash = this.time
          this.rings.push({ x, y, t0: this.time, size: l.cell * 1.9, color: '#ffffff' })
          this.rings.push({ x, y, t0: this.time + 0.07, size: l.cell * 2.6, color: theme.coral })
          // Bits of whatever blew up, hot sparks, then a puff of smoke.
          this.particles.burst(x, y, {
            count: 26,
            color: chunk,
            speed: 460,
            life: 0.8,
            size: 9,
            gravity: 1100,
            shape: 'square',
          })
          this.particles.burst(x, y, {
            count: 44,
            color: [theme.yolk, '#ff9f43', theme.coral, '#ffffff'],
            speed: 520,
            life: 0.55,
            size: 5,
          })
          this.particles.burst(x, y, {
            count: 10,
            color: ['#4a4e70', '#5d6186'],
            speed: 70,
            life: 1,
            size: 18,
            gravity: -60,
          })
          this.say(x, y - 6, t('BOOM!'), theme.yolk, 46, true)
          this.shake.add(0.65)
          break
        }
        case 'charged':
          this.meterFlash = this.time
          this.say(l.width - 110, l.hudY + 70, t('Blast ready!'), theme.yolk, 24)
          break
        case 'stuck':
          this.shake.add(0.4)
          break
        case 'attack':
          if (e.from !== b.id) break
          if (e.cancelled) this.say(mid, l.by + 30, t('Blocked!'), '#5ab8ff', 28)
          if (e.n) this.say(mid, l.by + 30, t('Sent {n} rock!', { n: e.n }), theme.coral, 28)
          break
      }
    }
  }

  frame(dt: number, ui: ViewInput): void {
    this.time += dt
    this.particles.update(dt)
    this.shake.update(dt)
    this.bump = [damp(this.bump[0], 0, 18, dt), damp(this.bump[1], 0, 18, dt)]
    const { ctx } = this.view
    const l = this.layout
    // The whole canvas, not just the layout: sparks fall past the board.
    ctx.clearRect(0, 0, this.view.width, this.view.height)
    const s = this.state
    if (!s) return
    const b = this.myBoard(s)
    this.scoreShown =
      Math.abs(b.score - this.scoreShown) < 1 ? b.score : damp(this.scoreShown, b.score, 12, dt)
    if (isRace(s)) this.drawRivals(ctx, s, b)
    this.drawHud(ctx, s, b)
    ctx.save()
    this.shake.apply(ctx)
    ctx.translate(this.bump[0], this.bump[1])
    this.drawWell(ctx, b, ui)
    this.ghosts = this.ghosts.filter((g) => this.time - g.t0 < SLIDE)
    for (const g of this.ghosts) {
      const [x, y] = this.spritePos(g)
      this.drawTile(ctx, x, y, l.cell, g.v, 1)
    }
    // Rocks first, so tiles sliding past never hide under them.
    for (const pass of [true, false])
      for (const sp of this.sprites.values()) if ((sp.v === ROCK) === pass) this.drawSprite(ctx, sp)
    this.drawAim(ctx, ui)
    this.drawBoom(ctx)
    this.particles.draw(ctx)
    this.drawCallouts(ctx)
    ctx.restore()
    if (!b.alive) this.drawOut(ctx, s, b)
  }

  // ---------- Board ----------

  private drawWell(ctx: CanvasRenderingContext2D, b: Board, ui: ViewInput) {
    const l = this.layout
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = 22
    ctx.shadowOffsetY = 8
    ctx.fillStyle = theme.pit
    roundRect(ctx, l.bx, l.by, l.bw, l.bw, 22)
    ctx.fill()
    ctx.restore()
    // A red rim when rocks just landed, or while aiming a blast.
    const hit = 1 - clamp01((this.time - this.hitFlash) / 0.6)
    const aim = ui.armed ? 0.55 + 0.45 * Math.sin(this.time * 8) : 0
    const glow = Math.max(hit, aim)
    ctx.lineWidth = 3 + glow * 3
    ctx.strokeStyle = glow > 0.01 ? `rgba(255, 107, 107, ${0.35 + glow * 0.6})` : theme.rim
    roundRect(ctx, l.bx, l.by, l.bw, l.bw, 22)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)'
    for (let i = 0; i < b.cells.length; i++) {
      const [x, y] = cellPos(l, i)
      roundRect(ctx, x, y, l.cell, l.cell, l.cell * 0.16)
      ctx.fill()
    }
  }

  private drawSprite(ctx: CanvasRenderingContext2D, sp: Sprite) {
    const l = this.layout
    const [x, sy] = this.spritePos(sp)
    let y = sy
    const age = this.time - sp.born
    let scale = 1
    if (!this.still) {
      if (sp.kind === 'spawn') scale = age < SLIDE ? 0 : ease.outBack(clamp01((age - SLIDE) / POP))
      else if (sp.kind === 'merge') {
        const p = clamp01((age - SLIDE * 0.7) / POP)
        scale = age < SLIDE * 0.7 ? 0.9 : 1 + 0.22 * Math.sin(p * Math.PI)
      } else if (sp.kind === 'rock') {
        const p = clamp01(age / ROCK_DROP)
        y -= (1 - ease.outBack(p)) * l.cell * 0.9
        scale = 0.85 + 0.15 * p
      }
    }
    if (scale <= 0) return
    if (sp.v === ROCK) this.drawRock(ctx, x, y, l.cell, sp, scale)
    else this.drawTile(ctx, x, y, l.cell, sp.v, scale)
  }

  /** A chunky tile: darker bottom edge, glossy top, like the game's buttons. */
  drawTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    tier: number,
    scale: number,
    text = true,
  ) {
    const s = size * scale
    if (s < 4) return
    const cx = x + size / 2
    const cy = y + size / 2
    const left = cx - s / 2
    const top = cy - s / 2
    const r = s * 0.17
    const edge = Math.max(2, s * 0.07)
    const color = tileColor(tier, this.time)
    ctx.save()
    if (tier >= GLOW_TIER && text) {
      ctx.shadowColor = color
      ctx.shadowBlur = 10 + (tier - GLOW_TIER) * 5 + Math.sin(this.time * 4) * 4
    }
    ctx.fillStyle = color
    roundRect(ctx, left, top, s, s, r)
    ctx.fill()
    ctx.restore()
    // Bottom edge.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.24)'
    roundRect(ctx, left, top + s - edge * 2, s, edge * 2, r * 0.8)
    ctx.fill()
    ctx.fillStyle = color
    roundRect(ctx, left, top, s, s - edge, r)
    ctx.fill()
    const gloss = ctx.createLinearGradient(0, top, 0, top + s * 0.6)
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.34)')
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = gloss
    roundRect(ctx, left + s * 0.06, top + s * 0.05, s * 0.88, s * 0.5, r * 0.8)
    ctx.fill()
    if (!text) return
    const str = label(tier)
    ctx.fillStyle = textColor(tier)
    ctx.font = `700 ${fontSize(str, s)}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (tier >= RAINBOW_TIER) {
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.strokeText(str, cx, cy - edge / 2)
    }
    ctx.fillText(str, cx, cy - edge / 2)
  }

  /** A lumpy stone; a cracked one shows a zig-zag split. */
  private drawRock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    sp: Sprite,
    scale: number,
  ) {
    const cx = x + size / 2
    const cy = y + size / 2
    const r = size * 0.46 * scale
    const seed = sp.cell * 7 + 3
    ctx.save()
    ctx.beginPath()
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      const k = 0.82 + 0.18 * Math.abs(Math.sin(seed * 12.9898 + i * 78.233))
      const px = cx + Math.cos(a) * r * k
      const py = cy + Math.sin(a) * r * k
      if (i) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    }
    ctx.closePath()
    const g = ctx.createLinearGradient(0, cy - r, 0, cy + r)
    g.addColorStop(0, '#9da2c4')
    g.addColorStop(1, '#4e5272')
    ctx.fillStyle = g
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 4
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#3b3e5a'
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
    ctx.beginPath()
    ctx.ellipse(cx - r * 0.25, cy - r * 0.35, r * 0.3, r * 0.16, -0.4, 0, Math.PI * 2)
    ctx.fill()
    if (sp.hp === 1) {
      ctx.strokeStyle = '#25273d'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(cx - r * 0.1, cy - r * 0.8)
      ctx.lineTo(cx + r * 0.15, cy - r * 0.25)
      ctx.lineTo(cx - r * 0.2, cy + r * 0.1)
      ctx.lineTo(cx + r * 0.1, cy + r * 0.75)
      ctx.moveTo(cx - r * 0.2, cy + r * 0.1)
      ctx.lineTo(cx - r * 0.6, cy + r * 0.3)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawAim(ctx: CanvasRenderingContext2D, ui: ViewInput) {
    const cell = ui.cursor >= 0 ? ui.cursor : ui.hover
    if (!ui.armed || cell < 0) return
    const [cx, cy] = this.center(cell)
    const r = this.layout.cell * (0.42 + 0.04 * Math.sin(this.time * 10))
    ctx.save()
    ctx.strokeStyle = theme.coral
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.moveTo(cx - r - 8, cy)
    ctx.lineTo(cx - r * 0.45, cy)
    ctx.moveTo(cx + r * 0.45, cy)
    ctx.lineTo(cx + r + 8, cy)
    ctx.moveTo(cx, cy - r - 8)
    ctx.lineTo(cx, cy - r * 0.45)
    ctx.moveTo(cx, cy + r * 0.45)
    ctx.lineTo(cx, cy + r + 8)
    ctx.stroke()
    ctx.restore()
  }

  /** Shockwave rings and a quick white flash over the board. */
  private drawBoom(ctx: CanvasRenderingContext2D) {
    const l = this.layout
    const flash = 1 - clamp01((this.time - this.boomFlash) / 0.18)
    if (flash > 0 && !this.still) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * flash})`
      roundRect(ctx, l.bx, l.by, l.bw, l.bw, 22)
      ctx.fill()
    }
    const LIFE = 0.4
    this.rings = this.rings.filter((r) => this.time - r.t0 < LIFE)
    ctx.save()
    for (const r of this.rings) {
      const p = (this.time - r.t0) / LIFE
      if (p < 0) continue
      ctx.globalAlpha = 1 - p
      ctx.strokeStyle = r.color
      ctx.lineWidth = 14 * (1 - p) + 2
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.size * ease.outCubic(p), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawCallouts(ctx: CanvasRenderingContext2D) {
    const LIFE = 1.1
    this.callouts = this.callouts.filter((c) => this.time - c.at < LIFE)
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    const l = this.layout
    for (const c of this.callouts) {
      const p = (this.time - c.at) / LIFE
      const pop = ease.outBack(clamp01(p * 5))
      ctx.globalAlpha = 1 - clamp01((p - 0.6) / 0.4)
      ctx.font = `700 ${c.size * pop}px ${FONT}`
      // Keep the text inside the canvas.
      const w = ctx.measureText(c.text).width / 2 + 8
      const x = Math.min(l.width - w, Math.max(w, c.x))
      const y = c.y - 34 * ease.outCubic(p)
      if (c.burst) {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(-0.12 + Math.sin(p * 20) * 0.04)
        starburst(ctx, (w + 14) * pop, c.size * 0.95 * pop, 14)
        ctx.fillStyle = theme.coral
        ctx.fill()
        ctx.lineWidth = 5
        ctx.strokeStyle = theme.night
        ctx.stroke()
        starburst(ctx, (w + 2) * pop, c.size * 0.72 * pop, 14)
        ctx.fillStyle = '#ff9f43'
        ctx.fill()
        ctx.restore()
      }
      ctx.lineWidth = 7
      ctx.strokeStyle = theme.night
      ctx.strokeText(c.text, x, y)
      ctx.fillStyle = c.color
      ctx.fillText(c.text, x, y)
    }
    ctx.restore()
  }

  private drawOut(ctx: CanvasRenderingContext2D, s: FuseState, b: Board) {
    const l = this.layout
    ctx.save()
    ctx.fillStyle = 'rgba(16, 19, 44, 0.62)'
    roundRect(ctx, l.bx, l.by, l.bw, l.bw, 22)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = theme.chalk
    ctx.font = `700 40px ${FONT}`
    const text = b.left
      ? t('Left')
      : s.over && !isRace(s) && s.timeTicks && s.clock === 0
        ? t("Time's up!")
        : t('Out of moves')
    ctx.fillText(text, l.bx + l.bw / 2, l.by + l.bw / 2 - 10)
    if (isRace(s) && !s.over) {
      ctx.fillStyle = theme.haze
      ctx.font = `500 20px ${FONT}`
      ctx.fillText(t('Watch the others finish'), l.bx + l.bw / 2, l.by + l.bw / 2 + 32)
    }
    ctx.restore()
  }

  // ---------- HUD ----------

  private drawHud(ctx: CanvasRenderingContext2D, s: FuseState, b: Board) {
    const l = this.layout
    const y = l.hudY
    ctx.save()
    ctx.textBaseline = 'alphabetic'
    // Score and best tile.
    ctx.textAlign = 'left'
    ctx.fillStyle = theme.haze
    ctx.font = `600 16px ${FONT}`
    ctx.fillText(t('Score'), l.bx + 4, y + 26)
    ctx.fillStyle = theme.chalk
    ctx.font = `700 40px ${FONT}`
    ctx.fillText(Math.round(this.scoreShown).toLocaleString(), l.bx + 2, y + 66)
    if (b.best) {
      ctx.fillStyle = theme.haze
      ctx.font = `600 15px ${FONT}`
      ctx.fillText(t('Best tile'), l.bx + 4, y + 92)
      const w = ctx.measureText(t('Best tile')).width
      this.drawTile(ctx, l.bx + w + 12, y + 74, 24, b.best, 1, false)
      ctx.fillStyle = theme.chalk
      ctx.fillText(label(b.best), l.bx + w + 42, y + 92)
    }

    // Middle: time left, or race rank.
    const mid = l.width / 2 + 20
    ctx.textAlign = 'center'
    if (s.timeTicks) {
      const secs = s.clock / TICK_RATE
      ctx.fillStyle = theme.haze
      ctx.font = `600 16px ${FONT}`
      ctx.fillText(t('Time'), mid, y + 26)
      ctx.fillStyle = secs <= 10 && Math.floor(this.time * 2) % 2 ? theme.coral : theme.chalk
      ctx.font = `700 32px ${FONT}`
      ctx.fillText(clockText(secs), mid, y + 62)
    }
    if (isRace(s)) {
      const rank = 1 + s.boards.filter((o) => o.score > b.score).length
      ctx.fillStyle = rank === 1 ? theme.yolk : theme.haze
      ctx.font = `700 17px ${FONT}`
      ctx.fillText(t('#{rank} of {n}', { rank, n: s.boards.length }), mid, y + (s.timeTicks ? 90 : 62))
    }

    // Right: blast charges and the meter that refills them.
    const right = l.bx + l.bw - 4
    ctx.textAlign = 'right'
    ctx.fillStyle = theme.haze
    ctx.font = `600 16px ${FONT}`
    ctx.fillText(t('Blast'), right, y + 26)
    const popped = 1 + 0.35 * Math.sin(clamp01((this.time - this.meterFlash) / 0.35) * Math.PI)
    for (let i = 0; i < MAX_BLASTS; i++) {
      const on = i < b.blasts
      // The newest charge pops in when it's earned.
      const scale = on && i === b.blasts - 1 ? popped : 1
      drawBomb(ctx, right - 17 - i * 40, y + 56, 16 * scale, on, this.time + i * 0.7)
    }
    const mw = 120
    const mx = right - mw
    const my = y + 80
    ctx.fillStyle = theme.pit
    roundRect(ctx, mx, my, mw, 12, 6)
    ctx.fill()
    const full = b.blasts >= MAX_BLASTS
    const fill = full ? 1 : b.meter / METER_MAX
    const flash = 1 - clamp01((this.time - this.meterFlash) / 0.7)
    ctx.fillStyle = full ? theme.yolk : flash > 0 ? '#ffffff' : '#ff9f43'
    if (fill > 0) {
      roundRect(ctx, mx, my, Math.max(12, mw * fill), 12, 6)
      ctx.fill()
    }

    // Rocks on their way: shown over the board's top edge.
    if (b.incoming > 0) {
      const n = Math.min(6, b.incoming)
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 9)
      ctx.globalAlpha = pulse
      ctx.textAlign = 'center'
      ctx.fillStyle = theme.coral
      ctx.font = `700 15px ${FONT}`
      ctx.fillText(t('Incoming ×{n}', { n: b.incoming }), l.width / 2, l.by - 8)
      ctx.globalAlpha = 1
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = STONE
        ctx.beginPath()
        ctx.arc(l.width / 2 - ((n - 1) * 16) / 2 + i * 16, l.by + 4, 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()
  }

  /** Small boards of the other racers, with name and score. */
  private drawRivals(ctx: CanvasRenderingContext2D, s: FuseState, me: Board) {
    const l = this.layout
    const others = s.boards.filter((b) => b !== me)
    const colW = l.width / others.length
    const top = Math.max(...s.boards.map((b) => b.score))
    ctx.save()
    others.forEach((o, i) => {
      const mini = 96
      const x = colW * i + (colW - mini) / 2
      const y = 14
      const cs = mini / s.size
      ctx.fillStyle = theme.pit
      roundRect(ctx, x - 4, y - 4, mini + 8, mini + 8, 10)
      ctx.fill()
      o.cells.forEach((c, k) => {
        if (!c) return
        const cx = x + (k % s.size) * cs
        const cy = y + Math.floor(k / s.size) * cs
        ctx.fillStyle = c.v === ROCK ? STONE : tileColor(c.v, this.time)
        roundRect(ctx, cx + 1, cy + 1, cs - 2, cs - 2, 3)
        ctx.fill()
      })
      if (!o.alive) {
        ctx.fillStyle = 'rgba(16, 19, 44, 0.7)'
        roundRect(ctx, x - 4, y - 4, mini + 8, mini + 8, 10)
        ctx.fill()
        ctx.fillStyle = theme.haze
        ctx.font = `700 18px ${FONT}`
        ctx.textAlign = 'center'
        ctx.fillText(o.left ? t('Left') : t('Out'), x + mini / 2, y + mini / 2 + 6)
      }
      ctx.textAlign = 'center'
      ctx.fillStyle = o.slot >= 0 ? playerColor(o.slot) : theme.haze
      ctx.font = `600 15px ${FONT}`
      const lead = o.score === top && top > 0 ? '★ ' : ''
      ctx.fillText(lead + clip(ctx, o.name, colW - 30), x + mini / 2, y + mini + 22)
      ctx.fillStyle = theme.chalk
      ctx.font = `700 15px ${FONT}`
      ctx.fillText(o.score.toLocaleString(), x + mini / 2, y + mini + 40)
    })
    ctx.restore()
  }
}

/** A round cartoon bomb. Ready ones wobble, blink and fizz. */
function drawBomb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, on: boolean, time: number) {
  ctx.save()
  ctx.translate(x, y)
  if (on) ctx.rotate(Math.sin(time * 5) * 0.12)
  ctx.globalAlpha = on ? 1 : 0.3
  // Fuse.
  ctx.strokeStyle = on ? '#c9a46a' : theme.rim
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(r * 0.45, -r * 0.8)
  ctx.quadraticCurveTo(r * 1.15, -r * 1.25, r * 0.7, -r * 1.65)
  ctx.stroke()
  // Cap.
  ctx.fillStyle = on ? '#5d6186' : theme.rim
  ctx.save()
  ctx.rotate(0.6)
  ctx.fillRect(-r * 0.28, -r * 1.12, r * 0.56, r * 0.36)
  ctx.restore()
  // Body with a glossy shine.
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r)
  g.addColorStop(0, on ? '#6a6f9e' : theme.pit)
  g.addColorStop(1, on ? '#1d2040' : theme.pit)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = on ? theme.coral : theme.rim
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
  ctx.beginPath()
  ctx.ellipse(-r * 0.4, -r * 0.42, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2)
  ctx.fill()
  if (on) {
    // Eyes that blink now and then.
    const blink = time % 3.2 < 0.12 ? 0.15 : 1
    ctx.fillStyle = '#ffffff'
    for (const ex of [-r * 0.28, r * 0.28]) {
      ctx.beginPath()
      ctx.ellipse(ex, r * 0.1, r * 0.13, r * 0.19 * blink, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // A fizzing star spark on the fuse.
    ctx.translate(r * 0.7, -r * 1.65)
    ctx.rotate(time * 9)
    const k = 5 + Math.sin(time * 24) * 1.5
    starburst(ctx, k, k, 5)
    ctx.fillStyle = theme.yolk
    ctx.fill()
  }
  ctx.restore()
}

/** A spiky star path centred on 0,0 with `points` spikes. */
function starburst(ctx: CanvasRenderingContext2D, rx: number, ry: number, points: number) {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2
    const k = i % 2 ? 0.62 : 1
    const px = Math.cos(a) * rx * k
    const py = Math.sin(a) * ry * k
    if (i) ctx.lineTo(px, py)
    else ctx.moveTo(px, py)
  }
  ctx.closePath()
}

function clip(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1)
  return s + '…'
}

/** A rounded box path. Safe for tiny or negative sizes (canvas throws on a negative radius). */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  w = Math.max(0, w)
  h = Math.max(0, h)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)))
}
