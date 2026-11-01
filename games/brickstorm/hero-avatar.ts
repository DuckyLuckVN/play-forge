// The hero as a living character beside the ball: drawn in code from a small
// skeleton (hips, torso, two-part arms and legs, head) so every part can move.
// Poses blend smoothly toward a target set by the current mood, with springs
// for hops and knock-backs, so reactions read like a real person's: a wind-up
// before a throw, a follow-through after, a flinch, a sigh of relief.
import { prefersReducedMotion } from '@forge/fx/tween'
import { heroEmblem } from './hero-art'
import { HEROES, type HeroDef, type HeroHat, type HeroId } from './sim/heroes'
import type { SimEvent } from './sim/types'

export type Mood =
  | 'idle'
  | 'aim'
  | 'throw'
  | 'watch'
  | 'cheer'
  | 'pump'
  | 'wow'
  | 'scared'
  | 'worried'
  | 'hurt'
  | 'heal'
  | 'cast'
  | 'ko'
  | 'revive'
  /** A volley broke nothing: shoulders drop, a sigh. */
  | 'sad'

/** Little symbols that pop over the hero's head. */
type Emote = 'alert' | 'heart' | 'anger' | 'note' | 'sweat' | 'star' | 'question'

/** Things the hero reacts to each frame (not events). */
export interface AvatarContext {
  /** Where the hero should stand (the ball), and the board's width. */
  homeX: number
  boardW: number
  floorY: number
  /** Aim angle while aiming (null otherwise). */
  aim: number | null
  /** The ball to watch (lead ball in flight), if any. */
  watch: { x: number; y: number } | null
  /** Balls still waiting to be thrown this volley. */
  throwing: boolean
  /** Bricks one row above the line, or health low. */
  danger: boolean
  lowHealth: boolean
  /** Live combo strength (comboPower): the aura and eagerness grow with it. */
  combo: number
  /** The ball waiting in the hero's hand (launch point and radius), or null while it's thrown. */
  hold?: { x: number; y: number; r: number } | null
}

/** Hair colour by hero (default dark brown). */
const HAIR: Partial<Record<HeroId, string>> = {
  rookie: '#6b4226',
  flash: '#ffb703',
  ranger: '#8a5a2b',
  baron: '#d9a441',
  sage: '#e9ecef',
  pyro: '#ff6b2b',
  juggler: '#f783ac',
  tempest: '#a5d8ff',
  monk: '#2b2b2b',
  cleric: '#f6d365',
  vampire: '#1b1b2f',
  paladin: '#f4c95d',
  necro: '#3d4a2a',
  frost: '#e7f5ff',
  sorcerer: '#5f3dc4',
  dragon: '#2b1a12',
  pirate: '#1f1f1f',
}

/** Body width (1 = average). */
const BULK: Partial<Record<HeroId, number>> = {
  knight: 1.15,
  berserker: 1.2,
  giant: 1.35,
  titan: 1.45,
  flash: 0.85,
  ninja: 0.9,
  sorcerer: 0.9,
  paladin: 1.1,
}

/** Extras that make a hero recognisable. */
const CAPE = new Set<HeroId>([
  'knight',
  'paladin',
  'vampire',
  'dragon',
  'sorcerer',
  'tempest',
  'frost',
  'necro',
])
const SCARF = new Set<HeroId>(['flash', 'ninja', 'ranger'])
const BEARD = new Set<HeroId>(['sage', 'titan', 'pirate', 'giant'])
const PATCH = new Set<HeroId>(['pirate'])
/** Eye colour by hero (default warm brown). */
const EYES: Partial<Record<HeroId, string>> = {
  frost: '#4dabf7',
  sorcerer: '#cc5de8',
  vampire: '#e03131',
  tempest: '#339af0',
  necro: '#82c91e',
  ranger: '#40c057',
  dragon: '#f08c00',
  cleric: '#748ffc',
  paladin: '#fab005',
  flash: '#1c7ed6',
}
const LONG_HAIR = new Set<HeroId>(['frost', 'cleric', 'paladin', 'juggler', 'ranger', 'sorcerer', 'vampire'])

const OUT = '#1b1d2b'

/** Mixes a hex colour toward black (amt < 0) or white (amt > 0). */
function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const f = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)
  const r = f((n >> 16) & 255)
  const g = f((n >> 8) & 255)
  const b = f(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** A damped spring toward 0, for hops, knock-backs and squash. */
class Spring {
  v = 0
  x = 0
  constructor(
    private k = 120,
    private damp = 12,
  ) {}
  kick(v: number): void {
    this.v += v
  }
  update(dt: number): void {
    this.v += (-this.k * this.x - this.damp * this.v) * dt
    this.x += this.v * dt
  }
}

/** Everything that blends between poses (angles in radians, 0 = arm hanging down, + = forward). */
interface Pose {
  crouch: number
  lean: number
  sF: number
  eF: number
  sB: number
  eB: number
  tilt: number
  /** Whole body tipped back (KO). */
  fall: number
  eyeOpen: number
  /** Brow angle: + angry/focused (inner ends down), − worried (inner ends up). */
  brow: number
  browUp: number
  /** 0..1 how wide the mouth is open. */
  mouthOpen: number
  /** −1 frown … +1 big smile. */
  smile: number
  blush: number
}

const BASE: Pose = {
  crouch: 0,
  lean: 0,
  sF: 0.15,
  eF: 0.35,
  sB: -0.15,
  eB: 0.35,
  tilt: 0,
  fall: 0,
  eyeOpen: 1,
  brow: 0,
  browUp: 0,
  mouthOpen: 0,
  smile: 0.35,
  blush: 0.15,
}

type EyeStyle = 'normal' | 'happy' | 'squeeze' | 'wide' | 'xx'

/** How long each passing mood lasts (seconds) before going back to the base mood. */
const MOOD_LIFE: Partial<Record<Mood, number>> = {
  throw: 0.45,
  cheer: 1.4,
  pump: 0.7,
  wow: 1,
  scared: 1.6,
  hurt: 1.2,
  heal: 1.1,
  cast: 0.9,
  revive: 0.9,
  sad: 1.4,
}

/** How strongly each mood wins over the one playing (a small cheer won't cut off a flinch). */
const PRIORITY: Record<Mood, number> = {
  idle: 0,
  watch: 0,
  aim: 0,
  worried: 1,
  throw: 2,
  pump: 2,
  heal: 3,
  wow: 3,
  cast: 3,
  cheer: 4,
  scared: 4,
  hurt: 5,
  revive: 6,
  sad: 2,
  ko: 7,
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** How far behind the ball the hero stands (board units at size 1): its hand reaches it. */
const HOLD_REACH = 12
/** Moods in which the front hand stays on the held ball. */
const HOLDS = new Set<Mood>(['idle', 'aim', 'worried', 'watch'])

export class HeroAvatar {
  hero: HeroDef
  /** Standing position (board x) and the way it faces (1 right, −1 left). */
  x = 0
  facing: 1 | -1 = 1
  private placed = false
  mood: Mood = 'idle'
  private moodAge = 0
  private time = 0
  private pose: Pose = { ...BASE }
  private eyes: EyeStyle = 'normal'
  private blinkIn = 2
  private blink = 0
  /** Where the eyes look, in local units relative to the head. */
  private lookX = 1
  private lookY = 0
  private hop = new Spring(260, 14)
  private knock = new Spring(140, 11)
  private squash = new Spring(300, 16)
  private cape = new Spring(40, 4)
  /** Run cycle phase, advanced while moving. */
  private stride = 0
  private moving = 0
  private emote: { kind: Emote; age: number } | null = null
  /** Seconds since anything happened, for idle fidgets. */
  private quiet = 0
  private fidget: 'stretch' | 'look' | 'tap' | 'wave' | 'yawn' | null = null
  private glow = 0
  private aim: number | null = null
  /** Bricks broken this volley, and whether a volley is on (for the "failed" sigh). */
  private volleyKills = 0
  private volleyOn = false
  /** Seconds since the last hit, for the red shock ring (null: none). */
  private hitRing: number | null = null
  /** The live combo's strength, for the golden aura. */
  private combo = 0
  /** Drawing size, × board units (set by the game). */
  size = 1
  private hold: { x: number; y: number; r: number } | null = null
  private hair = new Spring(90, 6)
  private head = new Spring(220, 13)
  private glanceIn = 2
  private glance: { x: number; y: number; age: number } | null = null
  private dust: Array<{ x: number; age: number; size: number }> = []
  /** 0..1 motion streak after a throw. */
  private smear = 0
  private pendingHop: { in: number; v: number } | null = null
  private airborne = false
  /** Draws the held ball (the run's ball skin); the game sets it. */
  drawBall: (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => void = (ctx, x, y, r) => {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  private emblem: HTMLImageElement | null = null

  constructor(hero: HeroId) {
    this.hero = HEROES[hero]
    this.loadEmblem()
  }

  setHero(id: HeroId): void {
    if (this.hero.id === id) return
    this.hero = HEROES[id]
    this.loadEmblem()
    this.setMood('cheer')
  }

  /** Back to standing calm (a new or resumed run). */
  reset(): void {
    this.mood = 'idle'
    this.moodAge = 0
    this.placed = false
    this.emote = null
    this.knock.x = this.knock.v = this.hop.x = this.hop.v = 0
  }

  private loadEmblem(): void {
    if (typeof Image === 'undefined') return
    const img = new Image()
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(heroEmblem(this.hero.emblem, this.hero.color, 24))}`
    this.emblem = img
  }

  /** Switches mood if it matters more than the one playing (or that one is over). */
  setMood(mood: Mood, emote?: Emote): void {
    const life = MOOD_LIFE[this.mood]
    const over = life !== undefined && this.moodAge >= life
    if (this.mood === 'ko' && mood !== 'revive') return
    if (!over && PRIORITY[mood] < PRIORITY[this.mood] && MOOD_LIFE[this.mood] !== undefined) return
    if (mood !== this.mood || MOOD_LIFE[mood] !== undefined) this.moodAge = 0
    this.mood = mood
    this.quiet = 0
    this.fidget = null
    if (emote) this.emote = { kind: emote, age: 0 }
    const still = prefersReducedMotion()
    if (still) return
    // The body's first beat of each reaction.
    switch (mood) {
      case 'cheer':
        // Crouch first, then spring up: anticipation sells the jump.
        this.pendingHop = { in: 0.09, v: -160 }
        this.squash.kick(-2.5)
        break
      case 'pump':
        this.hop.kick(-70)
        break
      case 'hurt':
        this.knock.kick(-90)
        this.squash.kick(-4)
        break
      case 'wow':
      case 'scared':
        this.hop.kick(-60)
        break
      case 'throw':
        this.squash.kick(2.5)
        this.smear = 1
        break
      case 'revive':
        this.hop.kick(-170)
        break
    }
  }

  /** Reacts to what just happened in the run. */
  handle(e: SimEvent): void {
    switch (e.type) {
      case 'breach':
      case 'heroHit':
        this.hitRing = 0
        return this.setMood('hurt', 'anger')
      case 'bossAttack':
        return this.setMood('scared', 'alert')
      case 'heal':
        if (e.source !== 'regen') this.setMood('heal', 'heart')
        return
      case 'levelUp':
      case 'allClear':
      case 'jackpot':
      case 'milestone':
        return this.setMood('cheer', 'note')
      case 'bossDown':
        return this.setMood('cheer', 'star')
      case 'boss':
        return this.setMood('scared', 'alert')
      case 'storm':
      case 'stormSoon':
      case 'bossWarn':
        return this.setMood('wow', 'alert')
      case 'fever':
        return this.setMood('wow', 'star')
      case 'heroSkill':
        this.glow = 1
        return this.setMood('cast')
      case 'mystery':
        return this.setMood('wow', 'question')
      case 'kill':
        this.volleyKills++
        if (e.kind === 'gold') this.setMood('pump')
        return
      case 'secondWind':
        return this.setMood('wow', 'alert')
      case 'over':
        return this.setMood('ko')
      case 'revive':
        return this.setMood('revive', 'star')
      case 'fire':
        this.volleyKills = 0
        this.volleyOn = true
        return this.setMood('throw')
      case 'turn':
        // The volley ended: nothing broken is a little failure.
        if (this.volleyOn && this.volleyKills === 0) this.setMood('sad', 'sweat')
        this.volleyOn = false
        return
      case 'hit':
        // Big combos earn a fist pump at each announcer step.
        // Each announcer step (NICE, GREAT…) earns a fist pump.
        if ([25, 50, 100, 200].some((at) => e.power >= at && e.power - at < 1)) this.setMood('pump', 'note')
        return
    }
  }

  update(dt: number, c: AvatarContext): void {
    this.time += dt
    this.moodAge += dt
    this.quiet += dt
    this.aim = c.aim
    this.glow = Math.max(0, this.glow - dt * 1.2)
    // The aura swells quickly with the combo and fades out gently after it, never snapping off.
    this.combo =
      c.combo > this.combo
        ? this.combo + (c.combo - this.combo) * (1 - Math.exp(-8 * dt))
        : Math.max(c.combo, this.combo - Math.max(20, this.combo * 1.2) * dt)
    if (this.hitRing !== null && (this.hitRing += dt) > 0.6) this.hitRing = null
    if (this.emote && (this.emote.age += dt) > 1.3) this.emote = null
    this.hop.update(dt)
    this.knock.update(dt)
    this.squash.update(dt)
    this.cape.update(dt)

    // Passing moods end; the base mood follows what's going on.
    const life = MOOD_LIFE[this.mood]
    if (this.mood === 'ko') {
      /* stays down until a revive */
    } else if (life === undefined || this.moodAge >= life) {
      const base: Mood =
        c.aim !== null
          ? 'aim'
          : c.watch || c.throwing
            ? 'watch'
            : c.danger || c.lowHealth
              ? 'worried'
              : 'idle'
      if (base !== this.mood) {
        if (base === 'worried' && this.mood !== 'worried') this.emote = { kind: 'sweat', age: 0 }
        this.mood = base
        this.moodAge = 0
      }
    }

    // Face where the action is: along the aim (with a dead zone, so aiming near
    // straight up doesn't flip the hero back and forth), else the board's middle.
    if (this.mood !== 'ko') {
      const toward =
        c.aim !== null
          ? Math.cos(c.aim)
          : c.watch
            ? (c.watch.x - this.x) / 200
            : (c.boardW / 2 - c.homeX) / 200
      if (Math.abs(toward) > 0.25) this.facing = toward > 0 ? 1 : -1
    }
    // Stand just behind the ball so the front hand holds it; by a wall, stand on the open side.
    const reach = HOLD_REACH * this.size
    if (c.homeX - this.facing * reach < 10) this.facing = -1
    if (c.homeX - this.facing * reach > c.boardW - 10) this.facing = 1
    const target = c.homeX - this.facing * reach
    this.hold = c.hold ?? null
    if (!this.placed) {
      this.x = target
      this.placed = true
    }
    const gap = target - this.x
    const speed = Math.min(Math.abs(gap) * 7, 280)
    const step = Math.sign(gap) * Math.min(Math.abs(gap), speed * dt)
    this.x += step
    const wasMoving = this.moving > 0
    this.moving = Math.abs(gap) > 2 && this.mood !== 'ko' ? Math.min(1, speed / 160) : 0
    if (this.moving) {
      this.stride += dt * (8 + 10 * this.moving)
      this.cape.kick(-gap * dt * 2)
      this.hair.kick(-gap * dt * 1.5)
      // A puff of dust at each footfall.
      if (
        Math.floor(this.stride / Math.PI) !==
        Math.floor((this.stride - dt * (8 + 10 * this.moving)) / Math.PI)
      )
        this.puff(this.x - this.facing * 4, 0.6)
    }
    if (wasMoving !== this.moving > 0) this.puff(this.x, 1)

    // Little glances while calm: the eyes dart somewhere and come back.
    this.glanceIn -= dt
    if (this.glanceIn <= 0) {
      this.glanceIn = 1.2 + Math.random() * 2.5
      this.glance = { x: Math.random() * 2 - 1, y: Math.random() * 1.2 - 0.8, age: 0 }
    }
    if (this.glance && (this.glance.age += dt) > 0.5) this.glance = null
    this.hair.update(dt)
    this.head.update(dt)
    this.head.kick(-this.hop.v * dt * 0.6)
    for (const d of this.dust) d.age += dt
    this.dust = this.dust.filter((d) => d.age < 0.5)
    if (this.smear > 0) this.smear = Math.max(0, this.smear - dt * 5)
    // A jump waits a beat after the crouch that winds it up.
    if (this.pendingHop && (this.pendingHop.in -= dt) <= 0) {
      this.hop.kick(this.pendingHop.v)
      this.squash.kick(3)
      this.pendingHop = null
    }
    // Landing from a hop: a squash and a puff.
    if (this.hop.x < -4 && this.hop.v > 0) this.airborne = true
    if (this.airborne && this.hop.x >= -1) {
      this.airborne = false
      this.squash.kick(-3)
      this.puff(this.x, 0.8)
    }

    // Blinks every few seconds (double sometimes), not while eyes are styled.
    this.blinkIn -= dt
    if (this.blinkIn <= 0) {
      this.blink = 0.14
      this.blinkIn = 1.8 + Math.random() * 3.2
      if (Math.random() < 0.2) this.blinkIn = 0.25
    }
    this.blink = Math.max(0, this.blink - dt)

    // Idle long enough: a small fidget.
    if (this.mood === 'idle' && this.quiet > 5 && !this.fidget) {
      this.fidget = (['stretch', 'look', 'tap', 'wave', 'yawn'] as const)[Math.floor(Math.random() * 5)]
      this.quiet = 0
    }
    if (this.fidget && this.quiet > 2.2) {
      this.fidget = null
      this.quiet = 0
    }

    this.lookAt(c)
    const target2 = this.targetPose(c)
    // Faster blending for sharp reactions, softer for settling.
    const rate = this.mood === 'hurt' || this.mood === 'throw' || this.mood === 'wow' ? 22 : 9
    const k = 1 - Math.exp(-rate * dt)
    for (const key of Object.keys(this.pose) as (keyof Pose)[])
      this.pose[key] = lerp(this.pose[key], target2[key], k)
  }

  private puff(x: number, size: number): void {
    if (prefersReducedMotion() || this.dust.length > 10) return
    this.dust.push({ x, age: 0, size })
  }

  /** Where the eyes point: along the aim, at the watched ball, or around. */
  private lookAt(c: AvatarContext): void {
    let lx = 1
    let ly = 0
    if (c.aim !== null) {
      lx = Math.cos(c.aim) * this.facing
      ly = -Math.sin(c.aim)
    } else if (c.watch) {
      const dx = (c.watch.x - this.x) * this.facing
      const dy = c.watch.y - (c.floorY - 40)
      const d = Math.hypot(dx, dy) || 1
      lx = dx / d
      ly = dy / d
    } else if (this.mood === 'worried' || this.mood === 'scared') {
      lx = 0.4
      ly = -0.9
    } else if (this.fidget === 'look') {
      lx = Math.sin(this.time * 1.7)
      ly = -0.2
    }
    if (this.glance && c.aim === null && !c.watch) {
      lx = this.glance.x
      ly = this.glance.y
    }
    this.lookX = lerp(this.lookX, lx, 0.25)
    this.lookY = lerp(this.lookY, ly, 0.25)
  }

  private targetPose(c: AvatarContext): Pose {
    const p: Pose = { ...BASE }
    const t = this.time
    const a = this.moodAge
    this.eyes = 'normal'
    // Breathing in every pose.
    p.crouch = 0.04 * Math.sin(t * 2.2)
    p.sF += 0.05 * Math.sin(t * 2.2)
    p.sB -= 0.05 * Math.sin(t * 2.2)
    /** Shoulder angle that points the arm along the aim. */
    const aimArm = () => {
      if (this.aim === null) return 1.6
      const dx = Math.cos(this.aim) * this.facing
      const dy = -Math.sin(this.aim)
      return Math.atan2(dx, dy)
    }
    switch (this.mood) {
      case 'idle':
        if (this.fidget === 'stretch') {
          p.sF = p.sB = 2.9
          p.sB = -2.9
          p.eF = p.eB = 0.2
          p.eyeOpen = 0.3
          p.mouthOpen = 0.6
          p.smile = 0
        } else if (this.fidget === 'wave') {
          // A friendly wave at the player.
          p.sB = -2.6
          p.eB = 0.6 + 0.5 * Math.sin(t * 12)
          p.smile = 0.9
          p.mouthOpen = 0.3
          p.blush = 0.5
          p.tilt = 0.08
        } else if (this.fidget === 'yawn') {
          p.sB = -2.8
          p.eB = 2.2
          p.eyeOpen = 0.1
          p.mouthOpen = 0.9
          p.smile = -0.1
          p.tilt = -0.1
          p.lean = -0.08
        } else if (this.fidget === 'tap') {
          p.crouch = 0.08 * Math.max(0, Math.sin(t * 9))
          p.tilt = 0.08 * Math.sin(t * 4.5)
        }
        break
      case 'aim':
        // Ball cocked back behind the head, the other hand pointing the way.
        p.crouch = 0.35
        p.lean = -0.08
        p.sF = -2.3
        p.eF = 1.7
        p.sB = aimArm()
        p.eB = 0.15
        p.brow = 0.5
        p.smile = 0.1
        p.tilt = -0.05
        break
      case 'throw': {
        // Wind-up → snap through the aim → follow-through, all in ~0.3 s.
        const k = Math.min(1, a / 0.22)
        const through = aimArm()
        p.sF = lerp(-2.6, through + 0.5, k)
        p.eF = lerp(1.8, 0.1, k)
        p.sB = lerp(through, -0.9, k)
        p.eB = 0.6
        p.lean = lerp(-0.12, 0.28, k)
        p.crouch = lerp(0.4, 0.1, k)
        p.brow = 0.7
        p.mouthOpen = 0.55
        p.smile = 0.2
        break
      }
      case 'watch': {
        // Hands loosely together, eyes on the ball; leans in with the combo.
        const eager = Math.min(1, c.combo / 60)
        p.sF = 0.5 + 0.2 * eager
        p.eF = 1.7
        p.sB = -0.3 + 0.8 * eager
        p.eB = 1.9
        p.lean = 0.08 + 0.08 * eager
        p.smile = 0.3 + 0.5 * eager
        p.mouthOpen = 0.25 * eager
        p.browUp = 0.4 * eager
        p.crouch = 0.1 + 0.1 * eager * Math.max(0, Math.sin(t * 10))
        break
      }
      case 'cheer':
        p.sF = 2.6 + 0.25 * Math.sin(t * 16)
        p.sB = -2.6 - 0.25 * Math.sin(t * 16 + 1)
        p.eF = p.eB = 0.35
        p.smile = 1
        p.mouthOpen = 0.8
        p.blush = 0.7
        p.browUp = 1
        this.eyes = 'happy'
        break
      case 'pump': {
        // A quick fist pump: down, up, hold.
        const k = Math.min(1, a / 0.15)
        p.sF = lerp(0.6, 2.2, k)
        p.eF = lerp(0.5, 2.4, k)
        p.crouch = 0.25 * (1 - k)
        p.smile = 0.9
        p.mouthOpen = 0.5
        p.browUp = 0.6
        p.blush = 0.4
        break
      }
      case 'wow':
        p.sF = 1.4
        p.eF = 0.6
        p.sB = -1.4
        p.eB = 0.6
        p.lean = -0.12
        p.mouthOpen = 1
        p.smile = 0
        p.browUp = 1.2
        this.eyes = 'wide'
        break
      case 'scared':
        p.sF = 1
        p.eF = 2.5
        p.sB = -0.8
        p.eB = 2.5
        p.crouch = 0.45
        p.lean = -0.18
        p.brow = -0.9
        p.browUp = 0.6
        p.mouthOpen = 0.45
        p.smile = -0.6
        p.blush = 0
        this.eyes = 'wide'
        break
      case 'worried':
        // Hands wringing, glancing up at the bricks, a nervous little shake.
        p.sF = 0.8 + 0.1 * Math.sin(t * 7)
        p.eF = 2.3
        p.sB = -0.6 + 0.1 * Math.sin(t * 7 + 1)
        p.eB = 2.3
        p.crouch = 0.2
        p.brow = -0.8
        p.browUp = 0.3
        p.smile = -0.4
        p.mouthOpen = 0.15
        p.blush = 0
        break
      case 'hurt':
        if (a < 0.35) {
          // The flinch: eyes squeezed shut, teeth gritted, arms up.
          p.sF = 1.6
          p.eF = 1.2
          p.sB = -1.5
          p.eB = 1.2
          p.lean = -0.35
          p.crouch = 0.4
          p.brow = 1
          p.mouthOpen = 0.35
          p.smile = -1
          this.eyes = 'squeeze'
        } else {
          // Then rubbing the sore head, wincing.
          p.sF = 2.75
          p.eF = 2.3 + 0.2 * Math.sin(t * 18)
          p.sB = -0.2
          p.tilt = 0.18
          p.brow = -0.6
          p.eyeOpen = 0.45
          p.smile = -0.5
          p.mouthOpen = 0.15
        }
        p.blush = 0
        break
      case 'heal':
        p.sF = 0.7
        p.eF = 2.4
        p.sB = 0.5
        p.eB = 2.4
        p.tilt = -0.1
        p.smile = 0.8
        p.blush = 0.6
        this.eyes = 'happy'
        break
      case 'cast':
        p.sF = 1.65
        p.eF = 0.1
        p.sB = 1.35
        p.eB = 0.3
        p.lean = 0.12
        p.crouch = 0.3
        p.brow = 0.8
        p.mouthOpen = 0.4
        p.smile = 0.3
        break
      case 'ko':
        p.fall = Math.min(1, a / 0.45)
        p.sF = 1.9
        p.sB = -2.2
        p.eF = p.eB = 0.2
        p.mouthOpen = 0.3
        p.smile = -0.3
        this.eyes = 'xx'
        break
      case 'sad':
        // Shoulders drop, head hangs, a sigh.
        p.sF = 0.05
        p.eF = 0.15
        p.sB = -0.05
        p.eB = 0.15
        p.crouch = 0.15
        p.tilt = 0.28
        p.lean = 0.06
        p.brow = -0.8
        p.eyeOpen = 0.45
        p.smile = -0.6
        p.mouthOpen = a < 0.5 ? 0.35 : 0
        p.blush = 0
        break
      case 'revive':
        p.sF = 2.7
        p.sB = -2.7
        p.smile = 1
        p.mouthOpen = 0.6
        p.browUp = 0.8
        this.eyes = 'happy'
        break
    }
    // Running overrides arms and adds a forward lean.
    if (this.moving && this.mood !== 'ko') {
      const s = Math.sin(this.stride)
      p.sF = 0.9 * s
      p.sB = -0.9 * s
      p.eF = p.eB = 1.3
      p.lean = 0.2 * this.moving
    }
    if (this.blink > 0 && this.eyes === 'normal') p.eyeOpen = 0.05
    // The head turns with the eyes: up along a high aim, after the ball in flight.
    if (this.mood !== 'ko' && (c.aim !== null || c.watch))
      p.tilt += Math.max(-0.45, Math.min(0.25, this.lookY * 0.45))
    return p
  }

  /** Draws the hero standing on `floorY` at its x (or at `at`, for previews), `scale`× board size. */
  draw(ctx: CanvasRenderingContext2D, floorY: number, scale = this.size, at?: number): void {
    const p = this.pose
    const id = this.hero.id
    const still = prefersReducedMotion()
    const color = this.hero.color
    const skin = this.hero.skin
    const hair = HAIR[id] ?? '#4a3426'
    const bulk = BULK[id] ?? 1
    const x = (at ?? this.x) + (still ? 0 : this.knock.x * this.facing)
    const tremble =
      !still && (this.mood === 'worried' || this.mood === 'scared') ? Math.sin(this.time * 40) * 0.6 : 0
    const hopY = still ? 0 : this.hop.x

    // Dust puffs on the floor.
    for (const d of this.dust) {
      const k = d.age / 0.5
      ctx.fillStyle = `rgb(220 215 240 / ${0.35 * (1 - k)})`
      for (const side of [-1, 1]) {
        ctx.beginPath()
        ctx.arc(
          d.x + side * (3 + 10 * k) * scale,
          floorY - 2 * scale - 3 * k * scale,
          (2 + 3 * k) * d.size * scale,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
    }

    this.drawAura(ctx, x, floorY + hopY * scale, scale)

    // Soft shadow (shrinks as the hero leaves the ground).
    const air = Math.max(0, -hopY)
    const shadow = ctx.createRadialGradient(x, floorY, 1, x, floorY, 13 * bulk * scale)
    shadow.addColorStop(0, `rgb(0 0 0 / ${0.4 - Math.min(0.2, air / 120)})`)
    shadow.addColorStop(1, 'rgb(0 0 0 / 0)')
    ctx.fillStyle = shadow
    ctx.beginPath()
    ctx.ellipse(x, floorY + 1, (13 - Math.min(5, air / 6)) * bulk * scale, 3.5 * scale, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.save()
    ctx.translate(x + tremble * scale, floorY + hopY * scale)
    ctx.scale(this.facing * scale, scale)
    if (p.fall > 0) {
      ctx.translate(-8, 0)
      ctx.rotate(-p.fall * 1.45)
      ctx.translate(8, 0)
    }
    const sq = still ? 0 : this.squash.x * 0.03
    ctx.scale(1 - sq, 1 + sq)
    // Rim light: the hero's skill glows in its colour; a combo makes the whole figure shine.
    const auraK = this.auraK()
    if (this.glow > 0 || auraK > 0.3) {
      const fromCombo = auraK > 0.3 && auraK * 18 > this.glow * 22
      ctx.shadowColor = fromCombo ? (this.combo >= 100 ? '#fff3bf' : '#ffc83d') : color
      ctx.shadowBlur = fromCombo ? 6 + 14 * auraK : 22 * this.glow
    }

    // ----- Skeleton (local units: feet at 0, up is −y) -----
    const legLen = 12
    const hipY = -legLen + p.crouch * 5
    const torsoH = 14
    const top = hipY - torsoH
    const shW = 7.5 * bulk
    const stride = this.moving ? Math.sin(this.stride) : 0
    const tap = this.mood === 'idle' && this.fidget === 'tap' ? Math.max(0, Math.sin(this.time * 9)) : 0
    const breath = still ? 0 : Math.sin(this.time * 2.2) * 0.35
    const pants = shade(color, -0.55)
    const glove = id === 'knight' || id === 'titan' || id === 'paladin' ? '#ced4da' : shade(color, -0.25)
    const boot = id === 'pirate' || id === 'ranger' ? '#6b4226' : '#3b2f2f'

    /** A limb: a dark outline stroke under a coloured one, so it reads like an inked drawing. */
    const limb = (pts: Array<[number, number]>, width: number, fill: string) => {
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(...pts[0])
      for (const q of pts.slice(1)) ctx.lineTo(...q)
      ctx.strokeStyle = OUT
      ctx.lineWidth = width + 2.2
      ctx.stroke()
      ctx.strokeStyle = fill
      ctx.lineWidth = width
      ctx.stroke()
    }

    const leg = (side: number, swing: number, lift: number, back: boolean) => {
      const hx = side * 3 * bulk
      const fx = hx + swing * 7
      const fy = -lift
      const kx = (hx + fx) / 2 + 1.5 + p.crouch * 3.5
      const ky = (hipY + fy) / 2 - 0.5
      limb(
        [
          [hx, hipY],
          [kx, ky],
          [fx, fy - 3],
        ],
        4.8 * Math.min(1.25, bulk),
        back ? shade(pants, -0.2) : pants,
      )
      // Boot: a shaped toe, a sole and a shine.
      ctx.fillStyle = back ? shade(boot, -0.2) : boot
      ctx.strokeStyle = OUT
      ctx.lineWidth = 1.1
      ctx.beginPath()
      ctx.moveTo(fx - 3, fy - 4.5)
      ctx.lineTo(fx + 1.5, fy - 4.5)
      ctx.quadraticCurveTo(fx + 6, fy - 3.5, fx + 6, fy - 0.8)
      ctx.lineTo(fx - 3, fy - 0.8)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#1b1d2b'
      ctx.fillRect(fx - 3, fy - 1.4, 9, 1.4)
      ctx.fillStyle = 'rgb(255 255 255 / 0.3)'
      ctx.fillRect(fx + 0.5, fy - 3.8, 2.5, 0.9)
    }

    ctx.save()
    ctx.translate(0, hipY)
    ctx.rotate(p.lean)
    ctx.translate(0, -hipY)

    const shoulder = (side: number) => ({ x: side * shW * 0.72, y: top + 2.6 })
    const UPPER = 6.8
    const FORE = 6.8
    /** Front-arm angles that put the hand on the held ball (two-bone IK), in this lean-rotated frame. */
    const reachBall = (): { s: number; e: number } | null => {
      if (!this.hold || !HOLDS.has(this.mood) || this.moving || p.fall > 0) return null
      // Board point → local units → undo the lean around the hips.
      let lx = ((this.hold.x - x) * this.facing) / scale
      let ly = (this.hold.y - (floorY + hopY * scale)) / scale
      const c = Math.cos(-p.lean)
      const sn = Math.sin(-p.lean)
      const ry = ly - hipY
      ;[lx, ly] = [lx * c - ry * sn, lx * sn + ry * c + hipY]
      const o = shoulder(1)
      const dx = lx - o.x
      const dy = ly - o.y
      const d = Math.min(UPPER + FORE - 0.2, Math.max(1, Math.hypot(dx, dy)))
      const to = Math.atan2(dx, dy)
      const bend = Math.acos(Math.min(1, d / (UPPER + FORE)))
      return { s: to + bend, e: -2 * bend }
    }

    const arm = (side: number, s: number, e: number, back: boolean) => {
      const o = shoulder(side)
      const ex = o.x + Math.sin(s) * UPPER
      const ey = o.y + Math.cos(s) * UPPER
      const hx = ex + Math.sin(s + e) * FORE
      const hy = ey + Math.cos(s + e) * FORE
      const sleeve = back ? shade(color, -0.3) : color
      limb(
        [
          [o.x, o.y],
          [ex, ey],
          [hx, hy],
        ],
        4.4 * Math.min(1.3, bulk),
        sleeve,
      )
      // Cuff, then a gloved hand.
      ctx.strokeStyle = shade(sleeve, 0.35)
      ctx.lineWidth = 1.6
      ctx.beginPath()
      const cx = ex + Math.sin(s + e) * (FORE - 2.2)
      const cy = ey + Math.cos(s + e) * (FORE - 2.2)
      ctx.arc(cx, cy, 1.6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = back ? shade(glove, -0.2) : glove
      ctx.strokeStyle = OUT
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(hx, hy, 2.7, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      return { x: hx, y: hy }
    }

    // Back limbs, cape, body, front limbs, head: painter's order.
    leg(-1, -stride, Math.max(0, -stride) * 3, true)
    arm(-1, p.sB, p.eB, true)
    if (CAPE.has(id)) {
      const sway = this.cape.x + (this.moving ? 0.3 : 0) + 0.05 * Math.sin(this.time * 2)
      const g = ctx.createLinearGradient(0, top, 0, 0)
      g.addColorStop(0, shade(color, -0.35))
      g.addColorStop(1, shade(color, -0.6))
      ctx.fillStyle = g
      ctx.strokeStyle = OUT
      ctx.lineWidth = 1.1
      ctx.beginPath()
      ctx.moveTo(-shW * 0.7, top + 1)
      ctx.quadraticCurveTo(-shW - 5 - sway * 10, hipY - 2, -shW - 3 - sway * 15, -1)
      // A scalloped hem.
      ctx.quadraticCurveTo(-shW - sway * 12, 1, -shW * 0.4 - sway * 10, -1)
      ctx.quadraticCurveTo(-shW * 0.1 - sway * 9, 1, shW * 0.25 - sway * 8, -1)
      ctx.quadraticCurveTo(0, hipY, shW * 0.6, top + 1)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
    leg(1, stride, Math.max(0, stride) * 3 + tap * 2, false)

    // Torso: shaded, with a lit front and a shadowed back, a collar, a belt and the emblem.
    const body = new Path2D()
    body.moveTo(-shW, top + 3.5)
    body.quadraticCurveTo(-shW, top - breath, -shW + 3.5, top - breath)
    body.lineTo(shW - 3.5, top - breath)
    body.quadraticCurveTo(shW, top - breath, shW, top + 3.5)
    body.quadraticCurveTo(shW * 0.95, hipY - 2, shW * 0.82, hipY + 0.5)
    body.lineTo(-shW * 0.82, hipY + 0.5)
    body.quadraticCurveTo(-shW * 0.95, hipY - 2, -shW, top + 3.5)
    body.closePath()
    const tg = ctx.createLinearGradient(-shW, top, shW, hipY)
    tg.addColorStop(0, shade(color, 0.18))
    tg.addColorStop(0.55, color)
    tg.addColorStop(1, shade(color, -0.25))
    ctx.fillStyle = tg
    ctx.fill(body)
    ctx.save()
    ctx.clip(body)
    // Back half in shadow (the light comes from the front).
    ctx.fillStyle = 'rgb(20 10 40 / 0.18)'
    ctx.fillRect(-shW - 1, top - 2, shW * 0.75, torsoH + 4)
    // Collar: a V of lighter cloth.
    ctx.fillStyle = shade(color, 0.55)
    ctx.beginPath()
    ctx.moveTo(-3.5, top - 1)
    ctx.lineTo(0.5, top + 4)
    ctx.lineTo(4.5, top - 1)
    ctx.closePath()
    ctx.fill()
    // Belt with a buckle.
    ctx.fillStyle = shade(color, -0.55)
    ctx.fillRect(-shW, hipY - 3.4, shW * 2, 2.8)
    ctx.restore()
    ctx.strokeStyle = OUT
    ctx.lineWidth = 1.2
    ctx.stroke(body)
    ctx.fillStyle = '#ffd43b'
    ctx.strokeStyle = OUT
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.rect(0.5, hipY - 3.7, 3, 3.4)
    ctx.fill()
    ctx.stroke()
    if (this.emblem?.complete && this.emblem.naturalWidth) ctx.drawImage(this.emblem, -0.5, top + 3.5, 7, 7)
    if (SCARF.has(id)) {
      const flow = (this.moving ? 7 : 2.5) + this.hair.x * 4 + Math.sin(this.time * 6) * 1.5
      ctx.fillStyle = id === 'ninja' ? '#c92a2a' : shade(color, 0.35)
      ctx.strokeStyle = OUT
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.roundRect(-shW + 0.5, top - 2, shW * 2 - 1, 3.4, 1.5)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(-shW + 2, top)
      ctx.quadraticCurveTo(-shW - flow * 0.5, top + 2 + Math.sin(this.time * 8), -shW - flow, top + 4)
      ctx.lineTo(-shW - flow + 1.5, top + 7)
      ctx.quadraticCurveTo(-shW - flow * 0.3, top + 5, -shW + 3, top + 2.5)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }

    // Front arm: on the ball while holding it, else posed by the mood.
    const ik = reachBall()
    const front = arm(1, ik ? ik.s : p.sF, ik ? ik.e : p.eF, false)
    // Throw: a motion streak along the arm's swing.
    if (this.smear > 0 && !still) {
      const o = shoulder(1)
      ctx.strokeStyle = `rgb(255 255 255 / ${0.55 * this.smear})`
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(o.x, o.y, UPPER + FORE, -Math.PI * 0.95, -Math.PI * 0.95 + 1.6 * (1 - this.smear * 0.4))
      ctx.stroke()
    }

    // ----- Head (lags the body a touch) -----
    const neckY = top - 0.5 - breath
    const headR = 11.5
    const hy = neckY - headR + 1.8 + (still ? 0 : this.head.x * 0.5)
    ctx.save()
    ctx.translate(0, neckY)
    ctx.rotate(p.tilt + (still ? 0 : this.head.x * 0.01))
    ctx.translate(0, -neckY)
    ctx.fillStyle = shade(skin, -0.15)
    ctx.fillRect(-2, neckY - 3, 4, 4)
    const hat = this.hero.hat
    const covered = hat === 'helmet' || hat === 'hood'
    if (!covered) {
      // Back hair (long for some), swinging with the hair spring.
      ctx.fillStyle = hair
      ctx.strokeStyle = OUT
      ctx.lineWidth = 1.1
      ctx.beginPath()
      ctx.arc(-1, hy - 0.5, headR + 1.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      if (LONG_HAIR.has(id)) {
        const sw = still ? 0 : this.hair.x * 6
        ctx.beginPath()
        ctx.moveTo(-headR + 1, hy)
        ctx.quadraticCurveTo(-headR - 3 - sw, hy + 9, -headR + 2 - sw * 1.4, hy + 15)
        ctx.quadraticCurveTo(-4, hy + 12, -2, hy + 4)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    }
    if (hat === 'hood') this.drawHoodBack(ctx, hy, headR, color)
    // Face, shaded for volume.
    const fg = ctx.createRadialGradient(3, hy - 4, 2, 0, hy, headR + 1)
    fg.addColorStop(0, shade(skin, 0.18))
    fg.addColorStop(0.7, skin)
    fg.addColorStop(1, shade(skin, -0.14))
    ctx.fillStyle = fg
    ctx.strokeStyle = OUT
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.arc(0, hy, headR, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    // Ear, with an inner shade.
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.ellipse(-headR + 1.5, hy + 1.5, 2.2, 3.2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = shade(skin, -0.2)
    ctx.beginPath()
    ctx.ellipse(-headR + 1.8, hy + 1.6, 0.9, 1.7, 0, 0, Math.PI * 2)
    ctx.fill()
    // Fringe with a shine band.
    if (!covered && hat !== 'mask' && hat !== 'spikes') {
      ctx.fillStyle = hair
      ctx.strokeStyle = OUT
      ctx.lineWidth = 1.1
      ctx.beginPath()
      ctx.moveTo(-headR, hy - 0.5)
      ctx.quadraticCurveTo(-headR + 1, hy - headR - 1.5, 2, hy - headR - 1)
      ctx.quadraticCurveTo(headR + 1.5, hy - headR + 1, headR + 0.3, hy - 1.5)
      ctx.quadraticCurveTo(7, hy - 5, 4.5, hy - 4)
      ctx.lineTo(3, hy - 6.5)
      ctx.quadraticCurveTo(0.5, hy - 4.5, -1.5, hy - 5)
      ctx.lineTo(-3, hy - 7)
      ctx.quadraticCurveTo(-6, hy - 4, -headR, hy - 0.5)
      ctx.fill()
      ctx.stroke()
      ctx.strokeStyle = shade(hair, 0.45)
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(1, hy - 2, headR - 1.5, Math.PI * 1.25, Math.PI * 1.5)
      ctx.stroke()
    }
    this.drawFace(ctx, hy, p, hair)
    if (BEARD.has(id)) {
      ctx.fillStyle = id === 'sage' ? '#f1f3f5' : shade(hair, 0.1)
      ctx.strokeStyle = OUT
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-5.5, hy + 4)
      ctx.quadraticCurveTo(2, hy + (id === 'sage' ? 19 : 14), 9, hy + 4)
      ctx.quadraticCurveTo(5, hy + 9.5, 3, hy + 8)
      ctx.quadraticCurveTo(0, hy + 9.5, -5.5, hy + 4)
      ctx.fill()
      ctx.stroke()
    }
    if (PATCH.has(id)) {
      ctx.fillStyle = OUT
      ctx.beginPath()
      ctx.ellipse(6.5, hy - 0.5, 3.2, 2.8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = OUT
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.moveTo(-headR + 1, hy - 5)
      ctx.lineTo(headR - 1, hy + 1)
      ctx.stroke()
    }
    this.drawHat(ctx, hat, hy, headR, color, hair)
    ctx.restore() // head tilt
    ctx.restore() // lean
    ctx.shadowBlur = 0

    // The ball in hand: locked to the launch point while holding, else carried by the hand.
    let ball: { x: number; y: number } | null = null
    if (this.hold && this.mood !== 'throw' && this.mood !== 'ko' && !this.moving) {
      ball = ik ? null : { x: front.x, y: front.y - 2 }
    }
    ctx.restore()
    if (this.hold && ik) this.drawBall(ctx, this.hold.x, this.hold.y, this.hold.r)
    else if (ball && this.hold) {
      // Carried in a posed hand: local → board.
      this.drawBall(
        ctx,
        x + ball.x * this.facing * scale,
        floorY + hopY * scale + ball.y * scale,
        this.hold.r,
      )
    }
    if (p.fall < 0.5) this.drawEmote(ctx, x, floorY + hopY * scale - 56 * scale, scale)
    if (this.mood === 'ko' && p.fall > 0.9)
      this.drawDizzy(ctx, x - 16 * this.facing * scale, floorY - 8 * scale, scale)
  }

  /** 0..1 how strong the combo aura is (from combo 10 to 100). */
  private auraK(): number {
    return this.mood === 'ko' ? 0 : Math.max(0, Math.min(1, (this.combo - 10) / 90))
  }

  /**
   * The hero's aura, behind it, drawn with additive light:
   * - combo: a rune circle on the ground, living flame tongues rising around
   *   the body and ember streaks, gold → orange → white-hot at fever;
   * - hit: a red double shockwave and shards;
   * - a volley that broke nothing: a storm cloud with rain and a cold mist;
   * - healed: a green rising glow.
   */
  private drawAura(ctx: CanvasRenderingContext2D, x: number, floor: number, scale: number): void {
    const still = prefersReducedMotion()
    const t = still ? 0 : this.time
    const cy = floor - 24 * scale
    const k = this.auraK()
    const hot = this.combo >= 100
    ctx.save()
    if (k > 0) {
      ctx.globalCompositeOperation = 'lighter'
      const core = hot ? [255, 244, 214] : k > 0.5 ? [255, 170, 60] : [255, 210, 70]
      const rgb = (a: number, c = core) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`
      // Ground rune circle: a glowing ring with dashes that spin.
      const rr = (16 + 8 * k) * scale
      ctx.lineWidth = 1.6 * scale
      ctx.strokeStyle = rgb(0.35 + 0.4 * k)
      ctx.beginPath()
      ctx.ellipse(x, floor, rr, rr * 0.3, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.lineWidth = 2.4 * scale
      const dashes = 8
      for (let i = 0; i < dashes; i++) {
        const a0 = t * (1.2 + 2 * k) + (i * Math.PI * 2) / dashes
        ctx.strokeStyle = rgb(0.5 + 0.4 * k)
        ctx.beginPath()
        ctx.ellipse(x, floor, rr * 0.82, rr * 0.82 * 0.3, 0, a0, a0 + 0.35)
        ctx.stroke()
      }
      const pool = ctx.createRadialGradient(x, floor, 0, x, floor, rr * 1.2)
      pool.addColorStop(0, rgb(0.35 * k))
      pool.addColorStop(1, rgb(0))
      ctx.fillStyle = pool
      ctx.beginPath()
      ctx.ellipse(x, floor, rr * 1.2, rr * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()

      // Flame tongues around the body, leaning up, flickering on their own beat.
      if (k > 0.2) {
        const n = Math.round(7 + 7 * k)
        const reach = (8 + 18 * k) * scale
        for (let i = 0; i < n; i++) {
          const a = Math.PI * (0.05 + (0.9 * i) / (n - 1)) + Math.PI // across the top half and sides
          const bx = x + Math.cos(a) * 13 * scale
          const by = cy + Math.sin(a) * 22 * scale + 14 * scale
          const flick = 0.6 + 0.4 * Math.sin(t * (9 + i) + i * 1.7)
          const len = reach * flick
          // Outward, but pulled upward like real flame.
          let dx = Math.cos(a) * 0.6
          let dy = -1
          const d = Math.hypot(dx, dy)
          dx /= d
          dy /= d
          const tipX = bx + dx * len + Math.sin(t * 6 + i) * 2 * scale
          const tipY = by + dy * len
          const w = (3 + 3 * k) * scale
          const g = ctx.createLinearGradient(bx, by, tipX, tipY)
          g.addColorStop(0, rgb(0.55 * k + 0.15))
          g.addColorStop(0.5, rgb(0.3 * k, hot ? [255, 200, 120] : [255, 120, 40]))
          g.addColorStop(1, rgb(0))
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.moveTo(bx - dy * w, by + dx * w)
          ctx.quadraticCurveTo(bx + dx * len * 0.5 - dy * w, by + dy * len * 0.5 + dx * w, tipX, tipY)
          ctx.quadraticCurveTo(
            bx + dx * len * 0.5 + dy * w,
            by + dy * len * 0.5 - dx * w,
            bx + dy * w,
            by - dx * w,
          )
          ctx.closePath()
          ctx.fill()
        }
      }
      // A soft body glow under it all.
      const glow = ctx.createRadialGradient(x, cy, 4 * scale, x, cy, (26 + 12 * k) * scale)
      glow.addColorStop(0, rgb(0.28 * k))
      glow.addColorStop(1, rgb(0))
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.ellipse(x, cy, (22 + 10 * k) * scale, (30 + 12 * k) * scale, 0, 0, Math.PI * 2)
      ctx.fill()

      if (!still) {
        // Embers streaking up, with a short trail; twinkling stars at high combos.
        const n = Math.round(5 + 10 * k)
        for (let i = 0; i < n; i++) {
          const phase = (t * (0.6 + 0.8 * k) + ((i * 0.618) % 1)) % 1
          const sway = Math.sin(i * 2.4 + t * 2.2) * (10 + 8 * k) * scale
          const ex = x + sway
          const ey = floor - phase * (56 + 26 * k) * scale
          const alpha = Math.sin(phase * Math.PI)
          // Bright, glowing embers (pale gold, white-hot at fever).
          ctx.strokeStyle = rgb(Math.max(0.5, alpha), hot ? [255, 255, 240] : [255, 226, 130])
          ctx.shadowColor = hot ? '#fff3bf' : '#ffb000'
          ctx.shadowBlur = 6 * scale
          ctx.lineWidth = (1.2 + 1.2 * k) * scale
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(ex, ey)
          ctx.lineTo(ex - Math.cos(i * 2.4 + t * 2.2) * 1.5 * scale, ey + (4 + 6 * k) * scale)
          ctx.stroke()
          if (k > 0.6 && i % 3 === 0) {
            // A four-point twinkle.
            const r = (2 + 2.5 * k) * scale * alpha
            ctx.fillStyle = rgb(alpha, [255, 255, 255])
            ctx.beginPath()
            ctx.moveTo(ex, ey - r)
            ctx.quadraticCurveTo(ex, ey, ex + r, ey)
            ctx.quadraticCurveTo(ex, ey, ex, ey + r)
            ctx.quadraticCurveTo(ex, ey, ex - r, ey)
            ctx.quadraticCurveTo(ex, ey, ex, ey - r)
            ctx.fill()
          }
        }
      }
      ctx.shadowBlur = 0
      ctx.globalCompositeOperation = 'source-over'
    }

    // Hit: a red flash, two shockwave rings and shards bursting out.
    if (this.hitRing !== null) {
      const h = this.hitRing / 0.6
      ctx.globalCompositeOperation = 'lighter'
      const flash = ctx.createRadialGradient(x, cy, 0, x, cy, 34 * scale)
      flash.addColorStop(0, `rgb(255 80 80 / ${0.45 * (1 - h)})`)
      flash.addColorStop(1, 'rgb(255 80 80 / 0)')
      ctx.fillStyle = flash
      ctx.beginPath()
      ctx.ellipse(x, cy, 30 * scale, 36 * scale, 0, 0, Math.PI * 2)
      ctx.fill()
      for (const [delay, width] of [
        [0, 4],
        [0.18, 2.5],
      ]) {
        const q = Math.max(0, (h - delay) / (1 - delay))
        if (q <= 0) continue
        ctx.strokeStyle = `rgb(255 90 90 / ${0.85 * (1 - q)})`
        ctx.lineWidth = width * (1 - q * 0.7) * scale
        ctx.beginPath()
        ctx.ellipse(x, cy, (8 + 34 * q) * scale, (12 + 40 * q) * scale, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.fillStyle = `rgb(255 200 200 / ${1 - h})`
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3
        const d = (10 + 36 * h) * scale
        const sx = x + Math.cos(a) * d
        const sy = cy + Math.sin(a) * d * 1.15
        ctx.beginPath()
        ctx.moveTo(sx + Math.cos(a) * 4 * scale, sy + Math.sin(a) * 4 * scale)
        ctx.lineTo(sx + Math.cos(a + 1.6) * 1.5 * scale, sy + Math.sin(a + 1.6) * 1.5 * scale)
        ctx.lineTo(sx + Math.cos(a - 1.6) * 1.5 * scale, sy + Math.sin(a - 1.6) * 1.5 * scale)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    // Failed: a cold mist at the feet and a little storm cloud raining on the hero.
    if (this.mood === 'sad') {
      const f = Math.min(1, this.moodAge / 0.3) * Math.max(0, Math.min(1, (1.4 - this.moodAge) / 0.4))
      const mist = ctx.createRadialGradient(x, floor, 0, x, floor, 30 * scale)
      mist.addColorStop(0, `rgb(120 140 200 / ${0.45 * f})`)
      mist.addColorStop(1, 'rgb(120 140 200 / 0)')
      ctx.fillStyle = mist
      ctx.beginPath()
      ctx.ellipse(x, floor, 30 * scale, 9 * scale, 0, 0, Math.PI * 2)
      ctx.fill()
      const top = floor - 70 * scale + Math.sin(t * 2) * 1.2 * scale
      const cloud = new Path2D()
      for (const [dx, dy, r] of [
        [-7, 1, 5],
        [-1, -3, 7],
        [6, -1, 6],
        [11, 2, 4.5],
        [2, 3, 6],
      ])
        cloud.ellipse(x + dx * scale, top + dy * scale, r * scale, r * 0.9 * scale, 0, 0, Math.PI * 2)
      const cg = ctx.createLinearGradient(0, top - 10 * scale, 0, top + 8 * scale)
      cg.addColorStop(0, `rgb(170 178 205 / ${f})`)
      cg.addColorStop(1, `rgb(95 104 140 / ${f})`)
      // Outline first (thick), then the fill over it: one clean outline round the whole cloud.
      ctx.strokeStyle = `rgb(40 44 70 / ${0.8 * f})`
      ctx.lineWidth = 2.2 * scale
      ctx.stroke(cloud)
      ctx.fillStyle = cg
      ctx.fill(cloud)
      if (!still) {
        for (let i = 0; i < 6; i++) {
          const d = (t * 3 + i * 0.37) % 1
          const rx = x + (-8 + i * 3.4) * scale
          const ry = top + (7 + d * 26) * scale
          ctx.strokeStyle = `rgb(140 200 255 / ${0.9 * f * (1 - d)})`
          ctx.lineWidth = 1.3 * scale
          ctx.beginPath()
          ctx.moveTo(rx, ry)
          ctx.lineTo(rx - 1.2 * scale, ry + 4.5 * scale)
          ctx.stroke()
        }
      }
    }

    // Healed: a green light rising from the feet.
    if (this.mood === 'heal') {
      const f = Math.max(0, 1 - this.moodAge / 1.1)
      ctx.globalCompositeOperation = 'lighter'
      // A soft glow (no hard edge) and sparkles drifting up.
      const g = ctx.createRadialGradient(x, cy, 2 * scale, x, cy, 34 * scale)
      g.addColorStop(0, `rgb(105 219 124 / ${0.4 * f})`)
      g.addColorStop(1, 'rgb(105 219 124 / 0)')
      ctx.fillStyle = g
      ctx.fillRect(x - 36 * scale, cy - 40 * scale, 72 * scale, 80 * scale)
      for (let i = 0; i < 8; i++) {
        const ph = (this.moodAge * 0.9 + i / 8) % 1
        const sx = x + Math.sin(i * 2.1) * 16 * scale
        const sy = floor - ph * 60 * scale
        const r = 2.2 * scale * Math.sin(ph * Math.PI)
        ctx.fillStyle = `rgb(180 255 190 / ${f * Math.sin(ph * Math.PI)})`
        ctx.fillRect(sx - r, sy - 0.5 * scale, 2 * r, 1 * scale)
        ctx.fillRect(sx - 0.5 * scale, sy - r, 1 * scale, 2 * r)
      }
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.restore()
  }

  private drawFace(ctx: CanvasRenderingContext2D, hy: number, p: Pose, hair: string): void {
    // Three-quarter view: features sit a little toward the way the hero faces.
    const fx = 2.5
    const lx = this.lookX * 1.2
    const ly = this.lookY * 1.1
    for (const ex of [fx - 4, fx + 4.2]) {
      const ey = hy - 0.5
      const near = ex > fx
      const w = near ? 2.9 : 2.5
      const h = 3.7
      if (this.eyes === 'happy') {
        ctx.strokeStyle = OUT
        ctx.lineWidth = 1.3
        ctx.beginPath()
        ctx.arc(ex, ey + 1, 2.2, Math.PI * 1.1, Math.PI * 1.9)
        ctx.stroke()
      } else if (this.eyes === 'squeeze') {
        ctx.strokeStyle = OUT
        ctx.lineWidth = 1.3
        ctx.beginPath()
        const d = near ? -1 : 1
        ctx.moveTo(ex - 2 * d, ey - 1.8)
        ctx.lineTo(ex + 1.5 * d, ey)
        ctx.lineTo(ex - 2 * d, ey + 1.8)
        ctx.stroke()
      } else if (this.eyes === 'xx') {
        ctx.strokeStyle = OUT
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(ex - 1.8, ey - 1.8)
        ctx.lineTo(ex + 1.8, ey + 1.8)
        ctx.moveTo(ex + 1.8, ey - 1.8)
        ctx.lineTo(ex - 1.8, ey + 1.8)
        ctx.stroke()
      } else {
        const wide = this.eyes === 'wide' ? 1.25 : 1
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = OUT
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.ellipse(ex, ey, w * wide, h * wide, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.save()
        ctx.clip()
        // Iris and pupil follow the look; wide eyes get small pupils.
        const ir = this.eyes === 'wide' ? 1.5 : 2.2
        const iris = EYES[this.hero.id] ?? '#6b4a2e'
        const ig = ctx.createLinearGradient(0, ey + ly - ir, 0, ey + ly + ir)
        ig.addColorStop(0, shade(iris, -0.35))
        ig.addColorStop(1, shade(iris, 0.25))
        ctx.fillStyle = ig
        ctx.beginPath()
        ctx.ellipse(ex + lx, ey + ly, ir, ir * 1.15, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = OUT
        ctx.beginPath()
        ctx.arc(ex + lx, ey + ly, ir * 0.5, 0, Math.PI * 2)
        ctx.fill()
        // Two shines: a big one up-left, a small one down-right.
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(ex + lx - 0.8, ey + ly - 1, 0.85, 0, Math.PI * 2)
        ctx.arc(ex + lx + 0.8, ey + ly + 0.9, 0.4, 0, Math.PI * 2)
        ctx.fill()
        // Upper eyelid: closes for blinks, half for winces and focus.
        const lid = 1 - p.eyeOpen
        if (lid > 0.02) {
          ctx.fillStyle = this.hero.skin
          ctx.fillRect(ex - w * wide - 1, ey - h * wide - 1, w * wide * 2 + 2, (h * wide * 2 + 2) * lid)
          ctx.strokeStyle = OUT
          ctx.lineWidth = 0.9
          ctx.beginPath()
          ctx.moveTo(ex - w * wide, ey - h * wide - 1 + (h * wide * 2 + 2) * lid)
          ctx.lineTo(ex + w * wide, ey - h * wide - 1 + (h * wide * 2 + 2) * lid)
          ctx.stroke()
        }
        ctx.restore()
        ctx.stroke()
        // A heavier upper lash line, with a flick at the outer corner.
        if (p.eyeOpen > 0.3) {
          const out = near ? 1 : -1
          ctx.strokeStyle = OUT
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.ellipse(ex, ey, w * wide, h * wide, 0, Math.PI * 1.08, Math.PI * 1.92)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(ex + out * w * wide * 0.9, ey - h * wide * 0.5)
          ctx.lineTo(ex + out * (w * wide + 1.2), ey - h * wide * 0.8)
          ctx.stroke()
        }
      }
      // Brows: angled by mood, raised by surprise.
      const inner = near ? -1 : 1
      const bx = ex
      const by = ey - 4.6 - p.browUp * 1.3
      ctx.strokeStyle = shade(hair, -0.2)
      ctx.lineWidth = 1.3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(bx + inner * 2, by + p.brow * 1.1)
      ctx.lineTo(bx - inner * 2, by - p.brow * 0.6)
      ctx.stroke()
    }
    // Blush.
    if (p.blush > 0.05) {
      ctx.fillStyle = `rgb(255 120 140 / ${0.45 * p.blush})`
      for (const bx of [fx - 6, fx + 6.5]) {
        ctx.beginPath()
        ctx.ellipse(bx, hy + 3.2, 2, 1.2, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // Nose.
    ctx.strokeStyle = shade(this.hero.skin, -0.3)
    ctx.lineWidth = 0.9
    ctx.beginPath()
    ctx.moveTo(fx + 1.2, hy + 1)
    ctx.lineTo(fx + 2, hy + 2.6)
    ctx.lineTo(fx + 1, hy + 2.9)
    ctx.stroke()
    // Mouth: a curve that smiles or frowns, opening into a shape.
    if (this.hero.hat === 'mask') return
    const mx = fx + 0.5
    const my = hy + 5.2
    const mw = 2.6 + p.mouthOpen * 0.8 + Math.max(0, p.smile) * 0.6
    ctx.strokeStyle = OUT
    ctx.lineWidth = 1.1
    if (p.mouthOpen > 0.2) {
      const h = 1 + p.mouthOpen * 3.2
      ctx.fillStyle = '#7a1f2b'
      ctx.beginPath()
      if (p.smile >= 0) {
        ctx.moveTo(mx - mw, my - 0.5)
        ctx.quadraticCurveTo(mx, my - 0.5 - p.smile, mx + mw, my - 0.5)
        ctx.quadraticCurveTo(mx, my + h + p.smile, mx - mw, my - 0.5)
      } else {
        ctx.ellipse(mx, my + h / 3, mw * 0.8, h / 2, 0, 0, Math.PI * 2)
      }
      ctx.fill()
      ctx.stroke()
      // Teeth when gritting or grinning wide.
      if (p.smile > 0.6 || p.smile < -0.8) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(mx - mw * 0.7, my - 0.4, mw * 1.4, 1.2)
      }
      // Tongue on a big open smile.
      if (p.smile > 0.6 && p.mouthOpen > 0.6) {
        ctx.fillStyle = '#ff8fa3'
        ctx.beginPath()
        ctx.ellipse(mx, my + h * 0.7, mw * 0.5, 1, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      ctx.beginPath()
      ctx.moveTo(mx - mw, my)
      ctx.quadraticCurveTo(mx, my + p.smile * 2.6, mx + mw, my)
      ctx.stroke()
    }
    // Tears when hurt badly or knocked out.
    if (this.mood === 'ko' || (this.mood === 'hurt' && this.moodAge < 0.6)) {
      ctx.fillStyle = '#74c0fc'
      const drop = (this.time * 20) % 6
      ctx.beginPath()
      ctx.ellipse(fx + 6.5, hy + 2 + drop, 1, 1.6, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawHoodBack(ctx: CanvasRenderingContext2D, hy: number, r: number, color: string): void {
    ctx.fillStyle = shade(color, -0.2)
    ctx.strokeStyle = OUT
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(-r - 3, hy + r)
    ctx.quadraticCurveTo(-r - 4, hy - r - 4, 1, hy - r - 4)
    ctx.quadraticCurveTo(r + 4, hy - r - 2, r + 3, hy + r - 2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  private drawHat(
    ctx: CanvasRenderingContext2D,
    hat: HeroHat,
    hy: number,
    r: number,
    color: string,
    hair: string,
  ): void {
    const fill = (c: string, stroke = true) => {
      ctx.fillStyle = c
      ctx.fill()
      if (stroke) {
        ctx.strokeStyle = OUT
        ctx.lineWidth = 1.1
        ctx.stroke()
      }
    }
    const top = hy - r
    ctx.lineJoin = 'round'
    switch (hat) {
      case 'cap':
        ctx.beginPath()
        ctx.arc(0, hy - 2, r + 0.5, Math.PI, 0)
        ctx.closePath()
        fill(color)
        ctx.beginPath()
        ctx.ellipse(r - 1, hy - 2, 7, 2, 0, 0, Math.PI * 2)
        fill(shade(color, -0.25))
        ctx.beginPath()
        ctx.arc(0, top - 0.5, 1.6, 0, Math.PI * 2)
        fill('#ffffff', false)
        break
      case 'helmet':
        ctx.beginPath()
        ctx.arc(0, hy - 1, r + 1.5, Math.PI * 0.95, Math.PI * 2.05)
        ctx.lineTo(r + 1.5, hy + 4)
        ctx.lineTo(-r - 1.5, hy + 4)
        ctx.closePath()
        fill('#ced4da')
        // Visor slit lifted to show the eyes.
        ctx.beginPath()
        ctx.rect(-r + 1, hy - 5.5, r * 2 - 2, 2.2)
        fill('#495057', false)
        ctx.beginPath()
        ctx.moveTo(0, top - 1.5)
        ctx.quadraticCurveTo(-4, top - 7, -9, top - 4)
        ctx.lineWidth = 2.5
        ctx.strokeStyle = '#e03131'
        ctx.stroke()
        break
      case 'horns':
        for (const s of [-1, 1]) {
          ctx.beginPath()
          ctx.moveTo(s * (r - 3), top + 3)
          ctx.quadraticCurveTo(s * (r + 6), top - 2, s * (r + 4), top - 9)
          ctx.quadraticCurveTo(s * (r + 1), top - 3, s * (r - 6), top + 1)
          ctx.closePath()
          fill('#f1f3f5')
        }
        ctx.beginPath()
        ctx.arc(0, hy - 2, r + 0.8, Math.PI * 1.05, Math.PI * 1.95)
        ctx.closePath()
        fill(shade(color, -0.3))
        break
      case 'hood':
        ctx.beginPath()
        ctx.moveTo(-r - 2, hy + 2)
        ctx.quadraticCurveTo(-r - 2, top - 4, 1, top - 4)
        ctx.quadraticCurveTo(r + 3, top - 3, r + 1, hy - 4)
        ctx.quadraticCurveTo(r - 4, top + 1, -r + 1, hy + 1)
        ctx.closePath()
        fill(color)
        break
      case 'wizard': {
        const sway = Math.sin(this.time * 2) * 1.5
        ctx.beginPath()
        ctx.moveTo(-r - 3, top + 4)
        ctx.quadraticCurveTo(-2, top - 6, 2 + sway, top - 17)
        ctx.quadraticCurveTo(5, top - 6, r + 3, top + 4)
        ctx.closePath()
        fill(color)
        ctx.beginPath()
        ctx.ellipse(0, top + 4, r + 5, 2.6, 0, 0, Math.PI * 2)
        fill(shade(color, -0.3))
        ctx.beginPath()
        ctx.arc(-1, top - 3, 1.4, 0, Math.PI * 2)
        ctx.arc(3, top - 8, 1, 0, Math.PI * 2)
        fill('#ffd43b', false)
        break
      }
      case 'crown':
        ctx.beginPath()
        ctx.moveTo(-7, top + 2)
        ctx.lineTo(-8, top - 6)
        ctx.lineTo(-4, top - 2)
        ctx.lineTo(0, top - 8)
        ctx.lineTo(4, top - 2)
        ctx.lineTo(8, top - 6)
        ctx.lineTo(7, top + 2)
        ctx.closePath()
        fill('#ffd43b')
        ctx.beginPath()
        ctx.arc(0, top - 1.5, 1.3, 0, Math.PI * 2)
        fill('#e03131', false)
        break
      case 'halo':
        ctx.save()
        ctx.shadowColor = '#fff3bf'
        ctx.shadowBlur = 8
        ctx.strokeStyle = '#ffd43b'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.ellipse(0, top - 5 + Math.sin(this.time * 3) * 0.8, 8, 2.4, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
        break
      case 'tophat':
        ctx.beginPath()
        ctx.rect(-7, top - 11, 14, 12)
        fill('#212529')
        ctx.beginPath()
        ctx.rect(-7, top - 3, 14, 2.5)
        fill(color, false)
        ctx.beginPath()
        ctx.ellipse(0, top + 1, r + 3, 2.4, 0, 0, Math.PI * 2)
        fill('#212529')
        break
      case 'bandana':
        ctx.beginPath()
        ctx.arc(0, hy - 2, r + 0.6, Math.PI * 1.02, Math.PI * 1.98)
        ctx.closePath()
        fill(color)
        ctx.beginPath()
        ctx.moveTo(-r, hy - 3)
        ctx.lineTo(-r - 6, hy - 1 + Math.sin(this.time * 7))
        ctx.lineTo(-r - 4, hy + 2)
        ctx.closePath()
        fill(color)
        for (const d of [-4, 0, 4]) {
          ctx.beginPath()
          ctx.arc(d, hy - r + 3, 0.9, 0, Math.PI * 2)
          fill('#ffffff', false)
        }
        break
      case 'mask':
        // Hair tied up, a cloth over the lower face, a headband.
        ctx.beginPath()
        ctx.arc(0, hy - 2, r + 0.8, Math.PI, 0)
        ctx.closePath()
        fill(hair)
        ctx.beginPath()
        ctx.rect(-r, hy - 5, r * 2, 2.4)
        fill('#c92a2a', false)
        ctx.beginPath()
        ctx.moveTo(-r + 0.5, hy + 2)
        ctx.quadraticCurveTo(2, hy + 0.5, r - 0.5, hy + 2)
        ctx.quadraticCurveTo(r - 2, hy + r, 0, hy + r)
        ctx.quadraticCurveTo(-r + 2, hy + r, -r + 0.5, hy + 2)
        fill('#343a40')
        break
      case 'tricorn':
        ctx.beginPath()
        ctx.moveTo(-r - 5, top + 3)
        ctx.quadraticCurveTo(-4, top - 9, 0, top - 6)
        ctx.quadraticCurveTo(4, top - 9, r + 5, top + 3)
        ctx.quadraticCurveTo(0, top + 0, -r - 5, top + 3)
        fill('#212529')
        ctx.beginPath()
        ctx.moveTo(-r - 4, top + 2.5)
        ctx.quadraticCurveTo(0, top - 0.5, r + 4, top + 2.5)
        ctx.strokeStyle = '#fcc419'
        ctx.lineWidth = 1.2
        ctx.stroke()
        // A skull badge.
        ctx.beginPath()
        ctx.arc(0, top - 3, 1.8, 0, Math.PI * 2)
        fill('#ffffff', false)
        break
      case 'spikes':
        ctx.beginPath()
        ctx.moveTo(-r - 1, hy - 1)
        for (let i = 0; i <= 6; i++) {
          const a = Math.PI + (i / 6) * Math.PI
          const sp = i % 2 ? r + 1 : r + 7
          ctx.lineTo(Math.cos(a) * sp - (i % 2 ? 0 : 1), hy - 2 + Math.sin(a) * sp)
        }
        ctx.closePath()
        fill(hair)
        break
      case 'goggles':
        ctx.beginPath()
        ctx.rect(-r, hy - 7, r * 2, 2.4)
        fill('#495057', false)
        for (const gx of [-2, 5]) {
          ctx.beginPath()
          ctx.arc(gx, hy - 6, 3, 0, Math.PI * 2)
          fill('#495057')
          ctx.beginPath()
          ctx.arc(gx, hy - 6, 2, 0, Math.PI * 2)
          fill('#a5d8ff', false)
        }
        break
      case 'none':
        // A tuft of hair.
        ctx.beginPath()
        ctx.moveTo(-2, top + 1)
        ctx.quadraticCurveTo(0, top - 6, 4, top - 4)
        ctx.quadraticCurveTo(2, top - 1, 3, top + 1)
        fill(hair, false)
        break
    }
  }

  private drawEmote(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
    const e = this.emote
    if (!e) return
    const pop = Math.min(1, e.age / 0.12)
    const fade = Math.min(1, (1.3 - e.age) / 0.3)
    const s = scale * (0.6 + 0.4 * pop) * (1 + 0.15 * Math.max(0, 1 - e.age / 0.25))
    const ex = x + 12 * this.facing * scale
    const ey = y - 4 * scale * Math.min(1, e.age * 3)
    ctx.save()
    ctx.globalAlpha = Math.max(0, fade)
    ctx.translate(ex, ey)
    ctx.scale(s, s)
    ctx.lineJoin = 'round'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const bubble = (fill: string) => {
      ctx.fillStyle = fill
      ctx.strokeStyle = OUT
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(0, 0, 7, 0, Math.PI * 2)
      ctx.moveTo(-3, 5)
      ctx.lineTo(-6 * this.facing, 10)
      ctx.lineTo(1, 6.5)
      ctx.fill()
      ctx.stroke()
    }
    switch (e.kind) {
      case 'alert':
        bubble('#ffd43b')
        ctx.fillStyle = OUT
        ctx.fillRect(-1.2, -4.5, 2.4, 5.5)
        ctx.fillRect(-1.2, 2, 2.4, 2.2)
        break
      case 'question':
        bubble('#ffffff')
        ctx.fillStyle = OUT
        ctx.font = '800 10px sans-serif'
        ctx.fillText('?', 0, 0.5)
        break
      case 'heart':
        ctx.fillStyle = '#ff6b81'
        ctx.strokeStyle = OUT
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(0, 6)
        ctx.bezierCurveTo(-9, 0, -5, -8, 0, -3)
        ctx.bezierCurveTo(5, -8, 9, 0, 0, 6)
        ctx.fill()
        ctx.stroke()
        break
      case 'anger':
        ctx.strokeStyle = '#ff3b3b'
        ctx.lineWidth = 2.2
        ctx.lineCap = 'round'
        for (const [a, b] of [
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ]) {
          ctx.beginPath()
          ctx.moveTo(a * 1.5, b * 5)
          ctx.quadraticCurveTo(a * 1.5, b * 1.5, a * 5, b * 1.5)
          ctx.stroke()
        }
        break
      case 'note':
        ctx.fillStyle = '#ffd43b'
        ctx.strokeStyle = OUT
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.ellipse(-2, 4, 3, 2.2, -0.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.fillRect(0.4, -6, 1.6, 10)
        ctx.beginPath()
        ctx.moveTo(2, -6)
        ctx.quadraticCurveTo(6, -4, 5, 0)
        ctx.lineWidth = 1.6
        ctx.strokeStyle = '#ffd43b'
        ctx.stroke()
        break
      case 'sweat':
        ctx.fillStyle = '#74c0fc'
        ctx.strokeStyle = OUT
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, -6)
        ctx.quadraticCurveTo(5, 1, 0, 4)
        ctx.quadraticCurveTo(-5, 1, 0, -6)
        ctx.fill()
        ctx.stroke()
        break
      case 'star':
        ctx.fillStyle = '#ffd43b'
        ctx.strokeStyle = OUT
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5 + e.age * 3
          const rr = i % 2 ? 3 : 7
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        break
    }
    ctx.restore()
  }

  /** Stars circling a knocked-out hero's head. */
  private drawDizzy(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
    ctx.save()
    ctx.fillStyle = '#ffd43b'
    for (let i = 0; i < 3; i++) {
      const a = this.time * 4 + (i * Math.PI * 2) / 3
      const sx = x + Math.cos(a) * 9 * scale
      const sy = y + Math.sin(a) * 3 * scale
      ctx.beginPath()
      for (let k = 0; k < 10; k++) {
        const b = (k * Math.PI) / 5
        const rr = (k % 2 ? 1.2 : 2.8) * scale
        ctx.lineTo(sx + Math.cos(b) * rr, sy + Math.sin(b) * rr)
      }
      ctx.fill()
    }
    ctx.restore()
  }
}

/**
 * The hero alive in a little stage of its own (the hero picker): idles,
 * blinks, looks around and cheers when tapped. Stops when removed from the page.
 */
export function avatarStage(
  hero: HeroId,
  width = 150,
  height = 150,
): {
  el: HTMLCanvasElement
  setHero: (id: HeroId) => void
  cheer: () => void
} {
  const canvas = document.createElement('canvas')
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1)
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  canvas.className = 'bs-hero-stage'
  const avatar = new HeroAvatar(hero)
  const ctx = canvas.getContext('2d')
  const scale = (height / 72) * 1.05
  const floorY = height - 10
  let last = performance.now()
  let started = false
  const frame = (now: number) => {
    if (started && !canvas.isConnected) return
    if (canvas.isConnected) started = true
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    avatar.update(dt, {
      homeX: width / 2 + 22,
      boardW: width,
      floorY,
      aim: null,
      watch: null,
      throwing: false,
      danger: false,
      lowHealth: false,
      combo: 0,
    })
    avatar.facing = 1
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      avatar.draw(ctx, floorY, scale, width / 2)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  return {
    el: canvas,
    setHero: (id) => avatar.setHero(id),
    cheer: () => avatar.setMood('cheer', 'note'),
  }
}
