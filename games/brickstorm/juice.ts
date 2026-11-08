import { playSound, type Sound, type Tone } from '@forge/audio/sound'
import { celebrate } from '@forge/fx/confetti'
import type { Particles } from '@forge/fx/particles'
import type { Shake } from '@forge/fx/shake'
import { prefersReducedMotion } from '@forge/fx/tween'
import { theme } from '@forge/ui/theme'
import type { Boss, Brick, SimEvent } from './sim/types'
import { skillGroup, skillInfo } from './boss-skill-ui'
import { IMPACT_STYLE } from './cosmetics'
import { t } from './i18n'
import { BOSS_WARN_TURNS } from './sim/boss'
import { CELL, TOP } from './sim/config'
import { HEROES, type HeroId } from './sim/heroes'
import {
  BOSS_SOUNDS,
  BRICK_SOUNDS,
  HAZARD_SOUNDS,
  HEALTH_SOUNDS,
  HERO_SOUNDS,
  SPECIAL_SOUNDS,
} from './sounds'
import { arenaProgress, BOSS_DROP, bossDrop } from './boss-entrance'
import { HAZARD_LABEL, SPECIAL_HIT, SPECIAL_LABEL_GAP, SPECIAL_TRIGGER } from './special-fx'

/** Banner per storm wave. */
/** What each storm wave means, for the notice card under its banner. */
export const STORM_EXPLAIN = {
  wall: 'Bricks fill every column but one.',
  iron: 'Armoured bricks: plain balls chip 1 per hit; fire, bombs and lasers hit fully.',
  gold: 'A row of gold bricks: they pay double coins.',
  bombs: 'A row of bomb bricks: break one and they chain.',
} as const

/** Banner for each boss attack as it lands. */
export const ATTACK_TEXT = {
  slam: 'GROUND SLAM!',
  barrage: 'ROCKETS LOCKED ON!',
  hex: 'HEXED!',
  thorns: 'THORNS!',
} as const

export const STORM_TEXT = {
  wall: 'STORM: BRICK WALL!',
  iron: 'STORM: IRON WAVE!',
  gold: 'STORM: GOLD RUSH!',
  bombs: 'STORM: BOMB WAVE!',
} as const

/** Seconds the knockout plays before the results (and the revive offer) show. */
export const DEFEAT_HOLD = 2.2

/** Seconds a boss rocket takes to fly to the hero. */
export const ROCKET_FLY = 0.45

/** Health and healing green. */
export const HEAL_COLOR = '#69db7c'

/** A boss's death: explosions until this many seconds, then the finale; it is over at BOSS_DEATH_LIFE. */
/** Arena growth: rumble until ARENA_OPEN, the rows open until ARENA_LAND, then the thud. A shrink squeezes until ARENA_SQUEEZE. */
/** After a combo ends its multiplier stays this long, then fades over COMBO_FADE seconds. */
export const COMBO_HOLD = 0.6
export const COMBO_FADE = 0.8
/** How fast the XP bar's heat cools after a combo, in multiplier per second. */
const BAR_COOL = 1.2
export const ARENA_OPEN = 1
export const ARENA_LAND = 3
export const ARENA_SQUEEZE = 1.8
export const BOSS_DEATH_BOOM = 2
export const BOSS_DEATH_LIFE = 2.7
export const SHOCKWAVE_LIFE = 0.7

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
  pick: t('FREE SKILL'),
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
  potion: t('HEALED!'),
}

const BANNER_LIFE = 1.4
const SOUND_GAP_MS = 30
/** Special-brick hit sounds come at most this often per kind (a volley can hit armour fifty times). */
const HIT_SOUND_GAP_MS = 90
/** Above this many live particles, special-brick hits stop adding sparks (big volleys stay smooth). */
const HIT_SPARK_LIMIT = 250
/** XP gained within this many seconds counts toward a rush. */
const RUSH_WINDOW = 1.5
/** Bar heat by how much of a level was gained within the window: glow, fire, white-hot (lightning). */
const HEAT_AT = [0.1, 0.25, 0.5] as const
/** Seconds the "+N XP" tally stays after the last gain. */
const TALLY_HOLD = 1.2
/** Seconds between XP ticks (at most 8 a second). */
const XP_TICK_GAP = 0.125
/** Seconds a pill notice under the HUD ("▲ Tougher bricks", "☠ Boss in 3 turns") shows. */
export const PILL_LIFE = 2.2

/** A small notice under the HUD; several stack. */
export interface TopPill {
  text: string
  color: string
  age: number
}
/** Seconds the new column or row glows after the board grows. */
export const GROW_FX_LIFE = 1.4

/** Where the XP bar is filled up to, for orbs flying into it. */
export interface BarEnds {
  tip: number
  y: number
  boardW: number
}

/**
 * An XP orb's position at progress `k` (0..1) for a hit brick at (x0, y0): it
 * curves out sideways to the nearest side wall and up into the XP bar where it
 * is filled up to (a quadratic curve bent at the wall, level with the brick).
 */
export function orbPoint(x0: number, y0: number, k: number, bar: BarEnds): { x: number; y: number } {
  const left = x0 < bar.boardW / 2
  const wallX = left ? ORB_WALL_INSET : bar.boardW - ORB_WALL_INSET
  const a = (1 - k) * (1 - k)
  const b = 2 * (1 - k) * k
  const c = k * k
  return { x: a * x0 + b * wallX + c * bar.tip, y: (a + b) * y0 + c * bar.y }
}

/**
 * An orb's opacity by how far it has travelled from its brick's centre: hidden
 * while over the brick, so the brick's number stays readable, then fading in.
 */
export function orbAlpha(travelled: number): number {
  return Math.max(0, Math.min(1, (travelled - CELL * 0.45) / (CELL * 0.35)))
}

/** How far from the side walls the orbs travel. */
const ORB_WALL_INSET = 6
/** Most XP orbs in flight at once. */
const MAX_XP_ORBS = 24
/** Seconds an XP orb takes to reach the bar. */
export const XP_ORB_FLY = 0.6
/** Volume of an XP tick outside a rush: there, but quiet. */
const CALM_TICK_VOLUME = 0.35

/** Seconds the level badge pops and "LEVEL UP!" shows after the bar crosses the line. */
export const LEVEL_POP_LIFE = 1
/** Fewest seconds between level chimes, so a multi-level burst stays musical. */
const CHIME_GAP = 0.2

/** The level chime: an arpeggio with a sparkle on top, a little higher each level (capped). */
export function levelChime(level: number): Tone[] {
  const up = 2 ** (Math.min(Math.max(level, 1) - 1, 12) / 24)
  return pitched(
    [...BRICK_SOUNDS.levelUp, { freq: 2093, to: 3136, dur: 0.18, wave: 'sine', vol: 0.18, at: 0.2 }],
    up,
  )
}

/** XP bar tremble (units) by combo XP multiplier: none at first, stronger at ×1.5 and FEVER. */
const BAR_SHAKE: Record<number, number> = { 1.5: 0.8, 2: 1.8 }

/** How far the XP bar trembles for a live combo of `mult` (0: still). */
export function barShake(mult: number): number {
  return BAR_SHAKE[mult] ?? 0
}

/** A short XP tick whose pitch climbs an octave as the bar fills. */
export function xpTick(fill: number): Tone[] {
  return [{ freq: 660 * 2 ** Math.max(0, Math.min(1, fill)), dur: 0.05, wave: 'sine', vol: 0.3 }]
}

/** Turns simulation events into particles, shake, flashes, banners and sound. */
export class Juice {
  /** 0..1 white flash over the board; decays in `update`. */
  flash = 0
  /** `color` overrides the default (yolk, or XP green when big). */
  /** `life`: seconds before it has faded (1.4 unless set). */
  banner: { text: string; age: number; big?: boolean; color?: string; life?: number } | null = null
  /** Current turn, for colouring kill bursts like the bricks. */
  turn = 1
  /** Lightning arcs to draw; the renderer reads this list. */
  zaps: Array<{ x1: number; y1: number; x2: number; y2: number; life: number }> = []
  /**
   * Boss attacks in flight, drawn by the renderer: a rocket (explodes on the
   * hero at the end), a hex bolt, a thorn spark or a drain stream. `age` and
   * `life` in seconds; a rocket carries the damage it shows on impact.
   */
  beams: Array<{
    kind: 'rocket' | 'bolt' | 'stream'
    x1: number
    y1: number
    x2: number
    y2: number
    color: string
    age: number
    life: number
    damage?: number
  }> = []
  /** The run just ended: seconds into the knockout, once it started (it waits for rockets in flight). */
  private defeat: { age: number; started: boolean } | null = null

  /** True once the knockout has played out (or there is none): the results may show. */
  get defeatDone(): boolean {
    return !this.defeat || this.defeat.age >= DEFEAT_HOLD
  }

  /** Advances the knockout; it starts once no rocket is still on its way to the hero. */
  private updateDefeat(dt: number): void {
    const d = this.defeat
    if (!d) return
    if (!d.started) {
      if (this.beams.some((b) => b.kind === 'rocket')) return
      d.started = true
      this.show(t('K.O.!'), 0.6)
      this.banner!.big = true
      this.banner!.color = theme.coral
      this.shake.add(1)
      this.hitstop = Math.max(this.hitstop, 0.15)
      this.particles.burst(this.heroX, this.floorY - 20, {
        count: 40,
        color: [theme.coral, '#ffffff', '#5c5470'],
        speed: 260,
        life: 0.9,
      })
      playSound(BRICK_SOUNDS.over)
    }
    d.age += dt
    // The red sting lingers while the hero is down.
    this.hurtFlash = Math.max(this.hurtFlash, 0.6 * (1 - d.age / DEFEAT_HOLD))
  }

  /** The hero's x (where boss attacks fly to); the renderer keeps it current. */
  heroX = 0
  /** Laser beams to draw across a row. */
  lasers: Array<{ y: number; life: number }> = []
  /** Equipped brick-break effect id. */
  impact = 'impact:shards'
  /** Seconds the simulation should freeze for (hitstop on big chains). */
  hitstop = 0
  /** Coins as shown on the HUD; eases toward the real total. */
  shownCoins = 0
  private targetCoins = 0
  /** Coins just earned, shown as "+N" under the HUD wallet; `age` is seconds since the last gain. */
  coinTally: { amount: number; age: number } | null = null
  /** XP orbs flying from a hit brick to the XP bar. */
  xpOrbs: Array<{ x0: number; y0: number; age: number }> = []
  /** Coins flying from a broken brick to the HUD counter. */
  coinFlyers: Array<{ x0: number; y0: number; age: number; delay: number }> = []
  /** 0..1 white flash on the boss after it takes damage. */
  bossHit = 0
  /** 0..1 flare on the boss while one of its skills goes off. */
  bossCast = 0
  private bossHp: number | null = null
  /** Small notices under the HUD (tougher bricks, the boss countdown), newest last. */
  pills: TopPill[] = []
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
  /** XP multiplier from the live combo (1: none); while above 1 the XP bar burns. */
  comboMult = 1
  /** The multiplier as the XP bar feels it: up at once with the combo, cooling gently after it ends. */
  barMult = 1
  /** The multiplier shown by the XP tally: the last one above 1, kept while it fades out. */
  comboShown = 1
  /** Seconds since the multiplier last stepped up (null: never), for its one slam. */
  comboTierAge: number | null = null
  /** 1 while a combo multiplies XP; fades to 0 in about 0.2 s after it ends. */
  comboFade = 0
  private comboHold = 0
  /** The level badge popping after the bar crossed the line; `count` levels in this burst. */
  levelPop: { age: number; count: number } | null = null
  private lastChime = -Infinity
  private xpGains: Array<{ at: number; amount: number }> = []
  private clock = 0
  private lastXpTick = -Infinity
  /** The level-up celebration before the pick screen; null when none is playing. */
  private leveled = false
  private freePick = false
  /** Chain effects waiting for their ripple delay. */
  private queue: Array<{ e: Extract<SimEvent, { type: 'explode' | 'zap' }>; at: number }> = []
  /** Bricks a boss smashed, bursting one after another: `in` seconds until each goes. */
  private rubble: Array<{ x: number; y: number; in: number }> = []
  private announced = 0
  /** 0..1 after a hit bounced off the boss: it smirks. */
  bossSmug = 0
  /** 0..1 after the boss hurt the hero: it laughs. */
  bossGloat = 0
  /** 0..1 red flash over the board after a crash; decays in `update`. */
  hurtFlash = 0
  /** Health as the bar draws it: drops at once, while `hpGhost` drains down to it so the loss shows. */
  hpGhost: number | null = null
  /** Last health loss / gain popping by the bar; `age` in seconds. */
  hpPop: { amount: number; age: number } | null = null
  /** 0..1 glow on the health bar after a heal. */
  healGlow = 0
  /** 0..1 shake of the hero portrait after a hit. */
  heroHurt = 0
  /** 0..1 flare of the hero portrait when its trait goes off. */
  heroCast = 0
  private hp: number | null = null
  /** When each kind of sound last played, so big volleys don't stack hundreds of tones. */
  private lastPlayed = new Map<string, number>()
  private lastLabel = new Map<string, number>()

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
      case 'orbHop':
        // A skill orb moved: a puff where it was, a sparkle where it lands.
        if (e.from)
          this.particles.burst(e.from.x, e.from.y, {
            count: 8,
            color: ['#4be3a0', theme.chalk],
            speed: 90,
            life: 0.3,
          })
        this.particles.burst(e.x, e.y, {
          count: 14,
          color: ['#4be3a0', '#ffffff', theme.yolk],
          speed: 160,
          life: 0.45,
        })
        return this.play('orbHop', BRICK_SOUNDS.pickupBall, 0.4)
      case 'xpFly':
        if (this.xpOrbs.length < MAX_XP_ORBS) this.xpOrbs.push({ x0: e.x, y0: e.y, age: 0 })
        return
      case 'hit': {
        this.play('hit', hitSound(e.combo))
        // Every hit feeds the XP bar; an orb shows it (capped so big volleys stay readable).
        if (this.xpOrbs.length < MAX_XP_ORBS) this.xpOrbs.push({ x0: e.x, y0: e.y, age: 0 })
        if (e.crit) this.particles.text(e.x, e.y, t('CRIT'), { color: theme.yolk, size: 16 })
        const level = ANNOUNCER.filter(([at]) => e.power >= at).length
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
        this.particles.burst(e.x, e.y, {
          count: e.kind === 'skill' || e.kind === 'socket' ? 18 : 8,
          color: e.kind === 'ball' ? theme.chalk : e.kind === 'skill' ? '#4be3a0' : theme.yolk,
        })
        return this.play(e.kind, e.kind === 'ball' ? BRICK_SOUNDS.pickupBall : BRICK_SOUNDS.pickupCoin)
      case 'orbPick':
        // A skill is coming: a bright pop and a word, so the pick screen at the turn's end is expected.
        this.particles.burst(e.x, e.y, {
          count: 26,
          color: ['#4be3a0', '#ffffff', theme.yolk],
          speed: 240,
          life: 0.5,
        })
        // Kept clear of the side walls so the whole line shows.
        this.particles.text(
          Math.min(Math.max(e.x, 110), this.width - 110),
          e.y - 14,
          t('Skill pick after this turn!'),
          {
            color: '#4be3a0',
            size: 15,
            rise: 44,
          },
        )
        this.shake.add(0.12)
        return playSound(BRICK_SOUNDS.levelUp)
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
        // The chime plays when the bar visibly crosses the line (see updateXp).
        this.leveled = true
        return
      case 'over':
        // The knockout plays (after any rocket still flying lands), then the results.
        this.defeat = { age: 0, started: false }
        return
      case 'turn':
        this.turn = e.turn
        return
      case 'tougher':
        this.pills.push({ text: t('▲ Tougher bricks'), color: 'rgb(255 107 107 / 0.92)', age: 0 })
        return
      case 'bossSoon': {
        // A pill under the HUD (like tougher bricks), redder and louder as the boss gets closer.
        const urgency = BOSS_WARN_TURNS - e.turns // 0, 1, 2
        this.pills.push({
          text: e.turns === 1 ? t('☠ Boss next turn!') : t('☠ Boss in {n} turns', { n: e.turns }),
          color: e.turns === 1 ? 'rgb(255 77 109 / 0.95)' : 'rgb(180 140 255 / 0.92)',
          age: 0,
        })
        this.shake.add(0.05 * urgency)
        return playSound(pitched(BRICK_SOUNDS.danger, 0.85 + 0.15 * urgency))
      }
      case 'boss':
        // The banner now; the boss itself drops in once the arena has opened (see updateBossEntrance).
        // A red banner that hangs, a siren, a rumble that builds while the arena opens.
        this.show(t('BOSS FIGHT!'), 0.4)
        this.banner = { ...this.banner!, big: true, color: theme.coral, life: 2.8 }
        this.bossEnter = {
          age: this.arenaFx?.grow ? this.arenaFx.age : ARENA_LAND,
          landed: false,
          falling: false,
        }
        this.shake.add(0.25)
        playSound(BOSS_SOUNDS.siren)
        return playSound(BRICK_SOUNDS.danger)
      case 'bossSkill': {
        // The boss shouts the skill's name ("MASON!") in its colour.
        const info = skillInfo(e.id)
        this.bossCast = 1
        this.particles.text(e.x, e.y - 30, `${info.text.split(':')[0].toUpperCase()}!`, {
          color: info.color,
          size: 18,
          rise: 40,
        })
        // Each kind of skill has its own sound and burst; rage shakes the screen.
        const group = skillGroup(e.id)
        this.particles.burst(e.x, e.y, {
          count: group === 'rage' ? 40 : 24,
          color: [info.color, '#ffffff'],
          speed: group === 'rage' ? 420 : 240,
          life: 0.6,
        })
        this.shake.add(group === 'rage' ? 0.5 : 0.15)
        return this.play('cast', BOSS_SOUNDS[group])
      }
      case 'bossHit':
        this.particles.burst(e.x, e.y, {
          count: 6,
          color: [e.skill ? skillInfo(e.skill).color : theme.chalk, '#ffffff'],
          speed: 180,
          life: 0.3,
        })
        // Deeper as it weakens: the fight sounds like it's going your way.
        return this.play('bossHit', pitched(BOSS_SOUNDS.hit, 0.6 + 0.6 * e.life))
      case 'bossBlock':
        this.bossSmug = 1
        this.particles.burst(e.x, e.y, { count: 5, color: ['#9fe7ff', '#ffffff'], speed: 140, life: 0.25 })
        return this.play('bossBlock', BOSS_SOUNDS.block)
      case 'pop':
        this.particles.burst(e.x, e.y, { count: 12, color: ['#ff4d6d', '#ffffff'] })
        return playSound(pitched(BRICK_SOUNDS.kill, 1.6))
      case 'bossDown': {
        // The boss doesn't just vanish: its body stays, cracks and blows up
        // in a chain of explosions, then a flash and a shockwave finish it.
        const cells = e.ghost?.parts ?? []
        const xs = cells.map((p) => p.col * CELL)
        const ys = cells.map((p) => TOP + p.row * CELL)
        const box = cells.length
          ? {
              x: Math.min(...xs),
              y: Math.min(...ys),
              w: Math.max(...xs) - Math.min(...xs) + CELL,
              h: Math.max(...ys) - Math.min(...ys) + CELL,
            }
          : { x: e.x - CELL, y: e.y - CELL, w: 2 * CELL, h: 2 * CELL }
        this.bossDeath = {
          age: 0,
          x: e.x,
          y: e.y,
          coins: e.coins,
          box,
          ghost: e.ghost ?? null,
          booms: 0,
          finished: false,
        }
        this.hitstop = Math.max(this.hitstop, 0.12)
        this.shake.add(0.5)
        return playSound(pitched(BRICK_SOUNDS.explode, 0.5))
      }
      case 'explode':
      case 'zap':
        // Chains ripple outward: each link plays a beat after the one before.
        this.queue.push({ e, at: e.depth * RIPPLE })
        return
      case 'milestone':
        this.show(t('TURN {turn}! +{coins} COINS', { turn: e.turn, coins: e.coins }), 0.5)
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
      case 'bonus':
        this.show(t('BONUS ROUND!'), 0.5)
        return playSound(BRICK_SOUNDS.jackpot)
      case 'slot':
        this.show(t('NEW SKILL SLOT!'), 1)
        this.shake.add(0.3)
        celebrate([theme.yolk, '#4be3a0'])
        return playSound(BRICK_SOUNDS.allClear)
      case 'bonusMiss':
        return playSound(SPECIAL_SOUNDS.fizzle)
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
      case 'breach':
        if (this.bossHp !== null) this.bossGloat = 1
        this.hurtFlash = prefersReducedMotion() ? 0.4 : 1
        this.heroHurt = 1
        this.shake.add(e.boss ? 0.7 : 0.45)
        this.hitstop = Math.max(this.hitstop, 0.08)
        for (const p of e.at) {
          this.particles.burst(p.x, p.y, { count: 16, color: theme.coral, speed: 260, gravity: 500 })
          this.particles.text(p.x, p.y - 10, t('CRASH!'), { color: theme.coral, size: 16, rise: 30 })
        }
        return playSound(e.boss ? HEALTH_SOUNDS.bossCrash : HEALTH_SOUNDS.hurt)
      case 'heal':
        this.healGlow = 1
        if (e.source === 'regen') return this.play('regen', HEALTH_SOUNDS.regen)
        if (e.source === 'boss' || e.source === 'potion' || e.source === 'heart')
          this.particles.text(this.width / 2, this.healY, t('+{n} HEALTH', { n: e.amount }), {
            color: HEAL_COLOR,
            size: 18,
            rise: 40,
          })
        return playSound(HEALTH_SOUNDS.heal)
      case 'heroHit':
        this.bossGloat = 1
        if (e.source === 'rocket') {
          // The rocket is still flying: its impact shows the hit (see updateBeams).
          const rocket = [...this.beams].reverse().find((b) => b.kind === 'rocket' && b.damage === undefined)
          if (rocket) {
            rocket.damage = e.damage
            return
          }
        }
        if (e.source === 'thorn') this.beam('bolt', e.x, e.y, this.heroX, this.floorY, '#c77dff', 0.25)
        // A boss attack hits the hero: a red bolt from the spot, the screen stings.
        this.hurtFlash = Math.max(this.hurtFlash, prefersReducedMotion() ? 0.3 : 0.6)
        this.heroHurt = 1
        this.shake.add(e.source === 'slam' ? 0.6 : 0.15)
        this.particles.burst(e.x, e.y, { count: 10, color: ['#c77dff', '#ff6b6b'], speed: 180 })
        this.particles.text(e.x, e.y - 8, `−${e.damage}`, { color: theme.coral, size: 15, rise: 30 })
        return this.play('heroHit', e.source === 'slam' ? HEALTH_SOUNDS.bossCrash : HEALTH_SOUNDS.hurt, 0.7)
      case 'bossWarn':
        if (e.id === 'step') return playSound(BOSS_SOUNDS.movement)
        this.show(t('⚠ GROUND SLAM NEXT TURN!'), 0.2)
        return playSound(BRICK_SOUNDS.danger)
      case 'eaten':
        // Slime gulps, the void swallows (an inward swirl), a burning ball puffs out.
        this.particles.burst(e.x, e.y, {
          count: 10,
          color:
            e.by === 'slime'
              ? ['#63d471', '#3fae52']
              : e.by === 'void'
                ? ['#9d4edd', '#1e1830']
                : ['#ff922b', '#5c5470'],
          speed: e.by === 'void' ? 90 : 160,
          life: 0.4,
        })
        this.label(
          `eaten:${e.by}`,
          e.x,
          e.y,
          HAZARD_LABEL[e.by](),
          e.by === 'slime' ? '#63d471' : e.by === 'void' ? '#c77dff' : '#ff922b',
        )
        return this.play('eaten', HAZARD_SOUNDS[e.by], 0.6)
      case 'ignite':
        this.particles.burst(e.x, e.y, { count: 8, color: ['#ff922b', '#ffc83d'], speed: 140, life: 0.35 })
        this.label('ignite', e.x, e.y, HAZARD_LABEL.ignite(), '#ff922b')
        return this.play('ignite', HAZARD_SOUNDS.ignite, 0.6)
      case 'douse':
        this.particles.burst(e.x, e.y, { count: 10, color: ['#4dabf7', '#e7f5ff'], speed: 150, life: 0.4 })
        this.label('douse', e.x, e.y, HAZARD_LABEL.douse(), '#74c0fc')
        return this.play('douse', HAZARD_SOUNDS.douse, 0.6)
      case 'special': {
        const fx = (e.trigger ? SPECIAL_TRIGGER : SPECIAL_HIT)[e.kind]
        if (!fx) return
        // Hits on a crowded screen skip their sparks (the sound and word still say it); triggers always burst.
        if (e.trigger || this.particles.count < HIT_SPARK_LIMIT)
          this.particles.burst(e.x, e.y, { count: fx.count, color: fx.colors, speed: fx.speed, life: 0.35 })
        if (fx.label) this.label(`special:${e.kind}`, e.x, e.y, fx.label(), fx.labelColor ?? theme.chalk)
        // Hits can come fifty a volley: spaced out and quieter than a trigger.
        return this.play(
          `special:${e.kind}:${e.trigger}`,
          fx.sound,
          e.trigger ? 0.8 : 0.45,
          e.trigger ? SOUND_GAP_MS : HIT_SOUND_GAP_MS,
        )
      }
      case 'pickupFade':
        // An unused laser fizzles out at the end of its turn.
        this.particles.burst(e.x, e.y, { count: 8, color: ['#ff6fb5', '#ffd6ec'], speed: 80, life: 0.45 })
        return this.play('pickupFade', SPECIAL_SOUNDS.fizzle, 0.6)
      case 'rocket':
        this.beam('rocket', e.x, e.y, e.tx, e.ty, '#ff922b', ROCKET_FLY)
        return playSound(BRICK_SOUNDS.whoosh)
      case 'drain':
        this.beam('stream', e.x, e.y, e.tx, e.ty, '#ff3b5c', 0.7)
        return
      case 'bossStep':
        this.shake.add(0.2)
        return playSound(pitched(BRICK_SOUNDS.explode, 0.45))
      case 'bossCrush': {
        // The boss bulldozes through: the nearest bricks burst first, then outward.
        // Arriving, it crushes them as it lands, not before it shows up.
        const wait = this.arenaFx?.grow ? Math.max(0, ARENA_LAND + BOSS_DROP - this.arenaFx.age) : 0
        for (const at of e.at)
          this.rubble.push({ ...at, in: wait + Math.random() * 0.12 + this.rubble.length * 0.04 })
        if (!wait) this.shake.add(Math.min(0.8, 0.2 + 0.05 * e.at.length))
        if (e.coins > 0)
          this.particles.text(e.at[0].x, e.at[0].y - 10, `+${e.coins}`, {
            color: theme.yolk,
            size: 15,
            rise: 34,
          })
        if (!wait) playSound(pitched(BRICK_SOUNDS.explode, 0.55))
        return
      }
      case 'bossAttack': {
        this.bossCast = 1
        this.show(t(ATTACK_TEXT[e.id]), e.id === 'slam' ? 0.7 : 0.3)
        this.banner!.big = e.id === 'slam'
        if (e.id === 'slam') {
          // The ground heaves: a big shake, a dust wave rolling across the floor, a boom.
          this.shake.add(1)
          this.hitstop = Math.max(this.hitstop, 0.1)
          for (let i = 0; i < 14; i++) {
            const x = ((i + 0.5) / 14) * this.width
            this.particles.burst(x, this.floorY, {
              count: 6,
              color: ['#c9c3e6', '#8a83a8', '#e8590c'],
              speed: 220,
              gravity: 500,
              life: 0.7,
            })
          }
          this.particles.burst(e.x, e.y, {
            count: 30,
            color: ['#e8590c', '#ffc83d', '#ffffff'],
            speed: 320,
            life: 0.6,
          })
          playSound(pitched(BRICK_SOUNDS.explode, 0.4))
          return playSound(HEALTH_SOUNDS.bossCrash)
        }
        this.shake.add(0.3)
        for (const to of e.targets ?? []) this.beam('bolt', e.x, e.y, to.x, to.y, skillInfo(e.id).color, 0.35)
        this.particles.burst(e.x, e.y, {
          count: 18,
          color: [skillInfo(e.id).color, '#ffffff'],
          speed: 240,
          life: 0.5,
        })
        return playSound(BOSS_SOUNDS.attack)
      }
      case 'arena':
        // Before: a rumble. Then the new rows open (or the floor squeezes in). After: a thud and dust.
        this.arenaFx = {
          grow: e.grow,
          age: 0,
          landed: false,
          cols: e.cols ?? 0,
          rows: e.rows ?? 0,
          held: !e.grow,
        }
        // After a boss the arena shrinks while the pick screen is up: it waits (held) until
        // the player is back on the board (releaseArena), so they see it close in.
        if (!e.grow) return
        this.show(t('THE ARENA GROWS!'), 0.3)
        this.shake.add(0.35)
        return playSound(HEALTH_SOUNDS.storm)
      case 'storm':
        this.show(t(STORM_TEXT[e.kind]), 0.5)
        this.banner!.big = true
        this.shake.add(0.4)
        return playSound(HEALTH_SOUNDS.storm)
      case 'heroSkill':
        this.heroCast = 1
        if (e.x !== undefined && e.y !== undefined)
          this.particles.burst(e.x, e.y, {
            count: 12,
            color: HEROES[e.hero].color,
            speed: 200,
            shape: 'circle',
          })
        else if (e.hero === 'frost') this.show(t('FROZEN!'), 0.4)
        return this.play('hero', HERO_SOUNDS[HEROES[e.hero].voice])
    }
  }

  /**
   * A boss's death, playing out: `age` seconds in; explosions go off across
   * `box` until BOSS_DEATH_BOOM, then the finale. Null when none is playing.
   */
  bossDeath: {
    age: number
    x: number
    y: number
    coins: number
    box: { x: number; y: number; w: number; h: number }
    ghost: { boss: Boss; parts: Brick[] } | null
    booms: number
    finished: boolean
  } | null = null
  /** The finale's shockwave ring: seconds since it started (null: none). */
  shockwave: { x: number; y: number; age: number } | null = null

  /** True while a boss's death is still playing: the pick screen and aiming wait for it. */
  get bossDying(): boolean {
    return this.bossDeath !== null
  }

  /** Game speed while a boss dies: slow motion for the drama, normal otherwise. */
  get timeScale(): number {
    return this.bossDeath && !this.bossDeath.finished ? 0.35 : 1
  }

  /** Advances a boss death: an accelerating chain of explosions, then the finale. */
  private updateBossDeath(dt: number): void {
    const d = this.bossDeath
    if (d) {
      d.age += dt
      // Explosions come faster and faster: about 12 before the finale.
      const due = Math.floor(12 * (Math.min(d.age, BOSS_DEATH_BOOM) / BOSS_DEATH_BOOM) ** 0.7)
      while (d.booms < due) {
        d.booms++
        const x = d.box.x + Math.random() * d.box.w
        const y = d.box.y + Math.random() * d.box.h
        const k = d.booms / 12
        this.particles.burst(x, y, {
          count: 14 + Math.round(10 * k),
          color: ['#ff9f43', '#ffc83d', '#ffffff', '#ff6b6b'],
          speed: 180 + 160 * k,
          life: 0.5,
        })
        this.particles.burst(x, y, {
          count: 6,
          color: ['#5c5470', '#8a83a8'],
          speed: 60,
          life: 0.9,
          shape: 'circle',
        })
        this.shake.add(0.18 + 0.12 * k)
        if (!prefersReducedMotion()) this.flash = Math.max(this.flash, 0.12 + 0.2 * k)
        this.play('bossBoom', pitched(BRICK_SOUNDS.explode, 0.7 + 0.6 * k), 0.9)
      }
      if (!d.finished && d.age >= BOSS_DEATH_BOOM) {
        d.finished = true
        this.finishBoss(d)
      }
      if (d.age >= BOSS_DEATH_LIFE) this.bossDeath = null
    }
    if (this.shockwave && (this.shockwave.age += dt) > SHOCKWAVE_LIFE) this.shockwave = null
  }

  /** The finale: a white flash, a shockwave, the body shatters, then the rewards. */
  private finishBoss(d: NonNullable<Juice['bossDeath']>): void {
    this.flash = prefersReducedMotion() ? 0.5 : 1
    this.shockwave = { x: d.x, y: d.y, age: 0 }
    this.shake.add(1)
    this.hitstop = Math.max(this.hitstop, 0.15)
    const accent = d.ghost ? skillInfo(d.ghost.boss.traits[0] ?? 'armored').color : '#b48cff'
    for (const p of d.ghost?.parts ?? []) {
      // Each piece of the body flies apart as shards.
      const cx = (p.col + 0.5) * CELL
      const cy = TOP + (p.row + 0.5) * CELL
      this.particles.burst(cx, cy, {
        count: 18,
        color: [accent, '#ffffff', '#2b2540'],
        speed: 420,
        gravity: 700,
        life: 1,
      })
    }
    for (let i = 0; i < 3; i++) {
      this.particles.burst(d.x, d.y, {
        count: 30,
        color: ['#ff9f43', '#ffc83d', '#b48cff', '#ffffff'],
        speed: 300 + i * 160,
        life: 0.9,
      })
    }
    this.show(t('BOSS DOWN! +{coins}', { coins: d.coins }), 1)
    this.banner!.big = true
    this.particles.text(d.x, d.y + 40, t('+1 SKILL SLOT!'), { color: '#4be3a0', size: 22, rise: 60 })
    celebrate()
    this.flyCoins(d.x, d.y, 20)
    playSound(pitched(BRICK_SOUNDS.explode, 0.4))
    playSound(BRICK_SOUNDS.allClear)
    playSound(BRICK_SOUNDS.jackpot)
  }

  /**
   * The arena changing size: `age` seconds in. Growing: rumble (to ARENA_OPEN),
   * the new rows open (to ARENA_LAND), then a thud. Shrinking: a squeeze, then a thud.
   */
  arenaFx: {
    grow: boolean
    age: number
    landed: boolean
    /** Columns gained/lost per side, rows at the bottom. */
    cols: number
    rows: number
    /** A shrink waiting for the player to be back on the board. */
    held: boolean
  } | null = null

  /** Plays a held arena shrink: call once the player is back on the board (aiming, no panel). */
  releaseArena(): void {
    const a = this.arenaFx
    if (!a?.held) return
    a.held = false
    this.show(t('THE ARENA SHRINKS'), 0.2)
    this.shake.add(0.3)
    playSound(HEALTH_SOUNDS.storm, 0.6)
    playSound(pitched(BRICK_SOUNDS.explode, 0.5))
  }
  /** The floor's y (set by the renderer), for the arena's dust. */
  floorY = 760

  /** A boss arriving: seconds since it was announced, and whether it has landed (see boss-entrance.ts). */
  bossEnter: { age: number; landed: boolean; falling: boolean } | null = null
  /** The arriving boss's feet (set by the renderer), where its landing raises dust. */
  bossFeet: { x0: number; x1: number; y: number } | null = null

  /** True while the board is changing size (aiming waits: the canvas is moving under the pointer). */
  get arenaMoving(): boolean {
    const a = this.arenaFx
    return !!a && !a.held && arenaProgress(a, ARENA_OPEN, ARENA_LAND, ARENA_SQUEEZE) < 1
  }

  /** True while a boss is still making its entrance: its card waits until it has landed. */
  get bossArriving(): boolean {
    return !!this.bossEnter || !!this.arenaFx?.grow
  }

  private updateBossEntrance(dt: number): void {
    const b = this.bossEnter
    if (!b) return
    b.age += dt
    const drop = bossDrop(b.age, ARENA_LAND)
    // While the arena opens, the ground keeps trembling, harder as it goes.
    if (!drop.visible) this.shake.add(dt * (0.25 + 0.5 * Math.min(1, b.age / ARENA_LAND)))
    if (drop.visible && !b.falling) {
      b.falling = true
      playSound(BOSS_SOUNDS.fall)
    }
    if (drop.landed && !b.landed) {
      b.landed = true
      this.shake.add(1)
      this.flash = Math.max(this.flash, prefersReducedMotion() ? 0 : 0.7)
      this.hitstop = Math.max(this.hitstop, 0.12)
      const feet = this.bossFeet
      if (feet)
        for (let x = feet.x0; x <= feet.x1; x += 18)
          this.particles.burst(x, feet.y, {
            count: 4,
            color: ['#c9c3e6', '#8a83a8', '#ffc83d'],
            speed: 180,
            gravity: 500,
            life: 0.6,
          })
      playSound(HERO_SOUNDS.quake)
      playSound(HEALTH_SOUNDS.bossCrash, 0.7)
    }
    if (drop.done) this.bossEnter = null
  }

  private updateArena(dt: number): void {
    const a = this.arenaFx
    if (!a || a.held) return
    a.age += dt
    const land = a.grow ? ARENA_LAND : ARENA_SQUEEZE
    if (!a.landed && a.age >= land) {
      a.landed = true
      this.shake.add(a.grow ? 0.45 : 0.25)
      for (let i = 0; i < 9; i++) {
        const x = ((i + 0.5) / 9) * this.width
        this.particles.burst(x, this.floorY, {
          count: 5,
          color: ['#c9c3e6', '#8a83a8', '#ffc83d'],
          speed: 140,
          gravity: 400,
          life: 0.6,
        })
      }
      playSound(pitched(BRICK_SOUNDS.explode, a.grow ? 0.35 : 0.6))
    }
    if (a.age >= land + 0.6) this.arenaFx = null
  }

  /** Board width and the y of the health bar, so heal popups rise from it (set by the renderer). */
  width = 392
  healY = 700

  /** Plays a hero's signature sound (picked, or a run starting). */
  heroVoice(hero: HeroId): void {
    playSound(HERO_SOUNDS[HEROES[hero].voice])
  }

  /** The hero's real health each frame: a drop pops "−N" and leaves a ghost that drains; `snap` for a new run. */
  setHealth(hp: number | null, snap = false): void {
    if (hp === null || snap || this.hp === null) {
      this.hp = hp
      this.hpGhost = hp
      this.hpPop = null
      return
    }
    const change = Math.round(hp) - Math.round(this.hp)
    if (change !== 0 && Math.abs(change) >= 1) this.hpPop = { amount: change, age: 0 }
    if (hp > this.hp) this.hpGhost = Math.max(this.hpGhost ?? hp, hp)
    this.hp = hp
  }

  /**
   * The wallet the HUD counter shows. A gain eases up and pops "+N"; spending
   * drops it at once; `snap` jumps straight there (a new or resumed run).
   */
  setCoins(coins: number, snap = false): void {
    if (snap || coins < this.targetCoins) {
      this.shownCoins = coins
      if (snap) this.coinTally = null
    } else if (coins > this.targetCoins) {
      const gain = coins - this.targetCoins
      this.coinTally = { amount: (this.coinTally?.amount ?? 0) + gain, age: 0 }
    }
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

  /** The live combo's XP multiplier each frame (1 when there is none); a new tier slams in once. */
  setComboXp(mult: number): void {
    if (mult > 1 && mult > this.comboMult) {
      this.comboShown = mult
      this.comboTierAge = 0
    }
    if (mult > 1) {
      this.comboFade = 1
      this.comboHold = COMBO_HOLD
    }
    this.comboMult = mult
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

  /** The level-up (or free skill) celebration; nothing when neither happened (e.g. an orb collected). */
  startLevelUp(): void {
    if (!this.leveled && !this.freePick) return
    this.show(this.leveled || !this.freePick ? t('LEVEL UP!') : t('FREE SKILL!'), 0.6)
    this.banner!.big = true
    this.leveled = this.freePick = false
    this.xpFlash = 1
    this.xpSparks += 3
    if (!prefersReducedMotion()) this.shake.add(0.3)
    celebrate([theme.yolk, '#4be3a0', '#5ab8ff', '#b48cff'])
    playSound(BRICK_SOUNDS.fanfare)
  }

  private updateXp(dt: number): void {
    this.xpFlash = Math.max(0, this.xpFlash - dt * 2)
    this.xpGains = this.xpGains.filter((g) => this.clock - g.at < RUSH_WINDOW)
    const recent = this.xpGains.reduce((sum, g) => sum + g.amount, 0)
    // The bar's own multiplier: it jumps up with the combo, then (after the
    // label's hold) cools down gradually instead of snapping off at a new turn.
    if (this.comboMult >= this.barMult) this.barMult = this.comboMult
    else if (this.comboHold <= 0) this.barMult = Math.max(this.comboMult, this.barMult - dt * BAR_COOL)
    // A live combo keeps the bar on fire (white-hot at ×2), as a big rush of XP does.
    const comboHeat = this.barMult >= 2 ? 3 : this.barMult > 1.05 ? 2 : 0
    const heat = Math.max(comboHeat, HEAT_AT.filter((at) => recent >= at).length)
    if (heat === 3 && this.xpHeat < 3) playSound(BRICK_SOUNDS.whoosh)
    this.xpHeat = heat
    this.xpGlow = heat > 0 ? 1 : Math.max(0, this.xpGlow - dt * 0.9)
    if (this.xpTally) {
      this.xpTally.age += dt
      if (this.xpTally.age > TALLY_HOLD) this.xpTally = null
    }
    const gap = this.targetXp - this.shownXp
    if (gap > 0) {
      const before = this.shownXp
      this.shownXp = Math.min(this.targetXp, this.shownXp + Math.max(0.05, gap * 5) * dt)
      const crossed = Math.floor(this.shownXp) - Math.floor(before)
      if (crossed > 0) this.popLevel(crossed)
    }
    // Every gain ticks; a rush ticks louder and throws sparks off the bar.
    if (gap > 0 && this.clock - this.lastXpTick >= XP_TICK_GAP) {
      this.lastXpTick = this.clock
      if (this.xpGlow > 0) this.xpSparks++
      playSound(xpTick(this.shownXp % 1), this.xpGlow > 0 ? 1 : CALM_TICK_VOLUME)
    }
    if (this.comboTierAge !== null) this.comboTierAge += dt
    // When the combo ends the multiplier lingers a moment, then fades out gently.
    if (this.comboMult <= 1) {
      if (this.comboHold > 0) this.comboHold -= dt
      else this.comboFade = Math.max(0, this.comboFade - dt / COMBO_FADE)
    }
    if (this.levelPop) {
      this.levelPop.age += dt
      if (this.levelPop.age >= LEVEL_POP_LIFE) this.levelPop = null
    }
  }

  /** The bar just crossed `n` level lines: flash, pop the badge, a small shake and a chime (play never slows). */
  private popLevel(n: number): void {
    this.xpFlash = 1
    this.xpSparks += 3 + n
    this.levelPop = { age: 0, count: (this.levelPop?.count ?? 0) + n }
    if (!prefersReducedMotion()) this.shake.add(0.15)
    if (this.clock - this.lastChime >= CHIME_GAP) {
      this.lastChime = this.clock
      playSound(levelChime(Math.floor(this.shownXp)))
    }
  }

  private flyCoins(x: number, y: number, n: number): void {
    for (let i = 0; i < n && this.coinFlyers.length < 40; i++) {
      this.coinFlyers.push({ x0: x, y0: y, age: 0, delay: i * 0.05 })
    }
  }

  private beam(
    kind: Juice['beams'][number]['kind'],
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    life: number,
  ): void {
    this.beams.push({ kind, x1, y1, x2, y2, color, age: 0, life })
  }

  /** Ages boss attacks in flight; a rocket that arrives explodes on the hero. */
  private updateBeams(dt: number): void {
    for (const b of this.beams) {
      b.age += dt
      if (b.kind !== 'rocket' || b.age < b.life) continue
      this.particles.burst(b.x2, b.y2, {
        count: 28,
        color: ['#ff922b', '#ffc83d', '#ffffff'],
        speed: 300,
        life: 0.5,
      })
      this.shake.add(0.45)
      this.hurtFlash = Math.max(this.hurtFlash, prefersReducedMotion() ? 0.3 : 0.6)
      this.heroHurt = 1
      if (b.damage)
        this.particles.text(b.x2, b.y2 - 24, `−${b.damage}`, { color: theme.coral, size: 16, rise: 30 })
      playSound(pitched(BRICK_SOUNDS.explode, 0.8))
      this.play('heroHit', HEALTH_SOUNDS.hurt, 0.7)
    }
    this.beams = this.beams.filter((b) => b.age < b.life)
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
    // Before the beams age: a rocket landing this frame still counts as in flight.
    this.updateDefeat(dt)
    this.bossHit = Math.max(0, this.bossHit - dt * 6)
    this.bossCast = Math.max(0, this.bossCast - dt * 2)
    for (const p of this.pills) p.age += dt
    this.pills = this.pills.filter((p) => p.age < PILL_LIFE)
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
    this.updateBeams(dt)
    for (const r of this.rubble) r.in -= dt
    for (const r of this.rubble.filter((r) => r.in <= 0)) {
      this.particles.burst(r.x, r.y, {
        count: 12,
        color: ['#8a83a8', '#c9c3e6', '#ff9f43'],
        speed: 220,
        gravity: 500,
        life: 0.6,
      })
      this.play('rubble', pitched(BRICK_SOUNDS.kill, 0.7 + Math.random() * 0.3), 0.6)
    }
    this.rubble = this.rubble.filter((r) => r.in > 0)
    for (const o of this.xpOrbs) o.age += dt
    this.xpOrbs = this.xpOrbs.filter((o) => o.age < XP_ORB_FLY)
    if (this.coinTally) {
      this.coinTally.age += dt
      if (this.coinTally.age > TALLY_HOLD) this.coinTally = null
    }
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
    this.updateBossDeath(dt)
    this.bossSmug = Math.max(0, this.bossSmug - dt * 0.8)
    this.bossGloat = Math.max(0, this.bossGloat - dt * 0.6)
    this.updateArena(dt)
    this.updateBossEntrance(dt)
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2)
    this.healGlow = Math.max(0, this.healGlow - dt * 1.5)
    this.heroHurt = Math.max(0, this.heroHurt - dt * 2.5)
    this.heroCast = Math.max(0, this.heroCast - dt * 2)
    if (this.hpPop && (this.hpPop.age += dt) > 1.4) this.hpPop = null
    // The ghost waits a beat, then drains to the real health.
    if (this.hpGhost !== null && this.hp !== null && this.hpGhost > this.hp && (this.hpPop?.age ?? 1) > 0.35)
      this.hpGhost = Math.max(this.hp, this.hpGhost - Math.max(8, (this.hpGhost - this.hp) * 3) * dt)
    if (this.banner) {
      this.banner.age += dt
      if (this.banner.age > (this.banner.life ?? BANNER_LIFE)) this.banner = null
    }
  }

  private play(key: string, sound: Sound, volume = 1, gapMs = SOUND_GAP_MS): void {
    const now = performance.now()
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < gapMs) return
    this.lastPlayed.set(key, now)
    playSound(sound, volume)
  }

  /** A small word rising over (x, y), at most once per SPECIAL_LABEL_GAP for the same `key`. */
  private label(key: string, x: number, y: number, text: string, color: string): void {
    const now = performance.now()
    if (now - (this.lastLabel.get(key) ?? -Infinity) < SPECIAL_LABEL_GAP * 1000) return
    this.lastLabel.set(key, now)
    this.particles.text(x, y - 10, text, { color, size: 13, rise: 26 })
  }

  private show(text: string, flash: number): void {
    this.banner = { text, age: 0 }
    if (!prefersReducedMotion()) this.flash = Math.max(this.flash, flash)
  }
}
