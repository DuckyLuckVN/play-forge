import { Particles } from '@forge/fx/particles'
import { Shake } from '@forge/fx/shake'
import { clamp01, ease, prefersReducedMotion } from '@forge/fx/tween'
import type { Canvas2D } from '@forge/render2d/canvas'
import { FONT, theme } from '@forge/ui/theme'
import type { Side } from './rules'
import type { CaroState, Seat } from './sim'
import { INKS, PEN_SIZES, type Whiteboard } from './whiteboard'

// ---------- Layout (logical units; the canvas scales to fit) ----------

export const CELL = 40
const PAD = 18
const HUD = 96

export interface Layout {
  width: number
  height: number
  /** Top-left corner of cell (0, 0). */
  x: number
  y: number
  size: number
}

export function layoutFor(size: number): Layout {
  return { width: size * CELL + PAD * 2, height: HUD + size * CELL + PAD * 2, x: PAD, y: HUD + PAD, size }
}

/** Board cell under a logical point, or -1. */
export function cellAt(l: Layout, px: number, py: number): number {
  const cx = Math.floor((px - l.x) / CELL)
  const cy = Math.floor((py - l.y) / CELL)
  return cx < 0 || cy < 0 || cx >= l.size || cy >= l.size ? -1 : cy * l.size + cx
}

/** A logical point in board-cell units (fractional), for the whiteboard. */
export const toCells = (l: Layout, px: number, py: number): [number, number] => [
  (px - l.x) / CELL,
  (py - l.y) / CELL,
]

// ---------- Look ----------

export const INK: Record<Side, string> = { 1: '#e5484d', 2: '#2f6fe4' }
const PAPER = '#fdfaf1'
const GRID = '#c6d4ec'
const LAST = 'rgba(255, 214, 92, 0.42)'
const GOLD = '#ffc83d'

/** Per-frame inputs that live outside the game state. */
export interface ViewInput {
  /** Sides the local player moves (both in pass and play, none for a spectator). */
  mine: Side[]
  /** The local player may place a stone now. */
  canPlay: boolean
  hover: number
  /** Touch: the cell waiting for a second tap to confirm. */
  preview: number
  /** Keyboard cursor, or -1. */
  cursor: number
  /** Sent but not yet confirmed by the host. */
  pending: number
  pen: boolean
  /** Wins this session, by tally key (see `tallyKey`). */
  wins: Map<string, number>
  /** Display names for the two seats. */
  names: [string, string]
  /** One line under the players: whose turn, thinking, result. */
  status: string
  statusColor: string
}

/** Wins are counted per seat; in pass and play both seats share an id, so add the side. */
export const tallyKey = (seat: Seat, side: Side) => `${seat.id}:${side}`

/** Small seeded wobble so hand-drawn marks don't look stamped. */
const wobble = (cell: number, k: number) => Math.sin(cell * 12.9898 + k * 78.233) * 0.5

export class CaroRenderer {
  private layout: Layout
  private state: CaroState | null = null
  private moveCount = 0
  /** When each stone appeared (seconds), for the draw-in animation. */
  private born = new Map<number, number>()
  private winAt = 0
  private fourAt = -10
  private fourCell = -1
  private time = 0
  readonly particles = new Particles()
  private shake = new Shake(9)
  private callouts: { x: number; y: number; text: string; color: string; at: number }[] = []

  constructor(
    private view: Canvas2D,
    private wb: Whiteboard,
  ) {
    this.layout = layoutFor(15)
  }

  get currentLayout(): Layout {
    return this.layout
  }

  /** Feed every new state; works out what to animate. */
  onState(s: CaroState): void {
    // Compare plain numbers: on the host the state is one object mutated in place.
    const resized = s.size !== this.layout.size || !this.state
    if (resized) {
      this.layout = layoutFor(s.size)
      this.view.setSize(this.layout.width, this.layout.height)
    }
    if (resized || s.moves.length < this.moveCount) {
      // New match or undo: stones still on the board stay drawn; new ones animate.
      const keep = new Map<number, number>()
      for (const c of s.moves) keep.set(c, this.born.get(c) ?? -10)
      this.born = keep
      if (!s.moves.length) this.particles.clear()
    }
    this.moveCount = s.moves.length
    for (const e of s.events) {
      if (e.type === 'place') {
        this.born.set(e.cell, this.time)
        const [x, y] = this.center(e.cell)
        this.particles.burst(x, y, { count: 7, color: INK[e.side], speed: 70, life: 0.35, size: 3.5 })
        this.shake.add(0.06)
      } else if (e.type === 'four') {
        this.fourAt = this.time
        this.fourCell = s.moves.at(-1) ?? -1
      } else if (e.type === 'win') {
        this.winAt = this.time
        this.shake.add(0.5)
        s.line.forEach((c, i) => {
          const [x, y] = this.center(c)
          setTimeout(
            () =>
              this.particles.burst(x, y, {
                count: 14,
                color: [GOLD, INK[e.side], '#fff'],
                speed: 160,
                life: 0.8,
                size: 5,
                shape: 'square',
                gravity: 120,
              }),
            120 + i * 60,
          )
        })
      }
    }
    this.state = s
  }

  /** Floating words over a cell (e.g. "Four!"), outlined so they read over the stones. */
  say(cell: number, text: string, color: string): void {
    const [x, y] = this.center(cell)
    // Keep the word on the paper near the edges.
    const l = this.layout
    const cx = Math.min(Math.max(x, l.x + CELL * 2), l.x + l.size * CELL - CELL * 2)
    this.callouts.push({
      x: cx,
      y: Math.max(this.layout.y + CELL * 0.4, y - CELL * 0.9),
      text,
      color,
      at: this.time,
    })
  }

  private drawCallouts(ctx: CanvasRenderingContext2D) {
    const LIFE = 1.2
    this.callouts = this.callouts.filter((c) => this.time - c.at < LIFE)
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    for (const c of this.callouts) {
      const t = (this.time - c.at) / LIFE
      const pop = t < 0.15 ? ease.outBack(t / 0.15) : 1
      ctx.globalAlpha = 1 - ease.inCubic(t)
      ctx.font = `700 ${Math.round(24 * pop)}px ${FONT}`
      const y = c.y - 26 * t
      ctx.lineWidth = 6
      ctx.strokeStyle = theme.night
      ctx.strokeText(c.text, c.x, y)
      ctx.fillStyle = c.color
      ctx.fillText(c.text, c.x, y)
    }
    ctx.restore()
  }

  center(cell: number): [number, number] {
    const l = this.layout
    return [l.x + (cell % l.size) * CELL + CELL / 2, l.y + Math.floor(cell / l.size) * CELL + CELL / 2]
  }

  frame(dt: number, ui: ViewInput): void {
    this.time += dt
    this.particles.update(dt)
    this.shake.update(dt)
    const { ctx } = this.view
    const l = this.layout
    ctx.clearRect(0, 0, l.width, l.height)
    const s = this.state
    if (!s) return
    this.drawHud(ctx, s, ui)
    ctx.save()
    this.shake.apply(ctx)
    this.drawPaper(ctx)
    this.drawHighlights(ctx, s, ui)
    for (const c of s.moves)
      this.drawMark(ctx, c, s.board[c] as Side, clamp01((this.time - (this.born.get(c) ?? -10)) / 0.22))
    this.drawGhosts(ctx, s, ui)
    if (s.over && s.line.length) this.drawStrike(ctx, s)
    this.drawInk(ctx)
    this.particles.draw(ctx)
    this.drawCallouts(ctx)
    ctx.restore()
  }

  // ---------- Board ----------

  private drawPaper(ctx: CanvasRenderingContext2D) {
    const l = this.layout
    const w = l.size * CELL
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 6
    ctx.fillStyle = PAPER
    roundRect(ctx, l.x - 8, l.y - 8, w + 16, w + 16, 14)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = GRID
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i <= l.size; i++) {
      const p = i * CELL + 0.5
      ctx.moveTo(l.x + p, l.y)
      ctx.lineTo(l.x + p, l.y + w)
      ctx.moveTo(l.x, l.y + p)
      ctx.lineTo(l.x + w, l.y + p)
    }
    ctx.stroke()
    // A notebook margin line, for the school-desk feel.
    ctx.strokeStyle = 'rgba(229, 72, 77, 0.25)'
    ctx.beginPath()
    ctx.moveTo(l.x + 0.5 - 4, l.y - 8)
    ctx.lineTo(l.x + 0.5 - 4, l.y + w + 8)
    ctx.stroke()
  }

  private cellRect(cell: number): [number, number] {
    const l = this.layout
    return [l.x + (cell % l.size) * CELL, l.y + Math.floor(cell / l.size) * CELL]
  }

  private drawHighlights(ctx: CanvasRenderingContext2D, s: CaroState, ui: ViewInput) {
    const last = s.moves.at(-1)
    if (last !== undefined) {
      const [x, y] = this.cellRect(last)
      ctx.fillStyle = LAST
      ctx.fillRect(x + 1, y + 1, CELL - 1, CELL - 1)
    }
    // A four: a pulsing ring around the stone that made it.
    const since = this.time - this.fourAt
    if (since < 1.4 && this.fourCell >= 0 && !s.over) {
      const [x, y] = this.center(this.fourCell)
      const t = since / 1.4
      ctx.strokeStyle = `rgba(255, 140, 0, ${1 - t})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(x, y, CELL * (0.45 + 0.5 * ease.outCubic(t)), 0, Math.PI * 2)
      ctx.stroke()
    }
    if (s.over && s.line.length) {
      const pulse = prefersReducedMotion() ? 0.5 : 0.35 + 0.25 * Math.sin(this.time * 6)
      ctx.fillStyle = `rgba(255, 200, 61, ${pulse})`
      for (const c of s.line) {
        const [x, y] = this.cellRect(c)
        ctx.fillRect(x + 1, y + 1, CELL - 1, CELL - 1)
      }
    }
    if (ui.cursor >= 0 && !ui.pen) {
      const [x, y] = this.cellRect(ui.cursor)
      ctx.strokeStyle = theme.yolkEdge
      ctx.lineWidth = 2
      ctx.setLineDash([5, 4])
      ctx.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6)
      ctx.setLineDash([])
    }
  }

  private drawGhosts(ctx: CanvasRenderingContext2D, s: CaroState, ui: ViewInput) {
    if (ui.pending >= 0 && !s.board[ui.pending]) this.drawMark(ctx, ui.pending, s.turn, 1, 0.5)
    if (!ui.canPlay || ui.pen) return
    if (ui.preview >= 0 && !s.board[ui.preview]) {
      const pulse = 0.45 + 0.2 * Math.sin(this.time * 8)
      this.drawMark(ctx, ui.preview, s.turn, 1, pulse)
      const [x, y] = this.cellRect(ui.preview)
      ctx.strokeStyle = INK[s.turn]
      ctx.lineWidth = 2
      ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4)
    }
    const ghost = ui.hover >= 0 ? ui.hover : ui.cursor
    if (ghost >= 0 && ghost !== ui.preview && !s.board[ghost]) this.drawMark(ctx, ghost, s.turn, 1, 0.25)
  }

  /** X as two pen strokes, O as one loop; `t` 0..1 draws them in. */
  private drawMark(ctx: CanvasRenderingContext2D, cell: number, side: Side, t: number, alpha = 1) {
    if (t <= 0) return
    const [cx, cy] = this.center(cell)
    const r = CELL * 0.3
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = INK[side]
    ctx.lineWidth = CELL * 0.11
    ctx.lineCap = 'round'
    ctx.beginPath()
    if (side === 1) {
      const a = ease.outCubic(clamp01(t * 2))
      const b = ease.outCubic(clamp01(t * 2 - 1))
      const j = wobble(cell, 1) * 2
      ctx.moveTo(cx - r, cy - r + j)
      ctx.lineTo(cx - r + 2 * r * a, cy - r + j + (2 * r - j) * a)
      if (b > 0) {
        ctx.moveTo(cx + r, cy - r - j)
        ctx.lineTo(cx + r - 2 * r * b, cy - r - j + (2 * r + j) * b)
      }
    } else {
      const start = -Math.PI / 2 + wobble(cell, 2)
      ctx.ellipse(
        cx,
        cy,
        r * 1.02,
        r * 0.95,
        wobble(cell, 3) * 0.3,
        start,
        start + Math.PI * 2 * ease.outCubic(t),
      )
    }
    ctx.stroke()
    ctx.restore()
  }

  private drawStrike(ctx: CanvasRenderingContext2D, s: CaroState) {
    const t = ease.outCubic(clamp01((this.time - this.winAt) / 0.4))
    const [x0, y0] = this.center(s.line[0])
    const [x1, y1] = this.center(s.line.at(-1)!)
    // Overshoot both ends a little, like a pen stroke.
    const dx = (x1 - x0) / Math.max(1, s.line.length - 1)
    const dy = (y1 - y0) / Math.max(1, s.line.length - 1)
    const ax = x0 - dx * 0.45
    const ay = y0 - dy * 0.45
    const bx = x1 + dx * 0.45
    const by = y1 + dy * 0.45
    ctx.save()
    ctx.lineCap = 'round'
    ctx.shadowColor = GOLD
    ctx.shadowBlur = 16
    ctx.strokeStyle = INK[s.winner as Side] ?? GOLD
    ctx.lineWidth = CELL * 0.14
    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(ax + (bx - ax) * t, ay + (by - ay) * t)
    ctx.stroke()
    ctx.restore()
  }

  private drawInk(ctx: CanvasRenderingContext2D) {
    const l = this.layout
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const st of this.wb.strokes) {
      const p = st.pts
      ctx.strokeStyle = INKS[st.ink]
      ctx.fillStyle = INKS[st.ink]
      ctx.globalAlpha = st.ink === 4 ? 0.55 : 0.92 // the yellow is a highlighter
      const w = PEN_SIZES[st.size] * CELL
      const X = (i: number) => l.x + p[i] * CELL
      const Y = (i: number) => l.y + p[i + 1] * CELL
      if (p.length === 2) {
        ctx.beginPath()
        ctx.arc(X(0), Y(0), w / 2, 0, Math.PI * 2)
        ctx.fill()
        continue
      }
      ctx.lineWidth = w
      ctx.beginPath()
      ctx.moveTo(X(0), Y(0))
      // Midpoint quadratic smoothing.
      for (let i = 2; i < p.length - 2; i += 2) {
        ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 2)) / 2, (Y(i) + Y(i + 2)) / 2)
      }
      ctx.lineTo(X(p.length - 2), Y(p.length - 2))
      ctx.stroke()
    }
    ctx.restore()
  }

  // ---------- HUD ----------

  private drawHud(ctx: CanvasRenderingContext2D, s: CaroState, ui: ViewInput) {
    const l = this.layout
    const gap = 14
    const w = (l.width - PAD * 2 - gap) / 2
    for (const side of [1, 2] as Side[]) {
      const x = side === 1 ? PAD : PAD + w + gap
      this.drawPlayer(ctx, s, ui, side, x, 10, w)
    }
    ctx.font = `600 19px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = ui.statusColor
    ctx.fillText(ui.status, l.width / 2, 80)
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    s: CaroState,
    ui: ViewInput,
    side: Side,
    x: number,
    y: number,
    w: number,
  ) {
    const h = 50
    const active = !s.over && s.turn === side
    const won = s.over && s.winner === side
    ctx.save()
    if (active || won) {
      ctx.shadowColor = won ? GOLD : INK[side]
      ctx.shadowBlur = 14 + (prefersReducedMotion() ? 0 : 6 * Math.sin(this.time * 4))
    }
    ctx.fillStyle = theme.felt
    roundRect(ctx, x, y, w, h, 14)
    ctx.fill()
    ctx.restore()
    ctx.lineWidth = active || won ? 3 : 1.5
    ctx.strokeStyle = won ? GOLD : active ? INK[side] : theme.rim
    roundRect(ctx, x, y, w, h, 14)
    ctx.stroke()

    // Mark badge.
    const bx = x + 27
    const by = y + h / 2
    ctx.fillStyle = PAPER
    ctx.beginPath()
    ctx.arc(bx, by, 17, 0, Math.PI * 2)
    ctx.fill()
    ctx.save()
    ctx.strokeStyle = INK[side]
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    if (side === 1) {
      ctx.moveTo(bx - 7, by - 7)
      ctx.lineTo(bx + 7, by + 7)
      ctx.moveTo(bx + 7, by - 7)
      ctx.lineTo(bx - 7, by + 7)
    } else ctx.arc(bx, by, 8, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()

    const seat = s.seats[side - 1]
    const wins = ui.wins.get(tallyKey(seat, side)) ?? 0
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    ctx.font = `700 20px ${FONT}`
    ctx.fillStyle = wins ? GOLD : theme.haze
    const winsText = `★ ${wins}`
    ctx.fillText(winsText, x + w - 14, by)
    const winsW = ctx.measureText(winsText).width
    ctx.textAlign = 'left'
    ctx.font = `600 18px ${FONT}`
    ctx.fillStyle = theme.chalk
    ctx.fillText(fit(ctx, ui.names[side - 1], w - 66 - winsW - 10), x + 52, by)

    // Turn clock: a bar along the bottom edge that drains, red near the end.
    if (active && s.turnTicks > 0) {
      const f = clamp01(s.clock / s.turnTicks)
      ctx.fillStyle = s.clock <= 50 ? theme.coral : INK[side]
      roundRect(ctx, x + 12, y + h - 6, (w - 24) * f, 4, 2)
      ctx.fill()
    }
  }
}

/** Shorten text with an ellipsis to fit `max` width. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1)
  return s + '…'
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, Math.max(0, w), h, Math.min(r, h / 2, Math.max(0, w) / 2))
}
