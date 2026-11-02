// "NEW" on a brick or pickup kind the player hasn't read about yet; holding it
// opens its guide card (and the tag goes).
import { FONT, theme } from '@forge/ui/theme'

/** Measured once per label (the font never changes). */
const widths = new Map<string, number>()

/** A small pulsing "NEW" pill, centred at (x, y). */
export function drawNewTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  time: number,
  still: boolean,
): void {
  const pulse = still ? 1 : 1 + 0.08 * Math.sin(time * 6)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(pulse, pulse)
  ctx.font = `900 9px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let w = widths.get(label)
  if (w === undefined) widths.set(label, (w = ctx.measureText(label).width + 8))
  ctx.fillStyle = '#4be3a0'
  ctx.strokeStyle = theme.night
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(-w / 2, -6, w, 12, 6)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = theme.night
  ctx.fillText(label, 0, 0.5)
  ctx.restore()
}
