// Boss attacks in flight (see Juice.beams): a rocket streaking at the hero, a
// hex bolt or thorn spark, a drain stream. Drawing only.
import type { Juice } from './juice'

type Beam = Juice['beams'][number]

/** Rockets accelerate: slow off the rail, fast on impact. */
const ease = (t: number) => t * t

function drawRocket(ctx: CanvasRenderingContext2D, b: Beam, time: number): void {
  const t = Math.min(1, b.age / b.life)
  const k = ease(t)
  const x = b.x1 + (b.x2 - b.x1) * k
  const y = b.y1 + (b.y2 - b.y1) * k
  const angle = Math.atan2(b.y2 - b.y1, b.x2 - b.x1)
  // Smoke trail: puffs along the path behind it, older ones fainter.
  for (let i = 1; i <= 8; i++) {
    const kt = ease(Math.max(0, t - i * 0.04))
    ctx.globalAlpha = 0.35 * (1 - i / 9)
    ctx.fillStyle = '#c9c3e6'
    ctx.beginPath()
    ctx.arc(b.x1 + (b.x2 - b.x1) * kt, b.y1 + (b.y2 - b.y1) * kt, 3 + i * 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  // Exhaust flame flickering behind.
  ctx.fillStyle = '#ffc83d'
  const flick = 8 + 5 * Math.sin(time * 60)
  ctx.beginPath()
  ctx.moveTo(-8, -4)
  ctx.lineTo(-8 - flick, 0)
  ctx.lineTo(-8, 4)
  ctx.fill()
  // Body and nose.
  ctx.fillStyle = b.color
  ctx.beginPath()
  ctx.moveTo(-8, -5)
  ctx.lineTo(6, -5)
  ctx.lineTo(13, 0)
  ctx.lineTo(6, 5)
  ctx.lineTo(-8, 5)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#212529'
  ctx.fillRect(-4, -5, 3, 10)
  ctx.restore()
}

function drawBolt(ctx: CanvasRenderingContext2D, b: Beam, time: number): void {
  const fade = 1 - b.age / b.life
  ctx.strokeStyle = b.color
  ctx.lineWidth = 3
  ctx.shadowColor = b.color
  ctx.shadowBlur = 10
  ctx.globalAlpha = Math.max(0, fade)
  ctx.beginPath()
  ctx.moveTo(b.x1, b.y1)
  const n = 6
  const nx = -(b.y2 - b.y1)
  const ny = b.x2 - b.x1
  const len = Math.hypot(nx, ny) || 1
  for (let i = 1; i < n; i++) {
    // Jagged: each joint jitters across the line, re-rolled every frame.
    const j = Math.sin(time * 80 + i * 12.9) * 9
    ctx.lineTo(
      b.x1 + ((b.x2 - b.x1) * i) / n + (nx / len) * j,
      b.y1 + ((b.y2 - b.y1) * i) / n + (ny / len) * j,
    )
  }
  ctx.lineTo(b.x2, b.y2)
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1
}

function drawStream(ctx: CanvasRenderingContext2D, b: Beam, time: number): void {
  const t = b.age / b.life
  const fade = t < 0.8 ? 1 : (1 - t) / 0.2
  const dx = b.x2 - b.x1
  const dy = b.y2 - b.y1
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len
  const py = dx / len
  // Blood-red orbs flowing from the hero up to the boss along a wavy path.
  ctx.fillStyle = b.color
  ctx.shadowColor = b.color
  ctx.shadowBlur = 8
  for (let i = 0; i < 10; i++) {
    const u = (i / 10 + t * 1.6) % 1
    if (u > t * 1.6) continue // the stream's head is still on its way
    const wave = Math.sin(u * 12 + time * 8) * 7
    ctx.globalAlpha = Math.max(0, fade) * (0.5 + 0.5 * u)
    ctx.beginPath()
    ctx.arc(b.x1 + dx * u + px * wave, b.y1 + dy * u + py * wave, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1
}

/** Draws every boss attack in flight. */
export function drawBeams(ctx: CanvasRenderingContext2D, beams: Juice['beams'], time: number): void {
  if (!beams.length) return
  ctx.save()
  for (const b of beams) {
    if (b.kind === 'rocket') drawRocket(ctx, b, time)
    else if (b.kind === 'bolt') drawBolt(ctx, b, time)
    else drawStream(ctx, b, time)
  }
  ctx.restore()
}
