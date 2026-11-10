// Camera punch: a damped spring kicked with a velocity, stepped in fixed sub-steps so it feels the same
// at any frame rate. Pure (no three.js); the renderer adds `offset` to the camera after framing it.

export class SpringPunch {
  /** Current offset (m); 0 at rest. */
  offset = 0
  private vel = 0
  /** Time not yet simulated (s). */
  private acc = 0
  private damping: number

  /**
   * `k` = stiffness (1/s²), `zeta` = damping ratio (< 1 bounces once or twice), `step` = sub-step (s).
   */
  constructor(
    private k: number,
    zeta: number,
    private step: number,
  ) {
    this.damping = 2 * zeta * Math.sqrt(k)
  }

  /** Add velocity (m/s). */
  kick(v: number) {
    this.vel += v
  }

  reset() {
    this.offset = this.vel = this.acc = 0
  }

  /** Advance by `dt` s (capped at 0.1 s: a stalled tab doesn't fling the camera). Returns the offset. */
  update(dt: number): number {
    if (this.offset === 0 && this.vel === 0) return 0
    this.acc = Math.min(this.acc + dt, 0.1)
    while (this.acc >= this.step - 1e-9) {
      this.acc -= this.step
      this.vel += (-this.k * this.offset - this.damping * this.vel) * this.step
      this.offset += this.vel * this.step
    }
    // Under a millimetre and barely moving: rest exactly (stops the per-frame work).
    if (Math.abs(this.offset) < 1e-3 && Math.abs(this.vel) < 1e-2) this.offset = this.vel = this.acc = 0
    return this.offset
  }
}
