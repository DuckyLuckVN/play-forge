import { playSound, type Sound, type Tone } from '@forge/audio/sound'
import { celebrate } from '@forge/fx/confetti'
import type { Particles } from '@forge/fx/particles'
import type { Shake } from '@forge/fx/shake'
import { prefersReducedMotion } from '@forge/fx/tween'
import { theme } from '@forge/ui/theme'
import type { SimEvent } from './sim/types'
import { IMPACT_STYLE } from './cosmetics'
import { BRICK_SOUNDS } from './sounds'

const PENTA = [0, 2, 4, 7, 9]

/** Hit pitch: climbs a pentatonic scale over 3 octaves as the combo grows, then wraps. */
export function comboPitch(combo: number): number {
  const i = Math.max(0, combo - 1)
  const semis = PENTA[i % 5] + 12 * Math.floor((i % 15) / 5)
  return 523.25 * 2 ** (semis / 12)
}

/** A ball-brick hit: the combo note plus a soft thump an octave down. */
export function hitSound(combo: number): Tone[] {
  const f = comboPitch(combo)
  return [
    { freq: f, dur: 0.06, wave: 'square', vol: 0.45 },
    { freq: f / 2, dur: 0.05, wave: 'triangle', vol: 0.3 },
  ]
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

const MYSTERY_TEXT = { balls: '+3 BALLS', pick: 'FREE BOOST', coins: '+50 COINS', fire: 'FIREBALLS!' }

/** Combo announcer: [combo, text, stinger]. */
const ANNOUNCER = [
  [25, 'NICE!', 'stinger1'],
  [50, 'GREAT!', 'stinger2'],
  [100, 'AMAZING!', 'stinger3'],
  [200, 'INSANE!', 'stinger4'],
] as const

/** A sound with every tone's pitch scaled, for rising chain reactions. */
export function pitched(sound: Tone[], factor: number): Tone[] {
  return sound.map((t) => ({ ...t, freq: t.freq * factor, to: t.to && t.to * factor }))
}

/** Seconds between links of a chain reaction. */
const RIPPLE = 0.06
const HITSTOP = 0.04
/** Seconds a coin takes to fly to the counter. */
export const COIN_FLY = 0.5

const HELPER_TEXT = {
  pushBack: 'PUSH BACK!',
  rowBomb: 'ROW BOMB!',
  freeze: 'FROZEN!',
  firePack: 'FIRE PACK!',
  surge: 'BALL SURGE!',
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
  /** Lightning arcs to draw; the renderer reads this list. */
  zaps: Array<{ x1: number; y1: number; x2: number; y2: number; life: number }> = []
  /** Laser beams to draw across a row. */
  lasers: Array<{ y: number; life: number }> = []
  /** Equipped brick-break effect id. */
  impact = 'impact:shards'
  /** Seconds the simulation should freeze for (hitstop on big chains). */
  hitstop = 0
  /** Coins as shown on the HUD; eases toward the real total. */
  shownCoins = 0
  private targetCoins = 0
  /** Coins flying from a broken brick to the HUD counter. */
  coinFlyers: Array<{ x0: number; y0: number; age: number; delay: number }> = []
  /** Chain effects waiting for their ripple delay. */
  private queue: Array<{ e: Extract<SimEvent, { type: 'explode' | 'zap' }>; at: number }> = []
  private announced = 0
  /** When each kind of sound last played, so big volleys don't stack hundreds of tones. */
  private lastPlayed = new Map<string, number>()

  constructor(
    private particles: Particles,
    private shake: Shake,
  ) {}

  handle(e: SimEvent): void {
    switch (e.type) {
      case 'fire':
        this.announced = 0
        return playSound(BRICK_SOUNDS.fire)
      case 'launch':
        return this.play('launch', BRICK_SOUNDS.launch)
      case 'hit': {
        this.play('hit', hitSound(e.combo))
        if (e.crit) this.particles.text(e.x, e.y, 'CRIT', { color: theme.yolk, size: 16 })
        const level = ANNOUNCER.filter(([at]) => e.combo >= at).length
        if (level > this.announced) {
          this.announced = level
          const [, text, sound] = ANNOUNCER[level - 1]
          this.show(text, 0.3)
          playSound(BRICK_SOUNDS[sound])
        }
        return
      }
      case 'kill':
        this.particles.burst(e.x, e.y, {
          color: e.kind === 'gold' ? theme.yolk : hpColor(e.maxHp, this.turn),
          ...IMPACT_STYLE[this.impact],
        })
        this.flyCoins(e.x, e.y, Math.min(e.coins, 5))
        if (e.kind === 'gold') {
          this.particles.burst(e.x, e.y, {
            count: 14,
            color: theme.yolk,
            speed: 260,
            gravity: 600,
            shape: 'circle',
          })
          this.play('coin', BRICK_SOUNDS.coin)
        }
        this.shake.add(0.08)
        return this.play('kill', BRICK_SOUNDS.kill, 0.8)
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
      case 'explode':
      case 'zap':
        // Chains ripple outward: each link plays a beat after the one before.
        this.queue.push({ e, at: e.depth * RIPPLE })
        return
      case 'milestone':
        this.show(`TURN ${e.turn}! +${e.coins}`, 0.5)
        return playSound(BRICK_SOUNDS.jackpot)
      case 'helper':
        this.show(HELPER_TEXT[e.id], 0.5)
        if (e.id === 'rowBomb' || e.id === 'pushBack') this.shake.add(0.35)
        return playSound(e.id === 'rowBomb' ? BRICK_SOUNDS.explode : BRICK_SOUNDS.secondWind)
      case 'jackpot':
        this.show('JACKPOT ROW!', 0.4)
        return playSound(BRICK_SOUNDS.jackpot)
      case 'laser':
        this.lasers.push({ y: e.y, life: 0.3 })
        this.shake.add(0.2)
        return this.play('laser', BRICK_SOUNDS.laser)
      case 'mystery':
        this.particles.text(e.x, e.y, MYSTERY_TEXT[e.reward], { color: theme.yolk, size: 18, rise: 40 })
        return playSound(BRICK_SOUNDS.mystery)
      case 'secondWind':
        this.show('SECOND WIND!', 1)
        this.shake.add(0.4)
        return playSound(BRICK_SOUNDS.secondWind)
      case 'revive':
        this.show('REVIVED!', 0.8)
        return playSound(BRICK_SOUNDS.revive)
      case 'land':
        return
    }
  }

  /** The real coin total the HUD counter should ease toward. */
  setCoins(coins: number): void {
    if (coins < this.targetCoins) this.shownCoins = coins // a new run
    this.targetCoins = coins
  }

  private flyCoins(x: number, y: number, n: number): void {
    for (let i = 0; i < n && this.coinFlyers.length < 40; i++) {
      this.coinFlyers.push({ x0: x, y0: y, age: 0, delay: i * 0.05 })
    }
  }

  private playChain(e: Extract<SimEvent, { type: 'explode' | 'zap' }>): void {
    if (e.type === 'explode') {
      this.particles.burst(e.x, e.y, {
        count: 26,
        color: ['#ff9f43', '#ffc83d', '#ff6b6b'],
        speed: 320,
        life: 0.5,
      })
      this.shake.add(0.25)
      // Rising boom pitch along the chain.
      playSound(pitched(BRICK_SOUNDS.explode, 1 + 0.12 * Math.min(e.depth, 6)))
      if (e.depth >= 2) this.hitstop = Math.max(this.hitstop, HITSTOP)
    } else {
      this.zaps.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.18 })
      this.play('zap', BRICK_SOUNDS.zap)
      if (e.depth >= 2) this.hitstop = Math.max(this.hitstop, HITSTOP)
    }
  }

  update(dt: number): void {
    this.hitstop = Math.max(0, this.hitstop - dt)
    for (const q of this.queue) q.at -= dt
    const due = this.queue.filter((q) => q.at <= 1e-9)
    this.queue = this.queue.filter((q) => q.at > 1e-9)
    for (const q of due) this.playChain(q.e)
    for (const c of this.coinFlyers) c.age += dt
    this.coinFlyers = this.coinFlyers.filter((c) => c.age < c.delay + COIN_FLY)
    const gap = this.targetCoins - this.shownCoins
    if (gap > 0) {
      const before = Math.floor(this.shownCoins)
      this.shownCoins = Math.min(this.targetCoins, this.shownCoins + Math.max(1, gap * 6) * dt)
      if (Math.floor(this.shownCoins) > before) this.play('coin', BRICK_SOUNDS.coin)
    }
    for (const z of this.zaps) z.life -= dt
    this.zaps = this.zaps.filter((z) => z.life > 0)
    for (const l of this.lasers) l.life -= dt
    this.lasers = this.lasers.filter((l) => l.life > 0)
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
