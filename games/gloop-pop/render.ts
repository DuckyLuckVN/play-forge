import { formatNumber } from '@forge/core/i18n'
import { celebrate } from '@forge/fx/confetti'
import { Particles } from '@forge/fx/particles'
import { Shake } from '@forge/fx/shake'
import { clamp01, damp, ease, prefersReducedMotion } from '@forge/fx/tween'
import type { Canvas2D } from '@forge/render2d/canvas'
import { FONT, playerColor, theme } from '@forge/ui/theme'
import { bottlePath, drawGloop, drawPill, type Mood } from './art'
import {
  colorOf,
  COLORS,
  gloopsByColor,
  H,
  inDanger,
  isGloop,
  landing,
  linkOf,
  pieceCells,
  W,
  type Cells,
} from './grid'
import { t } from './i18n'
import {
  bottle,
  CELL,
  cellXY,
  chainWord,
  comboWord,
  GLOOP_COLORS,
  layout,
  popStagger,
  rivalBox,
  type Bottle,
  type Layout,
} from './look'
import { boardOf, isRace, type Board, type GloopState } from './sim'

interface Callout {
  x: number
  y: number
  text: string
  color: string
  size: number
  at: number
  burst: boolean
  life: number
}

interface Banner {
  title: string
  sub: string
  color: string
  at: number
}

const DUST = ['#c9cce0', '#9aa0c2']

/** A cell waiting its turn to burst (pops go one after another). */
interface PendingPop {
  i: number
  v: number
  at: number
}
interface Ring {
  x: number
  y: number
  at: number
  color: string
  size: number
}
/** Goo left on the glass by a popped gloop; fades away. */
interface Splat {
  x: number
  y: number
  at: number
  color: string
  seed: number
}
interface Streak {
  x: number
  top: number
  bottom: number
  at: number
  color: string
}

const RING_LIFE = 0.4
const SPLAT_LIFE = 2.6
const STREAK_LIFE = 0.22
const LAND_FLASH = 0.16
const JIGGLE = 0.45

export class GloopRenderer {
  readonly particles = new Particles()
  private readonly shake = new Shake(14)
  private readonly still = prefersReducedMotion()
  readonly layout: Layout = layout()
  private readonly bottle: Bottle = bottle(this.layout)
  private time = 0
  private state: GloopState | null = null
  private callouts: Callout[] = []
  private banner: Banner | null = null
  private scoreShown = 0
  private lastTick = -1
  /** Smoothed capsule position (cells), so falling and sliding glide. */
  private vx = 0
  private vy = 0
  private pieceKey = -1
  private junkFlash = -10
  private landBump = 0
  /** Side-panel mascots: when each colour was cleared (or -1), and their last cheer. */
  private mascotDone = [-1, -1, -1]
  private cheer = -10
  private pending: PendingPop[] = []
  private rings: Ring[] = []
  private splats: Splat[] = []
  private streaks: Streak[] = []
  private landed: { cells: number[]; at: number } = { cells: [], at: -10 }
  /** Gloop cell → when it last got bumped by a landing capsule. */
  private jiggle = new Map<number, number>()
  private flashAt = -10
  private scoreBumpAt = -10
  /** Gloops popped by the current capsule (for "Double!" and friends). */
  private capsuleGloops = 0
  /** Gloops the jar started with, for the progress bar. */
  private jarTotal = 0

  constructor(
    private readonly view: Canvas2D,
    private readonly selfId: string,
    private readonly best: () => number,
  ) {
    view.setSize(this.layout.width, this.layout.height)
  }

  /** The jar this screen plays (or watches). */
  myBoard(s: GloopState): Board {
    return boardOf(s, this.selfId) ?? s.boards[0]
  }

  onState(s: GloopState): void {
    this.state = s
    const b = this.myBoard(s)
    if (s.tick < this.lastTick || this.lastTick < 0) {
      // A new match: snap everything.
      this.scoreShown = b.score
      this.callouts = []
      this.banner = null
      this.mascotDone = gloopsByColor(b.cells).map((n) => (n ? -1 : 0))
      this.pieceKey = -1
      this.pending = []
      this.splats = []
      this.jarTotal = b.gloops
    }
    if (b.score > (this.lastScore ?? b.score)) this.scoreBumpAt = this.time
    this.lastScore = b.score
    this.lastTick = s.tick
    this.effects(s, b)
  }

  private lastScore: number | null = null

  private center(x: number, y: number): [number, number] {
    const [px, py] = cellXY(this.layout, x, y)
    return [px + CELL / 2, py + CELL / 2]
  }

  private say(x: number, y: number, text: string, color: string, size = 28, burst = false, life = 1.1) {
    this.callouts.push({ x, y, text, color, size, at: this.time, burst, life })
    if (this.callouts.length > 6) this.callouts.shift()
  }

  private effects(s: GloopState, b: Board) {
    const l = this.layout
    const midX = l.bx + (W * CELL) / 2
    for (const e of s.events) {
      if ('p' in e && e.p !== b.id) continue
      switch (e.type) {
        case 'land':
          this.landBump = e.slam ? 6 : 2.5
          this.capsuleGloops = 0
          this.landed = { cells: e.cells, at: this.time }
          for (const i of e.cells) {
            // Gloops right next to where it landed get a jiggle.
            for (const n of [i - 1, i + 1, i + W, i - W])
              if (n >= 0 && n < b.cells.length && b.cells[n] && isGloop(b.cells[n]))
                this.jiggle.set(n, this.time)
            if (e.slam > 1) {
              const [x, y] = cellXY(this.layout, i % W, Math.floor(i / W))
              this.streaks.push({
                x: x + CELL / 2,
                top: y - e.slam * CELL,
                bottom: y + CELL / 2,
                at: this.time,
                color: GLOOP_COLORS[colorOf(b.cells[i]) < 0 ? 0 : colorOf(b.cells[i])],
              })
            }
          }
          if (e.slam > 1) {
            this.shake.add(0.12 + Math.min(0.15, e.slam * 0.012))
            for (const i of e.cells)
              this.particles.burst(...this.center(i % W, Math.floor(i / W) + 0.5), {
                count: 6,
                color: DUST,
                speed: 90,
                life: 0.35,
                size: 3,
                angle: -Math.PI / 2,
                spread: Math.PI,
                gravity: 300,
              })
          }
          break
        case 'match': {
          const [x, y] = this.centroid(e.cells)
          if (e.chain >= 2) {
            const w = chainWord(e.chain)
            this.say(
              x,
              y - 20,
              t('Chain ×{n}!', { n: e.chain }),
              e.chain >= 3 ? theme.pink : theme.mint,
              w.size,
              w.burst,
            )
            this.cheer = this.time
            if (e.chain >= 3 && !this.still) this.flashAt = this.time
          }
          break
        }
        case 'pop': {
          let gx = 0
          let gy = 0
          let gn = 0
          const step = popStagger(e.cells.length)
          e.cells.forEach(([i, v], k) => {
            this.pending.push({ i, v, at: this.time + k * step })
            if (!isGloop(v)) return
            const [x, y] = this.center(i % W, Math.floor(i / W))
            gx += x
            gy += y
            gn++
          })
          const [cx, cy] = gn ? [gx / gn, gy / gn] : this.centroid(e.cells.map(([i]) => i))
          if (e.points)
            this.say(cx, cy, `+${formatNumber(e.points)}`, theme.yolk, gn ? 26 + Math.min(16, gn * 4) : 20)
          this.shake.add(Math.min(0.5, 0.06 * e.chain + 0.07 * gn))
          if (gn) this.cheer = this.time
          const before = this.capsuleGloops
          this.capsuleGloops += gn
          const word = comboWord(before, this.capsuleGloops)
          if (word) {
            const text =
              word === 'double' ? t('Double!') : word === 'triple' ? t('Triple!') : t('Gloop-tastic!')
            this.say(
              cx,
              cy - 46,
              text,
              word === 'mega' ? theme.pink : theme.mint,
              word === 'mega' ? 44 : 36,
              word !== 'double',
              1.4,
            )
          }
          if (b.gloops === 1 && gn)
            this.say(l.bx + (W * CELL) / 2, l.by + 40, t('Last one!'), theme.yolk, 30, false, 1.6)
          // A colour wiped out: its mascot bursts.
          const left = gloopsByColor(b.cells)
          e.gloops.forEach((n, c) => {
            if (!n || left[c] || this.mascotDone[c] >= 0) return
            this.mascotDone[c] = this.time
            if (!isRace(s))
              this.particles.burst(...this.mascotXY(c), {
                count: 30,
                color: [GLOOP_COLORS[c], '#ffffff'],
                speed: 220,
                life: 0.7,
                size: 5,
                gravity: 300,
              })
          })
          break
        }
        case 'clear':
          this.banner = {
            title: t('Jar clear!'),
            sub: t('+{n} bonus', { n: formatNumber(e.bonus) }),
            color: theme.mint,
            at: this.time,
          }
          this.shake.add(0.45)
          celebrate([...GLOOP_COLORS, theme.mint, theme.pink])
          break
        case 'level':
          this.jarTotal = b.gloops
          this.splats = []
          this.banner = {
            title: t('Level {n}', { n: e.level + 1 }),
            sub: t('Pop every gloop!'),
            color: theme.yolk,
            at: this.time,
          }
          this.mascotDone = gloopsByColor(b.cells).map((n) => (n ? -1 : 0))
          break
        case 'junk':
          this.junkFlash = this.time
          this.shake.add(0.3)
          this.say(midX, l.by + 60, t('Junk!'), theme.coral, 30)
          break
        case 'out':
          this.shake.add(0.5)
          break
      }
      if (e.type === 'attack' && e.from === b.id)
        this.say(midX, l.by + 90, t('Sent {n} junk!', { n: e.n }), theme.mint, 30, true)
    }
  }

  /** One cell bursts: goo spray, a ring, and (for a gloop) a splat on the glass. */
  private burst(i: number, v: number) {
    const [x, y] = this.center(i % W, Math.floor(i / W))
    const color = GLOOP_COLORS[colorOf(v)]
    const gloop = isGloop(v)
    this.particles.burst(x, y, {
      count: gloop ? 18 : 9,
      color: [color, '#ffffff', color],
      speed: gloop ? 260 : 170,
      life: 0.55,
      size: gloop ? 5 : 4,
      gravity: 520,
    })
    this.rings.push({
      x,
      y,
      at: this.time,
      color: gloop ? '#ffffff' : color,
      size: gloop ? CELL * 1.5 : CELL,
    })
    if (!gloop) return
    this.particles.burst(x, y, { count: 8, color, speed: 80, life: 0.8, size: 7, gravity: 260 })
    this.splats.push({ x, y, at: this.time, color, seed: i })
    if (this.splats.length > 24) this.splats.shift()
  }

  private centroid(cells: readonly number[]): [number, number] {
    if (!cells.length) return this.center(W / 2, H / 2)
    let x = 0
    let y = 0
    for (const i of cells) {
      const [cx, cy] = this.center(i % W, Math.floor(i / W))
      x += cx
      y += cy
    }
    return [x / cells.length, y / cells.length]
  }

  // ---------- Frame ----------

  frame(dt: number): void {
    this.time += dt
    this.particles.update(dt)
    this.shake.update(dt)
    this.landBump = damp(this.landBump, 0, 16, dt)
    // Pops due now burst; a cell something has fallen into bursts at once.
    this.pending = this.pending.filter((p) => {
      if (p.at > this.time && !(this.state && this.myBoard(this.state).cells[p.i])) return true
      this.burst(p.i, p.v)
      return false
    })
    this.rings = this.rings.filter((r) => this.time - r.at < RING_LIFE)
    this.streaks = this.streaks.filter((r) => this.time - r.at < STREAK_LIFE)
    this.splats = this.splats.filter((r) => this.time - r.at < SPLAT_LIFE)
    const { ctx } = this.view
    ctx.clearRect(0, 0, this.view.width, this.view.height)
    const s = this.state
    if (!s) return
    const b = this.myBoard(s)
    this.scoreShown =
      Math.abs(b.score - this.scoreShown) < 1 ? b.score : damp(this.scoreShown, b.score, 10, dt)
    this.trackPiece(b, dt)
    this.drawPanel(ctx, s, b)
    ctx.save()
    this.shake.apply(ctx)
    ctx.translate(0, this.landBump * 0.5)
    this.drawJar(ctx, b)
    this.drawStreaks(ctx)
    this.drawCells(ctx, b)
    this.drawPending(ctx)
    this.drawPiece(ctx, b)
    this.drawIncoming(ctx, b)
    this.drawRings(ctx)
    this.particles.draw(ctx)
    this.drawCallouts(ctx)
    ctx.restore()
    this.drawBanner(ctx)
    this.drawStatus(ctx, s, b)
    const flash = 1 - clamp01((this.time - this.flashAt) / 0.25)
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.28 * flash})`
      ctx.fillRect(0, 0, this.view.width, this.view.height)
    }
  }

  private trackPiece(b: Board, dt: number) {
    const p = b.piece
    if (!p) return
    const key = b.pieces
    if (key !== this.pieceKey || this.still) {
      this.pieceKey = key
      this.vx = p.x
      this.vy = p.y
      return
    }
    this.vx = damp(this.vx, p.x, 40, dt)
    this.vy = damp(this.vy, p.y, 30, dt)
    if (Math.abs(this.vy - p.y) > 2) this.vy = p.y
  }

  private drawJar(ctx: CanvasRenderingContext2D, b: Board) {
    const l = this.layout
    const w = W * CELL
    const h = H * CELL
    const danger = b.phase === 'fall' || b.phase === 'spawn' ? inDanger(b.cells) : false
    const pulse = danger ? 0.5 + 0.5 * Math.sin(this.time * 9) : 0
    const junk = 1 - clamp01((this.time - this.junkFlash) / 0.6)
    const glass = this.bottle
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
    ctx.shadowBlur = 22
    ctx.shadowOffsetY = 8
    ctx.fillStyle = theme.pit
    bottlePath(ctx, glass)
    ctx.fill()
    ctx.restore()
    // Fizzy liquid up to the shoulders (the neck stays empty glass), with rising bubbles.
    ctx.save()
    bottlePath(ctx, glass)
    ctx.clip()
    const liquid = ctx.createLinearGradient(0, l.by, 0, glass.bottom)
    liquid.addColorStop(0, 'rgba(90, 184, 255, 0.03)')
    liquid.addColorStop(1, 'rgba(75, 227, 160, 0.12)')
    ctx.fillStyle = liquid
    ctx.fillRect(glass.left, l.by - 4, glass.right - glass.left, glass.bottom - l.by + 4)
    ctx.fillStyle = 'rgba(90, 184, 255, 0.18)'
    ctx.fillRect(glass.left, l.by - 4, glass.right - glass.left, 2)
    this.drawSplats(ctx)
    ctx.restore()
    if (!this.still) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'
      for (let k = 0; k < 14; k++) {
        const speed = 18 + (k % 5) * 7
        const y = l.by + h - ((this.time * speed + k * 97) % h)
        const x = l.bx + ((k * 53) % w) + Math.sin(this.time * 2 + k) * 4
        ctx.beginPath()
        ctx.arc(x, y, 2 + (k % 3), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // Grid dots.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const [cx, cy] = this.center(x, y)
        ctx.beginPath()
        ctx.arc(cx, cy, 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
    // Glass rim: red when in danger or hit by junk.
    const hot = Math.max(pulse, junk)
    const rim = hot > 0.02 ? `rgba(255, 107, 107, ${0.45 + hot * 0.55})` : theme.rim
    ctx.lineWidth = 4 + hot * 3
    ctx.lineJoin = 'round'
    ctx.strokeStyle = rim
    bottlePath(ctx, glass)
    ctx.stroke()
    // The lip around the neck's mouth.
    ctx.fillStyle = rim
    ctx.beginPath()
    ctx.roundRect(glass.neckL - glass.lip, glass.neckY - 6, glass.neckR - glass.neckL + glass.lip * 2, 14, 7)
    ctx.fill()
    // Glass shine: a long streak down the body and a short one on the neck.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.beginPath()
    ctx.roundRect(l.bx + 6, l.by + 14, 10, h - 60, 5)
    ctx.roundRect(glass.neckL + 8, glass.neckY + 14, 6, glass.neckBase - glass.neckY - 10, 3)
    ctx.fill()
    if (danger) {
      const g = ctx.createLinearGradient(0, l.by, 0, l.by + CELL * 4)
      g.addColorStop(0, `rgba(255, 107, 107, ${0.18 + pulse * 0.18})`)
      g.addColorStop(1, 'rgba(255, 107, 107, 0)')
      ctx.fillStyle = g
      ctx.fillRect(l.bx, l.by, w, CELL * 4)
    }
  }

  private drawCells(ctx: CanvasRenderingContext2D, b: Board) {
    const popping = new Set(b.phase === 'pop' ? b.popping : [])
    const flash = popping.size ? (Math.floor(this.time * 16) % 2 ? 0.75 : 0.15) : 0
    // Gloops look at the falling capsule (or wince when a neighbour pops).
    const p = b.piece
    const fx = p ? this.vx + 0.5 : W / 2
    const fy = p ? this.vy : -2
    const mood: Mood = this.time - this.cheer < 0.6 ? 'scared' : 'happy'
    const landFlash = 1 - clamp01((this.time - this.landed.at) / LAND_FLASH)
    const justLanded = new Set(landFlash > 0 ? this.landed.cells : [])
    const last = b.gloops === 1 && b.phase !== 'clear'
    for (let i = 0; i < b.cells.length; i++) {
      const v = b.cells[i]
      if (!v) continue
      const x = i % W
      const y = Math.floor(i / W)
      const [px, py] = cellXY(this.layout, x, y)
      const pop = popping.has(i)
      const f = pop ? flash : justLanded.has(i) ? landFlash * 0.7 : 0
      if (isGloop(v)) {
        if (last && !pop) this.drawSpotlight(ctx, px + CELL / 2, py + CELL / 2)
        const dx = fx - x
        const dy = fy - y
        const d = Math.hypot(dx, dy) || 1
        const bumped = this.time - (this.jiggle.get(i) ?? -10)
        const wobble =
          bumped < JIGGLE && !this.still ? Math.sin(bumped * 40) * 0.12 * (1 - bumped / JIGGLE) : 0
        const swell = pop && !this.still ? 1 + 0.15 * Math.sin(this.time * 30) : 1 + wobble
        drawGloop(
          ctx,
          px + CELL / 2,
          py + CELL / 2,
          CELL * swell,
          colorOf(v),
          this.time,
          i,
          pop ? 'dead' : mood,
          [dx / d, dy / d],
          f,
        )
      } else if (justLanded.has(i) && !this.still) {
        // Squash on landing: a touch wider and flatter, settling back.
        const k = landFlash * 0.12
        ctx.save()
        ctx.translate(px + CELL / 2, py + CELL)
        ctx.scale(1 + k, 1 - k)
        drawPill(ctx, -CELL / 2, -CELL, CELL, colorOf(v), linkOf(v), f)
        ctx.restore()
      } else drawPill(ctx, px, py, CELL, colorOf(v), linkOf(v), f)
    }
  }

  /** Cells popped but still waiting for their turn to burst: flashing white. */
  private drawPending(ctx: CanvasRenderingContext2D) {
    for (const p of this.pending) {
      const [px, py] = cellXY(this.layout, p.i % W, Math.floor(p.i / W))
      if (isGloop(p.v))
        drawGloop(
          ctx,
          px + CELL / 2,
          py + CELL / 2,
          CELL * 1.1,
          colorOf(p.v),
          this.time,
          p.i,
          'dead',
          [0, 0],
          0.8,
        )
      else drawPill(ctx, px, py, CELL, colorOf(p.v), 0, 0.8)
    }
  }

  private drawRings(ctx: CanvasRenderingContext2D) {
    for (const r of this.rings) {
      const k = clamp01((this.time - r.at) / RING_LIFE)
      ctx.strokeStyle = r.color
      ctx.globalAlpha = 1 - k
      ctx.lineWidth = 4 * (1 - k) + 1
      ctx.beginPath()
      ctx.arc(r.x, r.y, r.size * (0.3 + ease.outCubic(k) * 0.7), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  /** Goo splats left on the glass, a blob with drips, fading out. */
  private drawSplats(ctx: CanvasRenderingContext2D) {
    for (const sp of this.splats) {
      const age = this.time - sp.at
      const k = clamp01(age / SPLAT_LIFE)
      ctx.globalAlpha = 0.3 * (1 - k)
      ctx.fillStyle = sp.color
      ctx.beginPath()
      for (let n = 0; n < 5; n++) {
        const a = sp.seed * 1.7 + n * 1.3
        const r = CELL * (0.18 + ((sp.seed * 7 + n * 3) % 5) * 0.04)
        ctx.moveTo(sp.x + Math.cos(a) * CELL * 0.35 + r, sp.y + Math.sin(a) * CELL * 0.3)
        ctx.arc(sp.x + Math.cos(a) * CELL * 0.35, sp.y + Math.sin(a) * CELL * 0.3, r, 0, Math.PI * 2)
      }
      // Drips run down the glass.
      const drip = Math.min(CELL * 1.2, age * 22)
      ctx.rect(sp.x - 2, sp.y, 4, drip)
      ctx.rect(sp.x + 7, sp.y, 3, drip * 0.6)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /** Speed lines behind a hard-dropped capsule. */
  private drawStreaks(ctx: CanvasRenderingContext2D) {
    for (const st of this.streaks) {
      const k = clamp01((this.time - st.at) / STREAK_LIFE)
      const g = ctx.createLinearGradient(0, st.top, 0, st.bottom)
      g.addColorStop(0, 'rgba(255, 255, 255, 0)')
      g.addColorStop(1, st.color)
      ctx.globalAlpha = 0.5 * (1 - k)
      ctx.fillStyle = g
      ctx.fillRect(
        st.x - CELL * 0.32,
        Math.max(this.layout.by, st.top),
        CELL * 0.64,
        st.bottom - Math.max(this.layout.by, st.top),
      )
    }
    ctx.globalAlpha = 1
  }

  /** A pulsing ring around the very last gloop. */
  private drawSpotlight(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const p = this.still ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 6)
    ctx.strokeStyle = theme.yolk
    ctx.globalAlpha = 0.4 + 0.5 * p
    ctx.lineWidth = 3
    ctx.setLineDash([6, 5])
    ctx.lineDashOffset = -this.time * 20
    ctx.beginPath()
    ctx.arc(x, y, CELL * (0.75 + 0.1 * p), 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  private drawPiece(ctx: CanvasRenderingContext2D, b: Board) {
    const p = b.piece
    if (!p || b.phase !== 'fall') return
    // Ghost: where it lands.
    const g = landing(b.cells, p)
    if (g.y !== p.y) {
      ctx.save()
      ctx.globalAlpha = 0.28
      for (const c of pieceCells(g)) {
        if (c.y < 0) continue
        const [x, y] = cellXY(this.layout, c.x, c.y)
        ctx.strokeStyle = GLOOP_COLORS[c.color]
        ctx.lineWidth = 2.5
        ctx.setLineDash([5, 4])
        ctx.beginPath()
        ctx.roundRect(x + 4, y + 4, CELL - 8, CELL - 8, 8)
        ctx.stroke()
      }
      ctx.restore()
    }
    const ox = (this.vx - p.x) * CELL
    const oy = (this.vy - p.y) * CELL
    ctx.save()
    ctx.translate(ox, oy)
    ctx.shadowColor = 'rgba(255, 255, 255, 0.35)'
    ctx.shadowBlur = 10
    for (const c of pieceCells(p)) {
      if (c.y < 0) continue
      const [x, y] = cellXY(this.layout, c.x, c.y)
      drawPill(ctx, x, y, CELL, c.color, c.link)
    }
    ctx.restore()
  }

  /** Junk on the way, shown over the jar's neck. */
  private drawIncoming(ctx: CanvasRenderingContext2D, b: Board) {
    if (!b.incoming.length) return
    const l = this.layout
    // Junk waits in the bottle's neck.
    const glass = this.bottle
    const s = 18
    const n = Math.min(6, b.incoming.length)
    const x0 = l.bx + (W * CELL - n * (s + 3)) / 2
    const bob = this.still ? 0 : Math.sin(this.time * 8) * 2
    b.incoming.slice(0, n).forEach((c, k) => drawPill(ctx, x0 + k * (s + 3), glass.neckY + 16 + bob, s, c, 0))
  }

  // ---------- Side panel ----------

  private drawPanel(ctx: CanvasRenderingContext2D, s: GloopState, b: Board) {
    const l = this.layout
    const x = l.px
    ctx.fillStyle = theme.felt
    ctx.strokeStyle = theme.rim
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(x, l.py - 8, l.pw, l.ph + 16, 14)
    ctx.fill()
    ctx.stroke()
    const mid = x + l.pw / 2
    const inner = l.pw - 24
    const cx = x + 12
    // Next capsule, in its own little window.
    this.card(ctx, cx, l.py + 4, inner, 80)
    this.label(ctx, t('Next'), mid, l.py + 20)
    const [na, nb] = b.next
    const bob = this.still ? 0 : Math.sin(this.time * 3) * 2
    drawPill(ctx, mid - CELL, l.py + 36 + bob, CELL, na, 2)
    drawPill(ctx, mid, l.py + 36 + bob, CELL, nb, 1)
    // Score: bumps when it goes up.
    const bump = this.still ? 0 : 1 - clamp01((this.time - this.scoreBumpAt) / 0.25)
    this.card(ctx, cx, l.py + 94, inner, 62)
    this.label(ctx, t('Score'), mid, l.py + 110)
    this.value(
      ctx,
      formatNumber(Math.round(this.scoreShown)),
      mid,
      l.py + 136,
      theme.yolk,
      28 * (1 + bump * 0.18),
    )
    // Level and best (race: just the level).
    const half = (inner - 8) / 2
    const pairs: [string, string, string][] = [[t('Level'), String(b.level + 1), theme.chalk]]
    if (!isRace(s)) pairs.push([t('Best'), formatNumber(Math.max(this.best(), b.score)), theme.haze])
    pairs.forEach(([name, val, color], k) => {
      const w = pairs.length === 1 ? inner : half
      const bx = cx + k * (half + 8)
      this.card(ctx, bx, l.py + 166, w, 58)
      this.label(ctx, name, bx + w / 2, l.py + 182)
      this.value(ctx, val, bx + w / 2, l.py + 206, color, val.length > 6 ? 17 : 22)
    })
    // Gloops left, with the jar's progress.
    this.card(ctx, cx, l.py + 234, inner, 72)
    this.label(ctx, t('Gloops'), mid, l.py + 250)
    this.value(ctx, formatNumber(Math.max(0, b.gloops)), mid, l.py + 274, theme.mint, 24)
    const total = Math.max(1, this.jarTotal, b.gloops)
    const done = clamp01(1 - Math.max(0, b.gloops) / total)
    const barX = cx + 12
    const barW = inner - 24
    ctx.fillStyle = theme.night
    ctx.beginPath()
    ctx.roundRect(barX, l.py + 290, barW, 8, 4)
    ctx.fill()
    if (done > 0) {
      ctx.fillStyle = theme.mint
      ctx.beginPath()
      ctx.roundRect(barX, l.py + 290, Math.max(8, barW * done), 8, 4)
      ctx.fill()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.fillRect(barX + 4, l.py + 291, Math.max(0, barW * done - 8), 2)
    }
    if (isRace(s)) this.drawRivals(ctx, s, b)
    else this.drawMascots(ctx, b)
  }

  private card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.fillStyle = theme.pit
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 10)
    ctx.fill()
  }

  private value(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
    size: number,
  ) {
    ctx.fillStyle = color
    ctx.font = `700 ${size}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
    ctx.fillStyle = theme.haze
    ctx.font = `600 12px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text.toUpperCase(), x, y)
  }

  private mascotXY(c: number): [number, number] {
    const l = this.layout
    return [l.px + l.pw * ((c + 0.5) / COLORS), l.py + l.ph - 64]
  }

  /** Three big gloops that dance to the beat, wince at chains and burst when their colour is gone. */
  private drawMascots(ctx: CanvasRenderingContext2D, b: Board) {
    const left = gloopsByColor(b.cells)
    const beat = this.still ? 0 : Math.abs(Math.sin(this.time * Math.PI * (124 / 60)))
    const cheering = this.time - this.cheer < 0.8
    for (let c = 0; c < COLORS; c++) {
      const [x, y] = this.mascotXY(c)
      const done = this.mascotDone[c]
      if (done >= 0 && !left[c]) {
        // Burst, then a little star where it was.
        const age = this.time - done
        if (age < 0.5) {
          const k = 1 - age / 0.5
          drawGloop(ctx, x, y, 54 * (1 + (1 - k) * 0.6), c, this.time, c * 3, 'dead', [0, 0], 1 - k)
        } else {
          ctx.fillStyle = theme.mint
          ctx.font = `700 30px ${FONT}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('✓', x, y)
        }
        continue
      }
      const hop = cheering ? Math.abs(Math.sin(this.time * 18 + c)) * 10 : beat * 6 * (c % 2 ? 1 : 0.6)
      const mood: Mood = cheering ? 'scared' : 'happy'
      drawGloop(ctx, x, y - hop, 54, c, this.time, c * 3, mood, [Math.sin(this.time + c) * 0.6, 0.2])
      ctx.fillStyle = theme.chalk
      ctx.font = `700 16px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`×${left[c]}`, x, y + 40)
    }
  }

  private drawRivals(ctx: CanvasRenderingContext2D, s: GloopState, b: Board) {
    const rivals = s.boards.filter((o) => o !== b).slice(0, 3)
    rivals.forEach((o, k) => {
      const box = rivalBox(this.layout, k, rivals.length)
      const w = W * box.cell
      const h = H * box.cell
      ctx.fillStyle = theme.pit
      ctx.beginPath()
      ctx.roundRect(box.x - 3, box.y - 3, w + 6, h + 6, 6)
      ctx.fill()
      drawMini(ctx, o.cells, box.x, box.y, box.cell)
      ctx.strokeStyle = o.slot >= 0 ? playerColor(o.slot) : theme.haze
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(box.x - 3, box.y - 3, w + 6, h + 6, 6)
      ctx.stroke()
      ctx.fillStyle = theme.chalk
      ctx.font = `600 12px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const name = o.name.length > 9 ? o.name.slice(0, 8) + '…' : o.name
      ctx.fillText(name, box.x + w / 2, box.y - 14)
      ctx.fillStyle = theme.mint
      ctx.fillText(`×${o.gloops}`, box.x + w / 2, box.y + h + 14)
      if (o.phase === 'out') {
        ctx.fillStyle = 'rgba(16, 19, 44, 0.7)'
        ctx.fillRect(box.x, box.y, w, h)
        ctx.fillStyle = theme.coral
        ctx.font = `700 14px ${FONT}`
        ctx.fillText(o.left ? t('Left') : t('Out'), box.x + w / 2, box.y + h / 2)
      }
    })
  }

  // ---------- Overlays ----------

  private drawCallouts(ctx: CanvasRenderingContext2D) {
    this.callouts = this.callouts.filter((c) => this.time - c.at < c.life)
    for (const c of this.callouts) {
      const age = (this.time - c.at) / c.life
      const pop = this.still ? 1 : age < 0.15 ? ease.outBack(age / 0.15) : 1
      const y = c.y - age * 36
      ctx.save()
      ctx.globalAlpha = age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1
      ctx.translate(c.x, y)
      ctx.scale(pop, pop)
      if (c.burst) {
        ctx.fillStyle = theme.coral
        ctx.beginPath()
        const n = 12
        for (let i = 0; i <= n * 2; i++) {
          const a = (i / (n * 2)) * Math.PI * 2 + this.time * 2
          const r = (i % 2 ? 0.55 : 0.85) * c.size * 1.6
          ctx.lineTo(Math.cos(a) * r * 1.4, Math.sin(a) * r * 0.7)
        }
        ctx.closePath()
        ctx.fill()
      }
      ctx.font = `700 ${c.size}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 6
      ctx.lineJoin = 'round'
      ctx.strokeStyle = theme.night
      ctx.strokeText(c.text, 0, 0)
      ctx.fillStyle = c.color
      ctx.fillText(c.text, 0, 0)
      ctx.restore()
    }
  }

  private drawBanner(ctx: CanvasRenderingContext2D) {
    const bn = this.banner
    if (!bn) return
    const age = this.time - bn.at
    if (age > 2.2) {
      this.banner = null
      return
    }
    const l = this.layout
    const cx = l.bx + (W * CELL) / 2
    const cy = l.by + H * CELL * 0.4
    const k = this.still ? 1 : ease.outBack(clamp01(age / 0.3))
    ctx.save()
    ctx.globalAlpha = age > 1.8 ? 1 - (age - 1.8) / 0.4 : 1
    ctx.fillStyle = 'rgba(16, 19, 44, 0.82)'
    ctx.beginPath()
    ctx.roundRect(l.bx + 6, cy - 50 * k, W * CELL - 12, 100 * k, 16)
    ctx.fill()
    ctx.translate(cx, cy)
    ctx.scale(k, k)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 40px ${FONT}`
    ctx.fillStyle = bn.color
    ctx.fillText(bn.title, 0, -12)
    ctx.font = `600 18px ${FONT}`
    ctx.fillStyle = theme.chalk
    ctx.fillText(bn.sub, 0, 26)
    ctx.restore()
  }

  /** Out (or waiting for the others) over your jar. */
  private drawStatus(ctx: CanvasRenderingContext2D, s: GloopState, b: Board) {
    if (b.phase !== 'out' && b.phase !== 'won') return
    const l = this.layout
    const w = W * CELL
    const h = H * CELL
    ctx.fillStyle = 'rgba(16, 19, 44, 0.66)'
    ctx.fillRect(l.bx, l.by, w, h)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 40px ${FONT}`
    ctx.fillStyle = b.phase === 'won' ? theme.mint : theme.coral
    ctx.fillText(b.phase === 'won' ? t('Jar clear!') : t('Jar full!'), l.bx + w / 2, l.by + h / 2 - 14)
    if (isRace(s) && !s.over && b.phase === 'out') {
      ctx.font = `500 18px ${FONT}`
      ctx.fillStyle = theme.haze
      ctx.fillText(t('Watch the others finish'), l.bx + w / 2, l.by + h / 2 + 26)
    }
  }
}

/** A tiny jar: gloops as dots, halves as squares. */
export function drawMini(
  ctx: CanvasRenderingContext2D,
  cells: Cells,
  x0: number,
  y0: number,
  cell: number,
): void {
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i]
    if (!v) continue
    const x = x0 + (i % W) * cell
    const y = y0 + Math.floor(i / W) * cell
    ctx.fillStyle = GLOOP_COLORS[colorOf(v)]
    if (isGloop(v)) {
      ctx.beginPath()
      ctx.arc(x + cell / 2, y + cell / 2, cell * 0.45, 0, Math.PI * 2)
      ctx.fill()
    } else ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1)
  }
}
