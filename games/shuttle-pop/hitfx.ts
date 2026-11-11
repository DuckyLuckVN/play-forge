// Hit juice on the hitter, visual only (online-safe: the sim, the shuttle and other players never wait):
// a white body flash that fades, and on the biggest hits a hit-stop that holds the hitter's pose a beat.

/** Flash peak (0..1 white) and how long it fades (s); hit-stop holds (s). */
export const HIT_FX = {
  flash: { perfectSmash: 0.75, smash: 0.5, perfect: 0.4, power: 0.85 },
  fade: 0.14,
  stop: { power: 0.07, perfectSmash: 0.05 },
}

/** Flash peak and hit-stop for a hit (0 = none). `power`: a full-charge hit (isPowerHit). */
export function hitJuice(perfect: boolean, smash: boolean, power: boolean): { flash: number; stop: number } {
  const flash = power
    ? HIT_FX.flash.power
    : smash
      ? perfect
        ? HIT_FX.flash.perfectSmash
        : HIT_FX.flash.smash
      : perfect
        ? HIT_FX.flash.perfect
        : 0
  const stop = power && smash ? HIT_FX.stop.power : perfect && smash ? HIT_FX.stop.perfectSmash : 0
  return { flash, stop }
}

/** Flash left `age` s after a hit that peaked at `peak` (linear fade to 0 over HIT_FX.fade). */
export function flashAt(peak: number, age: number): number {
  if (!(peak > 0) || !(age >= 0) || age >= HIT_FX.fade) return 0
  return peak * (1 - age / HIT_FX.fade)
}
