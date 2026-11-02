// Crash warnings on the board: a small "−N" under each brick that will reach the
// line, and the health it will cost shown on the hero's bar.
import { compactNumber } from '@forge/ui/text'
import { FONT, theme } from '@forge/ui/theme'
import { bossParts } from './sim/boss-kit'
import type { CrashForecast } from './sim/forecast'
import { brickRect } from './sim/rows'
import type { RunState } from './sim/types'

/** Health lost, as a badge: "−12" (at least 1, so a tiny share never reads as safe). */
export function lossLabel(amount: number): string {
  return `−${compactNumber(Math.max(1, Math.round(amount)))}`
}

/** A pill under a brick: urgent (crashes this turn) pulses, "soon" (next turn) sits faded. */
function badge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  urgent: boolean,
  pulse: number,
) {
  ctx.save()
  ctx.font = `800 10px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = ctx.measureText(text).width + 8
  ctx.translate(x, y)
  if (urgent) ctx.scale(pulse, pulse)
  ctx.globalAlpha = urgent ? 1 : 0.55
  ctx.fillStyle = urgent ? theme.coral : 'rgb(40 20 30 / 0.85)'
  ctx.strokeStyle = urgent ? '#ffffff' : theme.coral
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(-w / 2, -7, w, 14, 7)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = urgent ? '#ffffff' : '#ffb3b3'
  ctx.fillText(text, 0, 0.5)
  ctx.restore()
}

/** Badges on every brick in the forecast; `dy` is a brick's slide-in offset. */
export function drawCrashBadges(
  ctx: CanvasRenderingContext2D,
  s: RunState,
  f: CrashForecast,
  time: number,
  still: boolean,
  dy: (id: number) => number = () => 0,
): void {
  if (!f.next.size && !f.soon.size && !f.boss) return
  const pulse = still ? 1 : 1 + 0.1 * Math.max(0, Math.sin(time * 8))
  for (const b of s.bricks) {
    const urgent = f.next.get(b.id)
    const later = urgent === undefined ? f.soon.get(b.id) : undefined
    if (urgent === undefined && later === undefined) continue
    const r = brickRect(b)
    badge(
      ctx,
      r.x + r.w / 2,
      r.y + r.h - 2 + dy(b.id),
      lossLabel(urgent ?? later!),
      urgent !== undefined,
      pulse,
    )
  }
  if (f.boss) {
    // One badge for the whole boss, under the middle of its lowest row.
    const parts = bossParts(s)
    if (!parts.length) return
    const bottom = Math.max(...parts.map((b) => b.row))
    const low = parts.filter((b) => b.row === bottom).map(brickRect)
    const x = (Math.min(...low.map((r) => r.x)) + Math.max(...low.map((r) => r.x + r.w))) / 2
    badge(ctx, x, low[0].y + low[0].h - 2, lossLabel(f.boss), true, pulse * 1.15)
  }
}

/**
 * The part of the health bar this turn's crash will take, blinking. `share` is
 * the current health share, `loss` the health the crash will take.
 */
export function drawHealthLoss(
  ctx: CanvasRenderingContext2D,
  bar: { x: number; y: number; w: number; h: number },
  share: number,
  loss: number,
  maxHp: number,
  time: number,
  still: boolean,
): void {
  if (loss <= 0 || share <= 0 || maxHp <= 0) return
  const lost = Math.min(share, loss / maxHp)
  const from = share - lost
  ctx.save()
  // Blinks harder when the crash would end the run.
  const lethal = lost >= share
  ctx.globalAlpha = still
    ? 0.85
    : (lethal ? 0.55 : 0.65) + (lethal ? 0.45 : 0.3) * Math.sin(time * (lethal ? 12 : 7))
  ctx.fillStyle = theme.coral
  ctx.beginPath()
  ctx.rect(bar.x + bar.w * from, bar.y, Math.max(2, bar.w * lost), bar.h)
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(bar.x + bar.w * from, bar.y - 1)
  ctx.lineTo(bar.x + bar.w * from, bar.y + bar.h + 1)
  ctx.stroke()
  ctx.restore()
}
