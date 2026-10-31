/** Easing curves: t in [0, 1] → eased value (outBack/outElastic overshoot 1). */
export const ease = {
  linear: (t: number) => t,
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => {
    const c = 1.70158
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
  },
  outElastic: (t: number) =>
    t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1,
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
export const clamp01 = (v: number) => clamp(v, 0, 1)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Progress of an animation that started at `start` (seconds) and lasts `dur`. */
export const progress = (now: number, start: number, dur: number) => clamp01((now - start) / dur)

/**
 * Frame-rate independent smoothing towards a target: call every frame.
 * Higher `rate` follows faster (≈ 1/rate seconds to close most of the gap).
 */
export const damp = (current: number, target: number, rate: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-rate * dt))

/** True when the player asked the OS for less motion. */
export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
