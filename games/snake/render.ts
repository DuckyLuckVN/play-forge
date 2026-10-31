import { Particles } from '@forge/fx/particles'
import { Shake } from '@forge/fx/shake'
import { ease, lerp, progress } from '@forge/fx/tween'
import type { Smoothed } from '@forge/net/smoothing'
import type { Canvas2D } from '@forge/render2d/canvas'
import { playerColor, theme } from '@forge/ui/theme'
import type { Point, Snake, SnakeState } from './sim'

export const CELL = 20

const FOOD = '#ff5d7a'
const EAT_POP = 0.28 // seconds
const DEATH_FADE = 0.6
const FOOD_GROW = 0.4

type XY = [number, number]

const center = ([x, y]: Point): XY => [(x + 0.5) * CELL, (y + 0.5) * CELL]
const mix = (a: Point, b: Point, t: number): XY => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]

interface Corpse {
  body: Point[]
  slot: number
  at: number
}

/**
 * Draws Snake with movement interpolated between ticks, plus effects:
 * food pops in, eating bursts and "+1", deaths shatter and shake the board.
 */
export class SnakeRenderer {
  private fx = new Particles()
  private shake = new Shake(9)
  private foodBorn = new Map<string, number>()
  private ateAt = new Map<string, number>()
  private corpses: Corpse[] = []
  private time = 0

  constructor(
    private view: Canvas2D,
    private smooth: Smoothed<SnakeState>,
    private selfId: string,
  ) {}

  /** Call for every new simulation state to trigger effects. */
  onState(state: SnakeState): void {
    for (const e of state.events) {
      const snake = state.snakes.find((s) => s.id === e.player)
      if (!snake) continue
      const color = playerColor(snake.slot)
      const mine = snake.id === this.selfId
      if (e.type === 'eat') {
        const [x, y] = center(snake.body[0])
        this.ateAt.set(snake.id, this.time)
        this.fx.burst(x, y, { count: 14, color: [FOOD, color, '#fff'], speed: 150, life: 0.5, size: 5 })
        this.fx.text(x, y - CELL * 0.6, '+1', {
          color: mine ? theme.chalk : color,
          size: mine ? 18 : 14,
          rise: 26,
        })
      } else {
        this.corpses.push({ body: snake.body.map((p) => [...p] as Point), slot: snake.slot, at: this.time })
        snake.body.forEach((p, i) => {
          if (i % 2) return
          const [x, y] = center(p)
          this.fx.burst(x, y, {
            count: 4,
            color: [color, '#fff'],
            speed: 110,
            life: 0.7,
            size: 6,
            shape: 'square',
          })
        })
        this.shake.add(mine ? 0.65 : 0.25)
      }
    }
  }

  frame(dt: number): void {
    this.time += dt
    this.fx.update(dt)
    this.shake.update(dt)
    const { ctx, width, height } = this.view
    const state = this.smooth.curr
    ctx.clearRect(0, 0, width, height)
    if (!state) return

    // Interpolate only between consecutive ticks of the same round.
    const prev = this.smooth.prev && this.smooth.prev.tick === state.tick - 1 ? this.smooth.prev : null
    const a = prev ? ease.linear(this.smooth.alpha()) : 1

    ctx.save()
    this.shake.apply(ctx)
    this.drawBoard(state)
    this.drawFood(state)
    this.drawCorpses()
    for (const s of state.snakes) {
      if (!s.alive) continue
      const before = prev?.snakes.find((p) => p.id === s.id)
      this.drawSnake(s, before?.alive ? before : null, a, state.tick)
    }
    ctx.restore()
    this.fx.draw(ctx)
  }

  private drawBoard(state: SnakeState) {
    const { ctx, width, height } = this.view
    ctx.fillStyle = theme.pit
    ctx.beginPath()
    ctx.roundRect(0, 0, width, height, 14)
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = 'rgb(255 255 255 / 0.025)'
    for (let y = 0; y < state.height; y++)
      for (let x = y % 2; x < state.width; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
    ctx.restore()
  }

  private drawFood(state: SnakeState) {
    const { ctx } = this.view
    const present = new Set<string>()
    for (const [x, y] of state.food) {
      const key = `${x},${y}`
      present.add(key)
      if (!this.foodBorn.has(key)) this.foodBorn.set(key, this.time)
      const grow = ease.outBack(progress(this.time, this.foodBorn.get(key)!, FOOD_GROW))
      const bob = Math.sin(this.time * 5 + x + y) * 1.2
      const [cx, cy] = center([x, y])
      ctx.fillStyle = 'rgb(0 0 0 / 0.25)'
      ctx.beginPath()
      ctx.ellipse(cx, cy + CELL * 0.32, CELL * 0.22 * grow, CELL * 0.08 * grow, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = FOOD
      ctx.beginPath()
      ctx.arc(cx, cy - CELL * 0.05 + bob, Math.max(0, CELL * 0.28 * grow), 0, Math.PI * 2)
      ctx.fill()
      // Highlight
      ctx.fillStyle = 'rgb(255 255 255 / 0.55)'
      ctx.beginPath()
      ctx.arc(cx - CELL * 0.09, cy - CELL * 0.14 + bob, Math.max(0, CELL * 0.07 * grow), 0, Math.PI * 2)
      ctx.fill()
    }
    for (const key of this.foodBorn.keys()) if (!present.has(key)) this.foodBorn.delete(key)
  }

  private drawSnake(s: Snake, before: Snake | null, a: number, tick: number) {
    const { ctx } = this.view
    const color = playerColor(s.slot)
    // Head slides from its previous cell; the tail slides off its old cell.
    const head: XY = before ? mix(before.body[0], s.body[0], a) : [s.body[0][0], s.body[0][1]]
    const tail = before ? mix(before.body.at(-1)!, s.body.at(-1)!, a) : null
    const points: XY[] = [head, ...s.body.slice(1).map((p) => [p[0], p[1]] as XY)]
    if (tail) points.push(tail)

    ctx.strokeStyle = color
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = CELL * 0.72
    ctx.beginPath()
    points.forEach(([x, y], i) => {
      const px = (x + 0.5) * CELL
      const py = (y + 0.5) * CELL
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()

    // Soft shine along the back.
    ctx.strokeStyle = 'rgb(255 255 255 / 0.18)'
    ctx.lineWidth = CELL * 0.18
    ctx.stroke()

    const [hx, hy] = [(head[0] + 0.5) * CELL, (head[1] + 0.5) * CELL]
    const ate = this.ateAt.get(s.id)
    const pop = ate === undefined ? 0 : 1 - ease.outCubic(progress(this.time, ate, EAT_POP))
    this.drawHead(hx, hy, s.dir, color, 1 + pop * 0.3)
    if (s.id === this.selfId && tick < 12) this.drawYouRing(hx, hy, color)
  }

  private drawHead(cx: number, cy: number, dir: string, color: string, scale: number) {
    const { ctx } = this.view
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, CELL * 0.48 * scale, 0, Math.PI * 2)
    ctx.fill()
    const [fx, fy] = dir === 'up' ? [0, -1] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [1, 0]
    // Blink every few seconds.
    const blink = this.time % 3.2 < 0.12 ? 0.25 : 1
    for (const side of [-1, 1]) {
      const ex = cx + fx * CELL * 0.12 + fy * CELL * 0.2 * side
      const ey = cy + fy * CELL * 0.12 + fx * CELL * 0.2 * side
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.ellipse(ex, ey, CELL * 0.14, CELL * 0.14 * blink, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = theme.night
      ctx.beginPath()
      ctx.arc(ex + fx * 1.5, ey + fy * 1.5, CELL * 0.07 * blink, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawYouRing(cx: number, cy: number, color: string) {
    const { ctx } = this.view
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.globalAlpha = 0.5 + Math.sin(this.time * 8) * 0.3
    ctx.beginPath()
    ctx.arc(cx, cy, CELL * 1.2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  private drawCorpses() {
    const { ctx } = this.view
    this.corpses = this.corpses.filter((c) => this.time - c.at < DEATH_FADE)
    for (const c of this.corpses) {
      const t = progress(this.time, c.at, DEATH_FADE)
      ctx.globalAlpha = 1 - ease.outCubic(t)
      ctx.strokeStyle = playerColor(c.slot)
      ctx.lineWidth = CELL * 0.72 * (1 - t * 0.6)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      c.body.forEach((p, i) => {
        const [x, y] = center(p)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
}
