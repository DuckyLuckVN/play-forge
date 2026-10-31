import { prefersReducedMotion } from './tween'

/**
 * Trauma-based screen shake: `add()` on impacts, `apply(ctx)` before drawing
 * the world. Shake falls off smoothly and is skipped for reduced motion.
 */
export class Shake {
  private trauma = 0
  private time = 0
  /** Max offset in drawing units at full trauma. */
  constructor(private maxOffset = 10, private decay = 1.6) {}

  /** 0..1; small hits ≈ 0.2, big hits ≈ 0.6. */
  add(amount: number): void {
    if (prefersReducedMotion()) return
    this.trauma = Math.min(1, this.trauma + amount)
  }

  update(dt: number): void {
    this.time += dt
    this.trauma = Math.max(0, this.trauma - this.decay * dt)
  }

  get offset(): [number, number] {
    const s = this.trauma ** 2 * this.maxOffset
    if (s === 0) return [0, 0]
    // Smooth pseudo-noise rather than per-frame random jitter.
    return [s * Math.sin(this.time * 47.3), s * Math.cos(this.time * 39.7)]
  }

  apply(ctx: CanvasRenderingContext2D): void {
    const [x, y] = this.offset
    ctx.translate(x, y)
  }
}
