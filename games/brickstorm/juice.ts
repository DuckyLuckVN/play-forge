import { playSound, type Sound, type Tone } from '@forge/audio/sound'
import { celebrate } from '@forge/fx/confetti'
import type { Particles } from '@forge/fx/particles'
import type { Shake } from '@forge/fx/shake'
import { prefersReducedMotion } from '@forge/fx/tween'
import { theme } from '@forge/ui/theme'
import type { SimEvent } from './sim/types'
import { skillInfo } from './boss-skill-ui'
import { IMPACT_STYLE } from './cosmetics'
import { t } from './i18n'
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

const MYSTERY_TEXT = {
  balls: t('+3 BALLS'),
  pick: t('FREE BOOST'),
  coins: t('+50 COINS'),
  fire: t('FIREBALLS!'),
}

/** Combo announcer: [combo, text, stinger]. */
const ANNOUNCER = [
  [25, t('NICE!'), 'stinger1'],
  [50, t('GREAT!'), 'stinger2'],
  [100, t('AMAZING!'), 'stinger3'],
  [200, t('INSANE!'), 'stinger4'],
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
  pushBack: t('PUSH BACK!'),
  rowBomb: t('ROW BOMB!'),
  freeze: t('FROZEN!'),
  firePack: t('FIRE PACK!'),
  surge: t('BALL SURGE!'),
  megaBomb: t('MEGA BOMB!'),
  colBomb: t('COLUMN BOMB!'),
  laserGrid: t('LASER GRID!'),
  midasTouch: t('MIDAS TOUCH!'),
  ballRain: t('BALL RAIN!'),
  overcharge: t('OVERCHARGE!'),
  vacuum: t('VACUUM!'),
  pierceShot: t('PIERCE SHOT!'),
}

const BANNER_LIFE = 1.4
const SOUND_GAP_MS = 30
/** XP gained within this many seconds counts toward a rush. */
const RUSH_WINDOW = 1
/** Bar heat by how much of a level was gained within the window: glow, fire, white-hot. */
const HEAT_AT = [0.3, 0.8, 1] as const
/** Seconds the "+N XP" tally stays after the last gain. */
const TALLY_HOLD = 1.2
/** Seconds between XP ticks (at most 8 a second). */
const XP_TICK_GAP = 0.125
/** Seconds the level-up celebration plays before the pick screen opens. */
export const LEVEL_UP_INTRO = 1.2
/** Seconds the "bricks are tougher" notice shows. */
export const TOUGHER_LIFE = 2.2
/** Seconds the new column or row glows after the board grows. */
export const GROW_FX_LIFE = 1.4

/** A short XP tick whose pitch climbs an octave as the bar fills. */
export function xpTick(fill: number): Tone[] {
  return [{ freq: 660 * 2 ** Math.max(0, Math.min(1, fill)), dur: 0.05, wave: 'sine', vol: 0.3 }]
}

/** Turns simulation events into particles, shake, flashes, banners and sound. */
export class Juice {
  /** 0..1 white flash over the board; decays in `update`. */
  flash = 0
  banner: { text: string; age: number; big?: boolean } | null = null
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
  /** 0..1 white flash on the boss after it takes damage. */
  bossHit = 0
  /** 0..1 flare on the boss while one of its skills goes off. */
  bossCast = 0
  private bossHp: number | null = null
  /** Seconds since bricks got tougher (a new hp stretch), for the "▲" notice; null when not showing. */
  tougherAge: number | null = null
  /** The board's newest column or row, lit up for a moment after it grows. */
  growFx: { axis: 'col' | 'row'; age: number } | null = null
  /** XP as drawn, in levels (1.5 = halfway through the second level); eases toward the real value. */
  shownXp = 0
  private targetXp = 0
  /** 0..1 glow on the XP bar during a rush of XP; decays in `update`. */
  xpGlow = 0
  /** How hot the XP bar is: 0 calm, 1 glowing, 2 on fire, 3 white-hot. */
  xpHeat = 0
  /** XP gained in the current burst, shown as "+N XP" by the bar; `age` is seconds since the last gain. */
  xpTally: { amount: number; age: number } | null = null
  /** 0..1 flash on the XP bar when it fills up. */
  xpFlash = 0
  /** Spark bursts waiting to be thrown off the end of the XP bar (the renderer takes them). */
  xpSparks = 0
  private xpGains: Array<{ at: number; amount: number }> = []
  private clock = 0
  private lastXpTick = -Infinity
  /** The level-up celebration before the pick screen; null when none is playing. */
  private levelUp: { age: number } | null = null
  private leveled = false
  private freePick = false
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
        if (e.crit) this.particles.text(e.x, e.y, t('CRIT'), { color: theme.yolk, size: 16 })
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
        // Comic impacts pop a word now and then.
        if (IMPACT_STYLE[this.impact]?.text && Math.random() < 0.3)
          this.particles.text(e.x, e.y, IMPACT_STYLE[this.impact].text!, {
            color: theme.yolk,
            size: 16,
            rise: 30,
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
        this.show(t('FEVER!'), 0.6)
        return playSound(BRICK_SOUNDS.fever)
      case 'allClear':
        this.show(t('ALL CLEAR!'), 1)
        celebrate()
        return playSound(BRICK_SOUNDS.allClear)
      case 'closeOne':
        this.show(t('CLOSE ONE!'), 0)
        return playSound(BRICK_SOUNDS.closeOne)
      case 'danger':
        return playSound(BRICK_SOUNDS.danger)
      case 'levelUp':
        this.leveled = true
        return playSound(BRICK_SOUNDS.levelUp)
      case 'over':
        this.shake.add(0.6)
        return playSound(BRICK_SOUNDS.over)
      case 'turn':
        this.turn = e.turn
        return
      case 'tougher':
        this.tougherAge = 0
        return
      case 'boss':
        this.show(t('BOSS FIGHT!'), 0.8)
        this.banner!.big = true
        this.shake.add(0.6)
        playSound(BRICK_SOUNDS.danger)
        return playSound(pitched(BRICK_SOUNDS.explode, 0.6))
      case 'bossSkill': {
        // The boss shouts the skill's name ("MASON!") in its colour.
        const info = skillInfo(e.id)
        this.bossCast = 1
        this.particles.text(e.x, e.y - 30, `${info.text.split(':')[0].toUpperCase()}!`, {
          color: info.color,
          size: 18,
          rise: 40,
        })
        this.shake.add(0.15)
        return playSound(pitched(BRICK_SOUNDS.zap, 0.7))
      }
      case 'pop':
        this.particles.burst(e.x, e.y, { count: 12, color: ['#ff4d6d', '#ffffff'] })
        return playSound(pitched(BRICK_SOUNDS.kill, 1.6))
      case 'bossDown':
        this.show(t('BOSS DOWN! +{coins}', { coins: e.coins }), 1)
        this.particles.text(e.x, e.y + 40, t('+1 BOOST SLOT!'), { color: '#4be3a0', size: 22, rise: 60 })
        this.banner!.big = true
        this.shake.add(0.8)
        celebrate()
        this.flyCoins(e.x, e.y, 20)
        for (let i = 0; i < 3; i++) {
          this.particles.burst(e.x, e.y, {
            count: 30,
            color: ['#ff9f43', '#ffc83d', '#b48cff', '#ffffff'],
            speed: 260 + i * 120,
            life: 0.8,
          })
        }
        playSound(BRICK_SOUNDS.allClear)
        return playSound(BRICK_SOUNDS.jackpot)
      case 'explode':
      case 'zap':
        // Chains ripple outward: each link plays a beat after the one before.
        this.queue.push({ e, at: e.depth * RIPPLE })
        return
      case 'milestone':
        this.show(t('TURN {turn}! +{coins}', { turn: e.turn, coins: e.coins }), 0.5)
        return playSound(BRICK_SOUNDS.jackpot)
      case 'helper': {
        this.show(HELPER_TEXT[e.id], 0.5)
        const boom = e.id === 'rowBomb' || e.id === 'megaBomb' || e.id === 'colBomb'
        if (boom || e.id === 'pushBack') this.shake.add(boom && e.id !== 'rowBomb' ? 0.6 : 0.35)
        return playSound(boom ? BRICK_SOUNDS.explode : BRICK_SOUNDS.secondWind)
      }
      case 'grow':
        this.growFx = { axis: e.axis, age: 0 }
        this.show(e.axis === 'col' ? t('WIDER!') : t('TALLER!'), 0.6)
        return playSound(BRICK_SOUNDS.secondWind)
      case 'jackpot':
        this.show(t('JACKPOT ROW!'), 0.4)
        return playSound(BRICK_SOUNDS.jackpot)
      case 'laser':
        this.lasers.push({ y: e.y, life: 0.3 })
        this.shake.add(0.2)
        return this.play('laser', BRICK_SOUNDS.laser)
      case 'mystery':
        if (e.reward === 'pick') this.freePick = true
        this.particles.text(e.x, e.y, MYSTERY_TEXT[e.reward], { color: theme.yolk, size: 18, rise: 40 })
        return playSound(BRICK_SOUNDS.mystery)
      case 'secondWind':
        this.show(t('SECOND WIND!'), 1)
        this.shake.add(0.4)
        return playSound(BRICK_SOUNDS.secondWind)
      case 'revive':
        this.show(t('REVIVED!'), 0.8)
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

  /** The real XP: `level` levels done and `fill` (0..1) of the next. `snap` skips the easing (a resumed run). */
  setXp(level: number, fill: number, snap = false): void {
    const total = level + fill
    if (snap || total < this.targetXp) {
      // A new or resumed run.
      this.shownXp = this.targetXp = total
      this.xpGains = []
      return
    }
    if (total > this.targetXp) this.xpGains.push({ at: this.clock, amount: total - this.targetXp })
    this.targetXp = total
  }

  /** The boss's hp each frame (null: no boss), so a hit flashes its body. */
  setBossHp(hp: number | null): void {
    if (hp !== null && this.bossHp !== null && hp < this.bossHp) this.bossHit = 1
    this.bossHp = hp
  }

  /** XP points just earned, for the "+N XP" tally. */
  gainXp(points: number): void {
    if (points <= 0) return
    if (this.xpTally) {
      this.xpTally.amount += points
      this.xpTally.age = 0
    } else this.xpTally = { amount: points, age: 0 }
  }

  /** Starts the level-up celebration that plays before the pick screen. */
  startLevelUp(): void {
    this.levelUp = { age: 0 }
    this.show(this.leveled || !this.freePick ? t('LEVEL UP!') : t('FREE BOOST!'), 0.6)
    this.banner!.big = true
    this.leveled = this.freePick = false
    this.xpFlash = 1
    this.xpSparks += 3
    if (!prefersReducedMotion()) this.shake.add(0.3)
    celebrate([theme.yolk, '#4be3a0', '#5ab8ff', '#b48cff'])
    playSound(BRICK_SOUNDS.fanfare)
  }

  /** True once the celebration has played (or was skipped). */
  get levelUpDone(): boolean {
    const len = prefersReducedMotion() ? LEVEL_UP_INTRO / 2 : LEVEL_UP_INTRO
    return !this.levelUp || this.levelUp.age >= len
  }

  skipLevelUp(): void {
    this.levelUp = null
  }

  private updateXp(dt: number): void {
    this.xpFlash = Math.max(0, this.xpFlash - dt * 2)
    this.xpGains = this.xpGains.filter((g) => this.clock - g.at < RUSH_WINDOW)
    const recent = this.xpGains.reduce((sum, g) => sum + g.amount, 0)
    const heat = HEAT_AT.filter((at) => recent >= at).length
    if (heat === 3 && this.xpHeat < 3) playSound(BRICK_SOUNDS.whoosh)
    this.xpHeat = heat
    this.xpGlow = heat > 0 ? 1 : Math.max(0, this.xpGlow - dt * 2)
    if (this.xpTally) {
      this.xpTally.age += dt
      if (this.xpTally.age > TALLY_HOLD) this.xpTally = null
    }
    const gap = this.targetXp - this.shownXp
    if (gap > 0) {
      const before = this.shownXp
      this.shownXp = Math.min(this.targetXp, this.shownXp + Math.max(0.05, gap * 5) * dt)
      if (Math.floor(this.shownXp) > Math.floor(before)) this.xpFlash = 1
    }
    if (this.xpGlow > 0 && gap > 0 && this.clock - this.lastXpTick >= XP_TICK_GAP) {
      this.lastXpTick = this.clock
      this.xpSparks++
      playSound(xpTick(this.shownXp % 1))
    }
    if (this.levelUp) this.levelUp.age += dt
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
    this.clock += dt
    this.bossHit = Math.max(0, this.bossHit - dt * 6)
    this.bossCast = Math.max(0, this.bossCast - dt * 2)
    if (this.tougherAge !== null)
      this.tougherAge = this.tougherAge + dt > TOUGHER_LIFE ? null : this.tougherAge + dt
    if (this.growFx) {
      this.growFx.age += dt
      if (this.growFx.age > GROW_FX_LIFE) this.growFx = null
    }
    this.updateXp(dt)
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
