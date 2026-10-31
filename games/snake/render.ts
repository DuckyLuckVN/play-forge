import { playerColor } from '@forge/app'
import type { Canvas2D } from '@forge/render2d/canvas'
import type { SnakeState } from './sim'

export const CELL = 20
export const HUD = 36

export function render(view: Canvas2D, state: SnakeState | null, selfId: string, time: number) {
  const { ctx } = view
  ctx.fillStyle = '#0e1116'
  ctx.fillRect(0, 0, view.width, view.height)
  if (!state) return

  drawHud(view, state, selfId)
  ctx.save()
  ctx.translate(0, HUD)

  // Board
  ctx.fillStyle = '#141820'
  ctx.fillRect(0, 0, state.width * CELL, state.height * CELL)
  ctx.fillStyle = '#1a1f29'
  for (let y = 0; y < state.height; y++)
    for (let x = (y % 2); x < state.width; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL)

  // Food (gently pulsing)
  const pulse = 1 + Math.sin(time * 6) * 0.08
  ctx.fillStyle = '#ff5d6c'
  for (const [x, y] of state.food) {
    ctx.beginPath()
    ctx.arc((x + 0.5) * CELL, (y + 0.5) * CELL, CELL * 0.3 * pulse, 0, Math.PI * 2)
    ctx.fill()
  }

  // Snakes: dead ones first so living snakes draw on top.
  const ordered = [...state.snakes].sort((a, b) => Number(a.alive) - Number(b.alive))
  for (const s of ordered) {
    if (!s.alive) continue
    const color = playerColor(s.slot)
    s.body.forEach(([x, y], i) => {
      ctx.globalAlpha = i === 0 ? 1 : Math.max(0.55, 1 - i / (s.body.length * 1.6))
      ctx.fillStyle = color
      const inset = i === 0 ? 1 : 2
      roundRect(ctx, x * CELL + inset, y * CELL + inset, CELL - inset * 2, CELL - inset * 2, 5)
    })
    ctx.globalAlpha = 1
    drawEyes(ctx, s.body[0], s.dir)
    if (s.id === selfId && state.tick < 15) drawYouMarker(ctx, s.body[0], color)
  }
  ctx.restore()
}

function drawHud(view: Canvas2D, state: SnakeState, selfId: string) {
  const { ctx } = view
  ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  let x = 8
  for (const s of state.snakes) {
    const label = `${s.name}${s.id === selfId ? ' (you)' : ''}  ${s.score}`
    ctx.globalAlpha = s.alive ? 1 : 0.35
    ctx.fillStyle = playerColor(s.slot)
    roundRect(ctx, x, HUD / 2 - 5, 10, 10, 3)
    ctx.fillStyle = '#e8ebf0'
    ctx.fillText(label, x + 16, HUD / 2)
    x += ctx.measureText(label).width + 34
  }
  ctx.globalAlpha = 1
}

function drawEyes(ctx: CanvasRenderingContext2D, [x, y]: [number, number], dir: string) {
  const cx = (x + 0.5) * CELL
  const cy = (y + 0.5) * CELL
  const f = CELL * 0.18 // forward offset
  const s = CELL * 0.2 // sideways offset
  const [fx, fy] = dir === 'up' ? [0, -1] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [1, 0]
  ctx.fillStyle = '#0e1116'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.arc(cx + fx * f + fy * s * side, cy + fy * f + fx * s * side, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawYouMarker(ctx: CanvasRenderingContext2D, [x, y]: [number, number], color: string) {
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc((x + 0.5) * CELL, (y + 0.5) * CELL, CELL * 1.1, 0, Math.PI * 2)
  ctx.stroke()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}
