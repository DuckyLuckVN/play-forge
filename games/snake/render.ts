import { playerColor, theme } from '@forge/ui/theme'
import type { Canvas2D } from '@forge/render2d/canvas'
import type { Point, SnakeState } from './sim'

export const CELL = 20

const FOOD = '#ff5d7a'

export function render(view: Canvas2D, state: SnakeState | null, selfId: string, time: number) {
  const { ctx } = view
  ctx.clearRect(0, 0, view.width, view.height)
  if (!state) return

  // Board: a sunken tray with a soft checker.
  ctx.fillStyle = theme.pit
  roundRect(ctx, 0, 0, view.width, view.height, 14)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, view.width, view.height, 14)
  ctx.clip()
  ctx.fillStyle = 'rgb(255 255 255 / 0.025)'
  for (let y = 0; y < state.height; y++)
    for (let x = y % 2; x < state.width; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL)

  // Food, gently bobbing.
  for (const [x, y] of state.food) {
    const bob = Math.sin(time * 5 + x + y) * 1.2
    ctx.fillStyle = 'rgb(0 0 0 / 0.25)'
    ctx.beginPath()
    ctx.ellipse((x + 0.5) * CELL, (y + 0.82) * CELL, CELL * 0.22, CELL * 0.08, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = FOOD
    ctx.beginPath()
    ctx.arc((x + 0.5) * CELL, (y + 0.45) * CELL + bob, CELL * 0.28, 0, Math.PI * 2)
    ctx.fill()
  }

  for (const s of state.snakes) {
    if (!s.alive) continue
    const color = playerColor(s.slot)
    // Body as one thick rounded stroke, so turns read as a continuous snake.
    ctx.strokeStyle = color
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = CELL * 0.72
    ctx.beginPath()
    s.body.forEach(([x, y], i) => {
      const cx = (x + 0.5) * CELL
      const cy = (y + 0.5) * CELL
      if (i === 0) ctx.moveTo(cx, cy)
      else ctx.lineTo(cx, cy)
    })
    ctx.stroke()
    drawHead(ctx, s.body[0], s.dir, color)
    if (s.id === selfId && state.tick < 12) drawYouRing(ctx, s.body[0], color, time)
  }
  ctx.restore()
}

function drawHead(ctx: CanvasRenderingContext2D, [x, y]: Point, dir: string, color: string) {
  const cx = (x + 0.5) * CELL
  const cy = (y + 0.5) * CELL
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, CELL * 0.48, 0, Math.PI * 2)
  ctx.fill()
  const [fx, fy] = dir === 'up' ? [0, -1] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [1, 0]
  for (const side of [-1, 1]) {
    const ex = cx + fx * CELL * 0.12 + fy * CELL * 0.2 * side
    const ey = cy + fy * CELL * 0.12 + fx * CELL * 0.2 * side
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(ex, ey, CELL * 0.14, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = theme.night
    ctx.beginPath()
    ctx.arc(ex + fx * 1.5, ey + fy * 1.5, CELL * 0.07, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawYouRing(ctx: CanvasRenderingContext2D, [x, y]: Point, color: string, time: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = 2.5
  ctx.globalAlpha = 0.5 + Math.sin(time * 8) * 0.3
  ctx.beginPath()
  ctx.arc((x + 0.5) * CELL, (y + 0.5) * CELL, CELL * 1.2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}
