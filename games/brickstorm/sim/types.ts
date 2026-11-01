import type { RngState } from '@forge/core/rng'

export type Phase = 'aim' | 'volley' | 'pick' | 'grow' | 'over'

/** Helpers the player can spend mid-run, while aiming. */
export type ActiveHelper =
  | 'pushBack'
  | 'rowBomb'
  | 'freeze'
  | 'firePack'
  | 'surge'
  | 'megaBomb'
  | 'colBomb'
  | 'laserGrid'
  | 'midasTouch'
  | 'ballRain'
  | 'overcharge'
  | 'vacuum'
  | 'pierceShot'

/** Helpers switched on before a run starts. */
export type StartHelper = 'headStart' | 'luckyStart' | 'powerStart' | 'goldStart' | 'eagleStart'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type BrickKind = 'normal' | 'bomb' | 'gold' | 'lightning' | 'mystery' | 'armored' | 'splitter' | 'boss'

/** A boss skill (see sim/boss-skills.ts). The first five were the original "traits". */
export type BossSkillId =
  // Summon
  | 'minions'
  | 'mason'
  | 'guards'
  | 'brood'
  | 'eggs'
  | 'mirror'
  | 'spikes'
  | 'splitters'
  | 'totem'
  | 'swarm'
  // Defense
  | 'shield'
  | 'armored'
  | 'bulwark'
  | 'shell'
  | 'underplate'
  | 'phase'
  | 'barrier'
  | 'reflect'
  | 'secondLife'
  | 'stoneSkin'
  // Movement
  | 'drifter'
  | 'blink'
  | 'lunge'
  | 'retreat'
  | 'weaver'
  | 'hover'
  | 'enrage'
  | 'evasive'
  // Weak points
  | 'core'
  | 'heart'
  | 'runes'
  | 'powerCells'
  | 'rod'
  | 'volatile'
  | 'icebound'
  | 'cracked'
  // Tricks
  | 'glutton'
  | 'frost'
  | 'leech'
  | 'mire'
  | 'shroud'
  | 'taxman'
  | 'gravity'
  | 'repulse'
  // Rage
  | 'frenzy'
  | 'lastStand'
  | 'fortify'
  | 'shatter'
  | 'charge'
  | 'rally'
/** @deprecated Old name for BossSkillId, kept for saved runs and older code. */
export type BossTrait = BossSkillId

/** How hard a boss is: 1 at turn 30, 2 at turn 60, 3 from turn 90. Sets its size and skills. */
export type BossTier = 1 | 2 | 3

/** The boss on the board; its parts are bricks of kind 'boss' sharing this hp. */
export interface Boss {
  hp: number
  maxHp: number
  /** Its skills (named "traits" before skills existed; kept for saved runs). */
  traits: BossSkillId[]
  /** Name noun ('Golem'…); the first skill gives the adjective. */
  noun: string
  /** Turn it arrived. */
  turn: number
  /** Drifter: which way it slides next (1 right, -1 left). */
  dir: 1 | -1
  /** Body shape id (sim/boss-shapes.ts); older saves have none and are a 3×2 block. */
  shape?: string
  /** Face style, for drawing only. */
  face?: number
  tier?: BossTier
  /** Per-skill counters and flags, by name (cooldowns, damage this volley…). */
  mem?: Record<string, number>
}

/** What a brick summoned by a boss skill does (drawn and handled specially). */
export type BossRole =
  'minion' | 'guard' | 'egg' | 'decoy' | 'spike' | 'totem' | 'rune' | 'cell' | 'rod' | 'core' | 'ice'

export interface Brick {
  id: number
  col: number
  row: number
  hp: number
  maxHp: number
  kind: BrickKind
  /** A half from a splitter; never splits again. */
  split: boolean
  /** Summoned by a boss skill. */
  role?: BossRole
  /** Turns left before a timed brick acts (hatches, melts…). */
  timer?: number
}

export type PickupKind = 'ball' | 'coin' | 'fire' | 'laser'

export interface Pickup {
  id: number
  col: number
  row: number
  kind: PickupKind
  /** A laser that has fired this volley: it stays until the volley ends, then goes. */
  used?: boolean
}

export interface Ball {
  x: number
  y: number
  vx: number
  vy: number
  status: 'queued' | 'flying' | 'landed'
  kind: 'normal' | 'fire' | 'bomb'
  /** Radius (Big Balls grows it). */
  r: number
  /** Already split by Twin Shot (or is the twin). */
  split: boolean
  /** Bricks a fire ball is passing through right now, so each is burned once per pass. */
  inside: number[]
  /** Remaining pass-through hits (Piercing boost). */
  pierceLeft: number
  /** Extra damage from wall bounces this volley (Rubber Walls boost). */
  bounceBonus: number
  /** Id of the brick the ball is overlapping, -1 if none; prevents double hits. */
  lastBrick: number
  /** Lasers the ball is passing over right now, so each fires once per pass. */
  lasers?: number[]
}

export type BoostId =
  | 'damage'
  | 'balls'
  | 'coins'
  | 'speed'
  | 'pierce'
  | 'crit'
  | 'bouncy'
  | 'double'
  | 'fireball'
  | 'bombball'
  | 'twin'
  | 'big'
  | 'lightning'
  | 'aftershock'
  | 'magnet'
  | 'midas'
  | 'keeper'
  | 'brain'
  | 'glass'
  | 'secondWind'
  | 'eagle'

export type SimEvent =
  | { type: 'fire' }
  | { type: 'launch' }
  | { type: 'hit'; x: number; y: number; combo: number; crit: boolean }
  | { type: 'kill'; id: number; x: number; y: number; maxHp: number; kind: BrickKind; coins: number }
  | { type: 'pickup'; kind: PickupKind; x: number; y: number }
  | { type: 'wall' }
  | { type: 'land' }
  | { type: 'fever' }
  | { type: 'allClear'; coins: number }
  | { type: 'closeOne'; coins: number }
  | { type: 'danger' }
  | { type: 'levelUp' }
  | { type: 'turn'; turn: number }
  | { type: 'boss'; noun: string; traits: BossTrait[] }
  | { type: 'bossDown'; x: number; y: number; coins: number }
  /** A boss skill went off (or warns it will), at the boss. */
  | { type: 'bossSkill'; id: BossSkillId; x: number; y: number }
  /** The boss took damage at (x, y); `life` is the share of hp it has left. */
  | { type: 'bossHit'; x: number; y: number; life: number; skill?: BossSkillId }
  /** A hit on the boss did nothing (a shield, a shell, immunity…). */
  | { type: 'bossBlock'; x: number; y: number }
  /** A ball hit spikes and is gone for this volley. */
  | { type: 'pop'; x: number; y: number }
  /** A new, tougher hp stretch starts this turn. */
  | { type: 'tougher' }
  | { type: 'over' }
  | { type: 'revive' }
  | { type: 'secondWind' }
  | { type: 'jackpot' }
  | { type: 'grow'; axis: 'col' | 'row' }
  | { type: 'helper'; id: ActiveHelper }
  | { type: 'milestone'; turn: number; coins: number }
  | { type: 'laser'; y: number }
  | { type: 'mystery'; x: number; y: number; reward: 'balls' | 'pick' | 'coins' | 'fire' }
  | { type: 'explode'; x: number; y: number; depth: number }
  | { type: 'zap'; x1: number; y1: number; x2: number; y2: number; depth: number }

export interface RunState {
  rng: RngState
  /** Board size; grows every GROW_EVERY turns by the player's choice. */
  cols: number
  rows: number
  seed: number
  turn: number
  phase: Phase
  launchX: number
  /** Set by the first ball to land this volley. */
  nextLaunchX: number | null
  ballCount: number
  /** Balls picked up this volley; added when it ends. */
  pendingBalls: number
  bricks: Brick[]
  pickups: Pickup[]
  balls: Ball[]
  volleyTime: number
  fireTimer: number
  sinceHit: number
  combo: number
  bestCombo: number
  fever: boolean
  /** A brick sat one row above the danger row when the volley started. */
  dangerAtStart: boolean
  coins: number
  xp: number
  level: number
  pendingPicks: number
  /** Of the pending picks, how many are free (boss rewards, Lucky Start). Missing in older saves. */
  freePicks?: number
  choices: BoostId[]
  /** A boost the player paid to see again at the next level-up. */
  held?: BoostId | null
  /** Holds bought this run (each costs more). */
  holdsUsed?: number
  rerollsUsed: number
  revivesUsed: number
  secondWindUsed: boolean
  boosts: Partial<Record<BoostId, number>>
  doubleVolleys: number
  /** Next volley's first balls that will be fireballs. */
  fireCharges: number
  /** The board may grow once the current turn starts (every GROW_EVERY turns). */
  growPending: boolean
  /** Freeze helper: skip the next descend. */
  freezeNext: boolean
  /** Ball Surge helper: +50% balls next volley. */
  surgeNext: boolean
  /** Ball Rain helper: extra balls next volley. (Optional: absent in older saved runs.) */
  rainNext?: number
  /** Overcharge helper: ×2 damage next volley; `overcharged` while that volley flies. */
  overchargeNext?: boolean
  overcharged?: boolean
  /** Pierce Shot helper: every ball pierces 2 extra bricks next volley. */
  pierceNext?: boolean
  /** The boss fight in progress, if any (absent in runs saved before bosses). */
  boss?: Boss | null
  /** Bosses beaten this run; each adds a boost slot. Missing in older saves. */
  bossesBeaten?: number
  nextId: number
  events: SimEvent[]
}
