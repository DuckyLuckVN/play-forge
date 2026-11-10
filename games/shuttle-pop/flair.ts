// Personality flair (pure, cosmetic): how a character's extra bones move (tail wag, ear flop / twitch,
// wing flap, antenna sway + blinking light) and its own idle fidget / celebration on the whole body
// (slime wobble, panda rock, robot head ticks, ghost spin, animal wiggle). Inputs are the pose's damped
// weights and the clock; every output is continuous in the weights, so moods blend instead of popping
// (two fixed-rate oscillators are cross-faded instead of changing one's frequency). actors.ts applies
// the results; nothing here allocates.

/** An extra bone's motion (model/extras.ts). */
export type Channel = 'wag' | 'flop' | 'twitch' | 'sway' | 'flap'
/** A character's whole-body fidget / celebration. */
export type BodyFlair = 'none' | 'wiggle' | 'rock' | 'wobble' | 'tick' | 'spin'

export interface FlairIn {
  /** Clock (s) and a per-chibi offset (s) so two players don't move in sync. */
  t: number
  seed: number
  /** Damped weights 0..1 (ChibiPose): speed, point won, point lost, match won, jump. */
  run: number
  stride: number
  happy: number
  sad: number
  cheer: number
  jump: number
}

export interface ExtraOut {
  /** Pivot rotation (rad, XYZ) added to the rest pose. */
  rx: number
  ry: number
  rz: number
  /** Light on (antenna bulb). */
  glow: boolean
}

export interface BodyOut {
  /** Rig yaw / roll (rad), extra lift (m), squash (+ = wider + shorter), head roll (rad). */
  ry: number
  rz: number
  lift: number
  squash: number
  headZ: number
}

export const extraOut = (): ExtraOut => ({ rx: 0, ry: 0, rz: 0, glow: true })
export const bodyOut = (): BodyOut => ({ ry: 0, rz: 0, lift: 0, squash: 0, headZ: 0 })

const TAU = Math.PI * 2
const smooth = (u: number) => {
  const k = Math.min(1, Math.max(0, u))
  return k * k * (3 - 2 * k)
}

/** A short 0 → 1 → 0 pulse lasting `len` s, once every `period` s. */
export function pulse(t: number, period: number, len: number): number {
  const u = ((t % period) + period) % period
  return u < len ? Math.sin((Math.PI * u) / len) : 0
}

/** Tail wag: lazy sway when idle, a fast wide wag when happy; lowered while running, droops when sad. */
const WAG = { idle: { w: 2.4, a: 0.22 }, happy: { w: 13, a: 0.5 }, run: 0.15, sad: 0.35 }
/** Ear flop: bounce with the stride / jump, fold back when sad, jiggle when happy. */
const FLOP = { run: 0.3, jump: 0.45, sad: 0.95, happy: 0.18 }
/** Ear twitch: a quick flick every few s (each ear on its own clock), droop when sad, perk when happy. */
const TWITCH = { period: 3.1, len: 0.16, a: 0.4, sad: 0.55, perk: 0.12 }
/** Antenna: slow sway, swings with the stride, wiggles when happy; the light blinks off now and then. */
const SWAY = { idle: 0.13, run: 0.22, happy: 0.35, blink: { period: 1.7, off: 0.18, fast: 7 } }
/** Wing nubs: slow idle beat, fast flutter when happy / airborne. */
const FLAP = { idle: { w: 2.6, a: 0.16 }, fast: { w: 15, a: 0.55 } }

/** Extra bone `ch` (side k: 0 = +x, 1 = the mirrored twin) at these weights, into `o`. */
export function extraPose(ch: Channel, k: 0 | 1, i: FlairIn, o: ExtraOut): ExtraOut {
  const t = i.t + i.seed
  const h = Math.min(1, i.happy)
  o.rx = o.ry = o.rz = 0
  o.glow = true
  switch (ch) {
    case 'wag':
      o.ry = (1 - h) * WAG.idle.a * Math.sin(t * WAG.idle.w) + h * WAG.happy.a * Math.sin(t * WAG.happy.w)
      o.rx = -WAG.run * i.run - WAG.sad * i.sad
      break
    case 'flop':
      o.rx =
        FLOP.run * i.run * (0.5 + 0.5 * Math.sin(TAU * 2 * i.stride)) +
        FLOP.jump * i.jump +
        FLOP.sad * i.sad +
        FLOP.happy * h * Math.sin(t * 9)
      o.rz = 0.06 * Math.sin(t * 1.3 + k * 2)
      break
    case 'twitch': {
      const flick = pulse(t + k * 1.7, TWITCH.period, TWITCH.len) * (1 - i.sad)
      o.rz = -TWITCH.a * flick + TWITCH.sad * i.sad
      o.rx = -TWITCH.perk * h + 0.2 * i.sad
      break
    }
    case 'sway': {
      o.rz =
        SWAY.idle * Math.sin(t * 2.1) * (1 - i.run) +
        SWAY.run * i.run * Math.sin(TAU * i.stride) +
        SWAY.happy * h * Math.sin(t * 12)
      o.rx = 0.25 * i.jump + 0.3 * i.sad
      const B = SWAY.blink
      // Off for a moment every period; celebrating, it flashes fast.
      const slow = ((t % B.period) + B.period) % B.period < B.off
      const fast = Math.sin(t * B.fast * TAU) < 0
      o.glow = !(h > 0.5 ? fast : slow)
      break
    }
    case 'flap': {
      const f = Math.max(h, i.jump)
      o.ry = -(
        (1 - f) * FLAP.idle.a * Math.sin(t * FLAP.idle.w) +
        f * FLAP.fast.a * (0.5 + 0.5 * Math.sin(t * FLAP.fast.w))
      )
      o.rz = -0.2 * i.sad
      break
    }
  }
  return o
}

/** Whole-body fidget (idle, fading out as the character moves) and celebration (happy), into `o`. */
export function bodyFlair(f: BodyFlair, i: FlairIn, o: BodyOut): BodyOut {
  const t = i.t + i.seed
  const h = Math.min(1, i.happy)
  const idle = (1 - i.run) * (1 - h) * (1 - i.sad)
  o.ry = o.rz = o.lift = o.squash = o.headZ = 0
  switch (f) {
    case 'wiggle':
      // A happy hip wiggle; idle: the head tilts now and then (curious).
      o.rz = 0.12 * h * Math.sin(t * 11)
      o.headZ = 0.14 * idle * pulse(t, 4.3, 1.1)
      break
    case 'rock':
      // Panda: a slow side-to-side rock; a belly bounce when happy.
      o.rz = 0.07 * idle * Math.sin(t * 1.6)
      o.squash = 0.05 * h * Math.sin(t * 14)
      break
    case 'wobble':
      // Slime: always a little jelly wobble, a big one when happy or landing a jump.
      o.squash =
        0.025 * Math.sin(t * 5.5) * (1 - h) + 0.09 * h * Math.sin(t * 16) + 0.05 * i.jump * Math.sin(t * 22)
      break
    case 'tick': {
      // Robot: the head tilts in steps (quantised), a quick happy shimmy.
      const s = Math.sin(t * 0.8) * 2
      const n = Math.floor(s)
      o.headZ = 0.06 * (n + smooth((s - n - 0.85) / 0.15)) * idle
      o.rz = 0.08 * h * Math.sign(Math.sin(t * 10)) * Math.abs(Math.sin(t * 10)) ** 0.3
      break
    }
    case 'spin':
      // Ghost: a lazy idle sway; a point won twirls it all the way round and back.
      o.rz = 0.06 * idle * Math.sin(t * 1.9)
      o.ry = h * TAU * (0.5 - 0.5 * Math.cos(t * 3.2))
      break
  }
  return o
}
