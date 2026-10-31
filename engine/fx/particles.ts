import { ease } from './tween'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  age: number
  size: number
  color: string
  spin: number
  angle: number
  shape: 'circle' | 'square'
  gravity: number
  text?: string
  font?: string
}

export interface BurstOptions {
  count?: number
  color?: string | string[]
  /** Initial speed in units/second. */
  speed?: number
  /** Seconds. */
  life?: number
  size?: number
  /** Downward acceleration, units/second². */
  gravity?: number
  /** Emit direction in radians and spread around it (default: all around). */
  angle?: number
  spread?: number
  shape?: 'circle' | 'square'
}

export interface TextOptions {
  color?: string
  size?: number
  life?: number
  /** Units to float upwards over its life. */
  rise?: number
  font?: string
}

/**
 * Lightweight particle system for canvas games: bursts, sparks, confetti and
 * floating text ("+1"). Call `update(dt)` and `draw(ctx)` every frame, in the
 * same coordinate space you draw the game in.
 */
export class Particles {
  private items: Particle[] = []
  /** Upper bound to protect slow devices. */
  max = 600

  get count() {
    return this.items.length
  }

  burst(x: number, y: number, opts: BurstOptions = {}): void {
    const count = opts.count ?? 12
    const colors = Array.isArray(opts.color) ? opts.color : [opts.color ?? '#fff']
    const speed = opts.speed ?? 120
    const spread = opts.spread ?? Math.PI * 2
    const base = opts.angle ?? 0
    for (let i = 0; i < count && this.items.length < this.max; i++) {
      const a = base + (Math.random() - 0.5) * spread
      const s = speed * (0.4 + Math.random() * 0.8)
      this.items.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: (opts.life ?? 0.6) * (0.7 + Math.random() * 0.6),
        age: 0,
        size: (opts.size ?? 4) * (0.6 + Math.random() * 0.8),
        color: colors[i % colors.length],
        spin: (Math.random() - 0.5) * 12,
        angle: Math.random() * Math.PI,
        shape: opts.shape ?? 'circle',
        gravity: opts.gravity ?? 0,
      })
    }
  }

  text(x: number, y: number, text: string, opts: TextOptions = {}): void {
    const life = opts.life ?? 0.8
    this.items.push({
      x,
      y,
      vx: 0,
      vy: -(opts.rise ?? 30) / life,
      life,
      age: 0,
      size: opts.size ?? 16,
      color: opts.color ?? '#fff',
      spin: 0,
      angle: 0,
      shape: 'circle',
      gravity: 0,
      text,
      font: opts.font,
    })
  }

  update(dt: number): void {
    this.items = this.items.filter((p) => {
      p.age += dt
      if (p.age >= p.life) return false
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (!p.text) {
        p.vy += p.gravity * dt
        p.vx *= 1 - 2 * dt // air drag
        p.vy *= 1 - 2 * dt
        p.angle += p.spin * dt
      }
      return true
    })
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      const t = p.age / p.life
      ctx.globalAlpha = 1 - ease.inCubic(t)
      ctx.fillStyle = p.color
      if (p.text) {
        const pop = t < 0.15 ? ease.outBack(t / 0.15) : 1
        ctx.font = p.font ?? `700 ${Math.round(p.size * pop)}px Fredoka, ui-rounded, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.text, p.x, p.y)
        continue
      }
      const size = p.size * (1 - t * 0.5)
      if (p.shape === 'square') {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillRect(-size / 2, -size / 4, size, size / 2)
        ctx.restore()
      } else {
        ctx.beginPath()
        ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }

  clear(): void {
    this.items = []
  }
}
