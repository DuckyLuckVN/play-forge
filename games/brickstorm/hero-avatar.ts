// The hero as a living character beside the ball. This file is the brain:
// moods, priorities, springs (hop, knock, squash), position and facing, and the
// hold point. Poses blend toward a target set by the current mood, so reactions
// read clearly: a wind-up before a throw, a follow-through after, a flinch, a sigh.
// Every hero is a creature: its look (creature/looks.ts) picks a body type
// (creature/bodies) that draws from a shared Frame. The hands are solved from the
// pose (creature/hands.ts), with the front hand locked on the held ball in the hold
// moods. This file adds what every body shares: aura, emotes, dust, the KO stars
// and the signature fidget timer.
import { prefersReducedMotion } from '@forge/fx/tween'
import { BODIES } from './creature/bodies'
import { HandFollower, drawGrip, drawHand, solveHands } from './creature/hands'
import { drawHat } from './creature/hats'
import { CREATURE_LOOKS } from './creature/looks'
import { REAR_HOLD } from './creature/motion'
import { shadow as groundShadow } from './creature/paint'
import type { BodyType, CreatureLook, DrawKit, Frame, HandPose } from './creature/types'
import { heroEmblem } from './hero-art'
import { HEROES, type HeroDef, type HeroId } from './sim/heroes'
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

const OUT = '#1b1d2b'

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
export interface Pose {
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
  /**
   * How far a four-legged body sits up, 0..1: 0 on all fours, about 0.55 sitting up to hold the ball, 1 rearing up
   * on its hind legs. Blended like the rest, so the body never snaps between moods. Flyers use it as their takeoff and
   * landing blend (airborne below REAR_HOLD, landed at or above it); other bodies on two legs ignore it.
   */
  rear: number
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
  rear: 0,
}

export type EyeStyle = 'normal' | 'happy' | 'squeeze' | 'wide' | 'xx'

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
/** Hands can hold once the KO fall is this low: the pose blend only approaches 0, it never quite gets there. */
const HOLD_FALL = 0.02

/** Signature fidget: runs 1.2 s, starts every 6-10 s of quiet idle/watch. */
const SIGNATURE_LEN = 1.2
const SIGNATURE_GAP_MIN = 6
const SIGNATURE_GAP_MAX = 10

/** Moods that rear right up on the hind legs. */
const REAR_UP = new Set<Mood>(['cheer', 'cast', 'revive', 'wow'])
/** Pose `rear` target: on all fours without a ball (or sad), sitting up with one, rearing up to celebrate. */
export function rearFor(mood: Mood, hasBall: boolean): number {
  if (REAR_UP.has(mood)) return 1
  if (mood === 'pump') return 0.75
  if (mood === 'sad' || mood === 'ko' || (!hasBall && (mood === 'idle' || mood === 'watch'))) return 0
  return REAR_HOLD
}

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
  /** Run cycle phase, advanced while moving. */
  private stride = 0
  private moving = 0
  private emote: { kind: Emote; age: number } | null = null
  /** The body's signature fidget: seconds until the next one, and its age while playing (-1 = not playing). */
  private sigIn = 0
  private sigAge = -1
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
  /** Creature hands follow their solved targets through springs (local units). */
  private handF = new HandFollower()
  private handB = new HandFollower()
  /** Snap the hands onto their targets at the next draw (new hero, reset, first placement). */
  private snapHands = true
  /** `time` at the last creature draw, so the hand springs advance by real time between draws. */
  private handsAt = 0
  private hands: { front: { x: number; y: number }; back: { x: number; y: number } } | null = null

  /** `rng` (0..1) times the signature fidget gaps; injectable so tests are deterministic. */
  constructor(
    hero: HeroId,
    private readonly rng: () => number = Math.random,
  ) {
    this.hero = HEROES[hero]
    this.loadEmblem()
    this.sigIn = this.nextSigGap()
  }

  /** Signature fidget progress 0..1 (0 when not playing). */
  get signature(): number {
    return this.sigAge < 0 ? 0 : Math.min(1, this.sigAge / SIGNATURE_LEN)
  }

  private nextSigGap(): number {
    return SIGNATURE_GAP_MIN + this.rng() * (SIGNATURE_GAP_MAX - SIGNATURE_GAP_MIN)
  }

  /** Ticks the signature fidget: waits while idle/watch, plays 0..1, cancels on any other mood. */
  private updateSignature(dt: number): void {
    if (this.mood !== 'idle' && this.mood !== 'watch') {
      this.sigAge = -1
      this.sigIn = this.nextSigGap()
      return
    }
    if (prefersReducedMotion()) {
      this.sigAge = -1
      return
    }
    if (this.sigAge >= 0) {
      this.sigAge += dt
      if (this.sigAge >= SIGNATURE_LEN) {
        this.sigAge = -1
        this.sigIn = this.nextSigGap()
      }
    } else if ((this.sigIn -= dt) <= 0) {
      this.sigAge = 0
    }
  }

  setHero(id: HeroId): void {
    if (this.hero.id === id) return
    this.hero = HEROES[id]
    this.loadEmblem()
    this.snapHands = true
    this.setMood('cheer')
  }

  /** Back to standing calm (a new or resumed run). */
  reset(): void {
    this.mood = 'idle'
    this.moodAge = 0
    this.placed = false
    this.snapHands = true
    this.emote = null
    this.knock.x = this.knock.v = this.hop.x = this.hop.v = 0
    // Stand straight up: no KO fall (or any other pose) left to blend out.
    this.pose = { ...BASE }
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
    this.sigAge = -1
    this.sigIn = this.nextSigGap()
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

    // Idle long enough: the body's signature fidget.
    this.updateSignature(dt)

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
        break
      case 'heal':
        p.sF = 0.7
        p.eF = 2.4
        p.sB = 0.5
        p.eB = 2.4
        p.tilt = -0.1
        p.smile = 0.8
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
    p.rear = rearFor(this.mood, this.hold !== null)
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

  /** Last solved hands in board units, for tests and debug (null before the first draw). */
  get lastHands(): { front: { x: number; y: number }; back: { x: number; y: number } } | null {
    return this.hands
  }

  /** Draws the hero standing on `floorY` at its x (or at `at`, for previews), `scale`× board size. */
  draw(ctx: CanvasRenderingContext2D, floorY: number, scale = this.size, at?: number): void {
    const look = CREATURE_LOOKS[this.hero.id]
    this.drawCreature(ctx, look, BODIES[look.body], floorY, scale, at)
  }

  /** The frame state every body type draws from (hold in local units is filled in by the draw). */
  private buildFrame(): Frame {
    const still = prefersReducedMotion()
    return {
      t: this.time,
      still,
      mood: this.mood,
      moodAge: this.moodAge,
      pose: this.pose,
      eyes: this.eyes,
      blink: this.blink,
      lookX: this.lookX,
      lookY: this.lookY,
      hop: still ? 0 : this.hop.x,
      squash: still ? 0 : this.squash.x,
      knock: still ? 0 : this.knock.x,
      smear: this.smear,
      hold: null,
      holding: false,
      fidget: this.signature,
    }
  }

  /**
   * The creature path: a body type draws from the frame, with hands solved from the mood pose
   * (the front hand locked on the held ball in the hold moods) and the ball gripped in the front hand.
   */
  private drawCreature(
    ctx: CanvasRenderingContext2D,
    look: CreatureLook,
    body: BodyType,
    floorY: number,
    scale: number,
    at?: number,
  ): void {
    const f = this.buildFrame()
    const still = f.still
    const tremble =
      !still && (this.mood === 'worried' || this.mood === 'scared') ? Math.sin(this.time * 40) * 0.6 : 0
    const x0 = (at ?? this.x) + (still ? 0 : this.knock.x * this.facing)
    const x = x0 + (tremble + (body.offsetX?.(look, f) ?? 0) * this.facing) * scale
    const hopY = f.hop
    const y = floorY + hopY * scale
    const toLocal = (p: { x: number; y: number }) => ({
      x: ((p.x - x) * this.facing) / scale,
      y: (p.y - y) / scale,
    })
    const toBoard = (p: { x: number; y: number }) => ({
      x: x + p.x * this.facing * scale,
      y: y + p.y * scale,
    })

    if (this.hold) {
      f.hold = { ...toLocal(this.hold), r: this.hold.r / scale }
      f.holding = HOLDS.has(this.mood) && !this.moving && this.pose.fall < HOLD_FALL
    }
    const m = body.metrics(look, f)
    f.pose = body.pose?.(look, f) ?? f.pose
    const target = solveHands(m, f.pose, f.hold, f.holding)

    // Hands lag their targets through springs (snapped on the ball, under reduced motion and after a switch).
    const dt = Math.max(0, this.time - this.handsAt)
    this.handsAt = this.time
    if (this.snapHands) {
      this.handF.snap(target.front)
      this.handB.snap(target.back)
      this.snapHands = false
    } else {
      this.handF.update(dt, target.front, f.holding, still)
      this.handB.update(dt, target.back, false, still)
    }
    /** The followed hand; the elbow shifts by half the lag so the arm stays joined. */
    const follow = (h: HandPose, p: HandFollower): HandPose => ({
      ...h,
      x: p.x,
      y: p.y,
      ex: h.ex + (p.x - h.x) * 0.5,
      ey: h.ey + (p.y - h.y) * 0.5,
      open: this.mood === 'throw' && this.moodAge > 0.22 ? 1 : h.open,
    })
    const hands = { front: follow(target.front, this.handF), back: follow(target.back, this.handB) }
    this.hands = { front: toBoard(hands.front), back: toBoard(hands.back) }

    this.drawDust(ctx, floorY, scale)
    this.drawAura(ctx, x, y, scale, m.headTop)
    ctx.save()
    ctx.translate(x, floorY)
    ctx.scale(scale, scale)
    groundShadow(ctx, 16, -hopY)
    ctx.restore()

    ctx.save()
    ctx.translate(x, y)
    ctx.scale(this.facing * scale, scale)
    // Rim light: the hero's skill glows in its colour; a combo makes the whole figure shine.
    const auraK = this.auraK()
    if (this.glow > 0 || auraK > 0.3) {
      const fromCombo = auraK > 0.3 && auraK * 18 > this.glow * 22
      ctx.shadowColor = fromCombo ? (this.combo >= 100 ? '#fff3bf' : '#ffc83d') : this.hero.color
      ctx.shadowBlur = fromCombo ? 6 + 14 * auraK : 22 * this.glow
    }
    const hand = (h: HandPose) =>
      body.drawHand ? body.drawHand(ctx, h, look, m.handR) : drawHand(ctx, h, look.hand, m.handR)
    // The ball rides in the front hand unless it is being thrown, the hero is down or running.
    const carried =
      this.hold && this.mood !== 'throw' && this.mood !== 'ko' && !this.moving ? this.hold : null
    const kit: DrawKit = {
      metrics: m,
      hands,
      backHand: () => hand(hands.back),
      frontHand: () => {
        const ball = !carried
          ? null
          : f.holding && f.hold
            ? f.hold
            : { x: hands.front.x, y: hands.front.y, r: carried.r / scale }
        hand(ball ? { ...hands.front, grip: ball.r } : hands.front)
        if (!carried || !ball) return
        const b = toBoard(ball)
        // The ball skin draws in board units: undo this frame's flip and scale around the origin.
        ctx.save()
        ctx.shadowBlur = 0
        ctx.scale(this.facing / scale, 1 / scale)
        ctx.translate(-x, -y)
        this.drawBall(ctx, f.holding ? carried.x : b.x, f.holding ? carried.y : b.y, carried.r)
        ctx.restore()
        if (body.drawGrip) body.drawGrip(ctx, hands.front, ball, look)
        else drawGrip(ctx, hands.front, ball, look.hand)
      },
      hat: (box) => drawHat(ctx, this.hero.hat, box, this.hero.color),
      emblem: (ex, ey, size) => {
        if (this.emblem?.complete && this.emblem.naturalWidth)
          ctx.drawImage(this.emblem, ex - size / 2, ey - size / 2, size, size)
      },
    }
    body.draw(ctx, look, f, kit)
    ctx.shadowBlur = 0
    // Throw: a motion streak along the arm's swing.
    if (this.smear > 0 && !still) {
      ctx.strokeStyle = `rgb(255 255 255 / ${0.55 * this.smear})`
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(
        m.socketF.x,
        m.socketF.y,
        m.upper + m.fore,
        -Math.PI * 0.95,
        -Math.PI * 0.95 + 1.6 * (1 - this.smear * 0.4),
      )
      ctx.stroke()
    }
    ctx.restore()

    if (this.pose.fall < 0.5) this.drawEmote(ctx, x, y + (m.headTop - 6) * scale, scale)
    if (this.mood === 'ko' && this.pose.fall > 0.9)
      this.drawDizzy(ctx, x + m.head.x * this.facing * scale, y + (m.head.y - 4) * scale, scale)
  }

  /** Dust puffs on the floor. */
  private drawDust(ctx: CanvasRenderingContext2D, floorY: number, scale: number): void {
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
  private drawAura(
    ctx: CanvasRenderingContext2D,
    x: number,
    floor: number,
    scale: number,
    headTop: number,
  ): void {
    const still = prefersReducedMotion()
    const t = still ? 0 : this.time
    /** Heights scale with the figure (1× at a head top of −50). */
    const tall = -headTop / 50
    const cy = floor - 24 * tall * scale
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
      const top = floor - 70 * tall * scale + Math.sin(t * 2) * 1.2 * scale
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
