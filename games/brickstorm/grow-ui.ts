// The "storm grows" choice: one card per axis, each with a small live picture
// of the board and its new column or row lit up.
import { h } from '@forge/ui/dom'
import { theme } from '@forge/ui/theme'
import { t } from './i18n'

export type GrowAxis = 'col' | 'row'

const PREVIEW_W = 120
const PREVIEW_H = 110
const NEW = '#4be3a0'
const BRICKS = ['#ff6b6b', '#ff9f43', '#ffc83d', '#b48cff', '#5ab8ff']

/** The board as a grid of `cols`×`rows` cells, with the axis it would gain pulsing at its edge. */
export function drawGrowPreview(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  axis: GrowAxis,
  time: number,
): void {
  const nc = cols + (axis === 'col' ? 1 : 0)
  const nr = rows + (axis === 'row' ? 1 : 0)
  const cell = Math.floor(Math.min((PREVIEW_W - 8) / nc, (PREVIEW_H - 8) / nr))
  const ox = (PREVIEW_W - cell * nc) / 2
  const oy = (PREVIEW_H - cell * nr) / 2
  ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H)
  ctx.fillStyle = theme.pit
  ctx.beginPath()
  ctx.roundRect(ox - 3, oy - 3, cell * nc + 6, cell * nr + 6, 6)
  ctx.fill()
  // A few bricks near the top, so it reads as the board.
  for (let r = 0; r < Math.min(3, rows - 1); r++) {
    for (let c = 0; c < cols; c++) {
      if ((c * 7 + r * 3) % 5 === 0) continue
      ctx.fillStyle = BRICKS[(c + r * 2) % BRICKS.length]
      ctx.globalAlpha = 0.75
      ctx.fillRect(ox + c * cell + 1, oy + r * cell + 1, cell - 2, cell - 2)
    }
  }
  ctx.globalAlpha = 1
  // The danger line on the last row.
  ctx.strokeStyle = theme.coral
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.moveTo(ox, oy + (nr - 1) * cell)
  ctx.lineTo(ox + nc * cell, oy + (nr - 1) * cell)
  ctx.stroke()
  ctx.setLineDash([])
  // The new column (right edge) or row (just above the line), pulsing.
  const pulse = 0.45 + 0.35 * Math.sin(time * 5)
  const x = axis === 'col' ? ox + cols * cell : ox
  const y = axis === 'col' ? oy : oy + (nr - 2) * cell
  const w = axis === 'col' ? cell : nc * cell
  const hgt = axis === 'col' ? (nr - 1) * cell : cell
  ctx.fillStyle = NEW
  ctx.globalAlpha = pulse * 0.6
  ctx.fillRect(x, y, w, hgt)
  ctx.globalAlpha = 1
  ctx.strokeStyle = NEW
  ctx.lineWidth = 2
  ctx.strokeRect(x + 1, y + 1, w - 2, hgt - 2)
  ctx.fillStyle = theme.chalk
  ctx.font = `700 ${Math.max(10, cell)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('+', x + w / 2, y + hgt / 2)
}

/** One choice card. `onPick` runs on click unless the axis is already at its max. */
export function growCard(axis: GrowAxis, cols: number, rows: number, maxed: boolean, onPick: () => void): HTMLButtonElement {
  const canvas = h('canvas', { width: PREVIEW_W * 2, height: PREVIEW_H * 2, class: 'bs-grow-preview' })
  canvas.style.width = `${PREVIEW_W}px`
  canvas.style.height = `${PREVIEW_H}px`
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const start = performance.now()
    const frame = (now: number) => {
      ctx.setTransform(2, 0, 0, 2, 0, 0)
      drawGrowPreview(ctx, cols, rows, axis, (now - start) / 1000)
      if (canvas.isConnected || now - start < 500) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }
  const col = axis === 'col'
  const card = h(
    'button',
    { class: 'pf-btn bs-card bs-grow-card', type: 'button', onclick: onPick },
    canvas,
    h('strong', { textContent: col ? t('+1 column') : t('+1 row') }),
    h('small', {
      textContent: col
        ? t('{from} → {to} columns', { from: cols, to: cols + 1 })
        : t('{from} → {to} rows', { from: rows, to: rows + 1 }),
    }),
    h('span', {
      textContent: maxed
        ? t('Maxed out')
        : col
          ? t('More room: more bricks per row to break, and wider angles to aim.')
          : t('More time: bricks need one more turn to reach the line.'),
    }),
  )
  card.disabled = maxed
  return card
}
