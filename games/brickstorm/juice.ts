import { playSound, type Sound } from '@forge/audio/sound'
import { celebrate } from '@forge/fx/confetti'
import type { Particles } from '@forge/fx/particles'
import type { Shake } from '@forge/fx/shake'
import { prefersReducedMotion } from '@forge/fx/tween'
import { theme } from '@forge/ui/theme'
import type { SimEvent } from './sim/types'
import { BRICK_SOUNDS } from './sounds'

const PENTA = [0, 2, 4, 7, 9]

/** Hit pitch: climbs a pentatonic scale over 3 octaves as the combo grows, then wraps. */
export function comboPitch(combo: number): number {
  const i = Math.max(0, combo - 1)
  const semis = PENTA[i % 5] + 12 * Math.floor((i % 15) / 5)
  return 523.25 * 2 ** (semis / 12)
}

const HEAT = ['#5ab8ff', '#b48cff', '#ff9f43', theme.coral.toLowerCase()]

/** Brick colour by hp relative to the turn: cool for weak bricks, hot for strong ones. */
export function hpColor(hp: number, turn: number): string {
  const t = Math.max(0, Math.min(1, hp / Math.max(1, turn * 2))) * (HEAT.length - 1)
  const i = Math.min(HEAT.length - 2, Math.floor(t))
  const f = t - i
  const a = parseInt(HEAT[i].slice(1), 16)
  const b = parseInt(HEAT[i + 1].slice(1), 16)
  const mix = (shift: number) => {
    const ca = (a >> shift) & 255
    const cb = (b >> shift) & 255
    return Math.round(ca + (cb - ca) * f)
  }
  return '#' + ((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0')
}

const BANNER_LIFE = 1.4
const SOUND_GAP_MS = 30

/** Turns simulation events into particles, shake, flashes, banners and sound. */
export class Juice {
  /** 0..1 white flash over the board; decays in `update`. */
  flash = 0
  banner: { text: string; age: number } | null = null
  /** Current turn, for colouring kill bursts like the bricks. */
  turn = 1
  /** When each kind of sound last played, so big volleys don't stack hundreds of tones. */
  private lastPlayed = new Map<string, number>()

  constructor(
    private particles: Particles,
    private shake: Shake,
  ) {}

  handle(e: SimEvent): void {
    switch (e.type) {
      case 'fire':
        return playSound(BRICK_SOUNDS.fire)
      case 'hit': {
        this.play('hit', { freq: comboPitch(e.combo), dur: 0.06, wave: 'square', vol: 0.25 })
        if (e.crit) this.particles.text(e.x, e.y, 'CRIT', { color: theme.yolk, size: 16 })
        return
      }
      case 'kill':
        this.particles.burst(e.x, e.y, { count: 10, color: hpColor(e.maxHp, this.turn), speed: 160 })
        this.shake.add(0.08)
        return this.play('kill', BRICK_SOUNDS.kill, 0.6)
      case 'pickup':
        this.particles.burst(e.x, e.y, { count: 8, color: e.kind === 'ball' ? theme.chalk : theme.yolk })
        return this.play(e.kind, e.kind === 'ball' ? BRICK_SOUNDS.pickupBall : BRICK_SOUNDS.pickupCoin)
      case 'wall':
        return this.play('wall', BRICK_SOUNDS.wall)
      case 'fever':
        this.show('FEVER!', 0.6)
        return playSound(BRICK_SOUNDS.fever)
      case 'allClear':
        this.show('ALL CLEAR!', 1)
        celebrate()
        return playSound(BRICK_SOUNDS.allClear)
      case 'closeOne':
        this.show('CLOSE ONE!', 0)
        return playSound(BRICK_SOUNDS.closeOne)
      case 'danger':
        return playSound(BRICK_SOUNDS.danger)
      case 'levelUp':
        return playSound(BRICK_SOUNDS.levelUp)
      case 'over':
        this.shake.add(0.6)
        return playSound(BRICK_SOUNDS.over)
      case 'turn':
        this.turn = e.turn
        return
      case 'land':
        return
    }
  }

  update(dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 2.5)
    if (this.banner) {
      this.banner.age += dt
      if (this.banner.age > BANNER_LIFE) this.banner = null
    }
  }

  private play(key: string, sound: Sound, volume = 1): void {
    const now = performance.now()
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < SOUND_GAP_MS) return
    this.lastPlayed.set(key, now)
    playSound(sound, volume)
  }

  private show(text: string, flash: number): void {
    this.banner = { text, age: 0 }
    if (!prefersReducedMotion()) this.flash = Math.max(this.flash, flash)
  }
}
