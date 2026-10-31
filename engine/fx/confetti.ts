import { PLAYER_COLORS } from '../ui/theme'
import { Particles } from './particles'
import { prefersReducedMotion } from './tween'

/**
 * Full-screen confetti on a temporary canvas above everything else.
 * Used for wins; any game or page can call it.
 */
export function celebrate(colors: string[] = PLAYER_COLORS): void {
  if (prefersReducedMotion()) return
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:30'
  document.body.append(canvas)
  const ctx = canvas.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  const w = innerWidth
  const h = innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)

  const fx = new Particles()
  const fire = (x: number, angle: number) =>
    fx.burst(x, h * 0.95, {
      count: 70,
      color: colors,
      speed: Math.max(700, h * 1.1),
      angle,
      spread: 0.7,
      life: 2.6,
      size: 12,
      gravity: 900,
      shape: 'square',
    })
  fire(w * 0.1, -Math.PI / 2 + 0.35)
  fire(w * 0.9, -Math.PI / 2 - 0.35)

  let last = performance.now()
  const frame = (now: number) => {
    fx.update(Math.min(0.05, (now - last) / 1000))
    last = now
    ctx.clearRect(0, 0, w, h)
    fx.draw(ctx)
    if (fx.count > 0) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}
