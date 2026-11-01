// Heroes: the character a run is played with. Each one has its own health and
// a signature trait, usually with a trade-off. Everything a hero changes is
// data here, read by the sim through `heroOf` (and `modsOf`, for ball stats).
import type { BoostId } from './types'

export type HeroId =
  | 'rookie'
  | 'knight'
  | 'berserker'
  | 'ranger'
  | 'pyro'
  | 'bomber'
  | 'tempest'
  | 'baron'
  | 'sage'
  | 'cleric'
  | 'vampire'
  | 'juggler'
  | 'giant'
  | 'flash'
  | 'gambler'
  | 'necro'
  | 'tinker'
  | 'monk'
  | 'sorcerer'
  | 'paladin'
  | 'pirate'
  | 'frost'
  | 'ninja'
  | 'titan'
  | 'dragon'

/** The look a hero's portrait is built from (see hero-art.ts). */
export type HeroHat =
  | 'cap'
  | 'helmet'
  | 'horns'
  | 'hood'
  | 'wizard'
  | 'crown'
  | 'halo'
  | 'tophat'
  | 'bandana'
  | 'mask'
  | 'tricorn'
  | 'spikes'
  | 'goggles'
  | 'none'

export type HeroEmblem =
  | 'ball'
  | 'shield'
  | 'axe'
  | 'bow'
  | 'flame'
  | 'bomb'
  | 'bolt'
  | 'coin'
  | 'book'
  | 'heart'
  | 'fang'
  | 'twin'
  | 'fist'
  | 'wing'
  | 'dice'
  | 'skull'
  | 'gear'
  | 'lotus'
  | 'gem'
  | 'sun'
  | 'anchor'
  | 'snow'
  | 'star'
  | 'rock'
  | 'dragon'

/** A hero's signature sound (see sounds.ts HERO_SOUNDS). */
export type HeroVoice =
  | 'chime'
  | 'clang'
  | 'roar'
  | 'twang'
  | 'whoosh'
  | 'boom'
  | 'zap'
  | 'coins'
  | 'page'
  | 'bless'
  | 'bat'
  | 'hop'
  | 'stomp'
  | 'zip'
  | 'dice'
  | 'ghost'
  | 'gear'
  | 'gong'
  | 'shatter'
  | 'horn'
  | 'arr'
  | 'ice'
  | 'slash'
  | 'quake'
  | 'dragon'

export interface HeroDef {
  id: HeroId
  name: string
  /** Short role under the name. */
  title: string
  /** Shop price in coins (0: owned from the start). */
  price: number
  /** Main colour, for the portrait, HUD and effects. */
  color: string
  skin: string
  hat: HeroHat
  emblem: HeroEmblem
  voice: HeroVoice
  /** Most health. */
  hp: number
  /** Free skill levels for the whole run: they stack with picks and take no slot. */
  innate?: Partial<Record<BoostId, number>>
  /** Multipliers (1 = no change). */
  damage?: number
  coins?: number
  xp?: number
  speed?: number
  /** Added crit chance. */
  crit?: number
  /** Damage taken when bricks crash into the line (×). */
  breach?: number
  /** Healing received (×). */
  heal?: number
  /** Health regained every turn. */
  regen?: number
  /** Balls at the start of a run, added to the usual 1. */
  startBalls?: number
  /** Extra skill slots. */
  slots?: number
  /** Health regained per brick destroyed. */
  lifesteal?: number
  /** Every this many bricks destroyed, +1 ball. */
  soul?: number
  /** Every this many turns, the bricks don't drop. */
  frostEvery?: number
  /** Combo where fever starts (default 100). */
  feverAt?: number
  /** Seconds added before the combo resets. */
  comboGap?: number
  /** Damage to bosses (×). */
  bossDamage?: number
  /** Share of max health regained when a boss falls (default BOSS_HEAL). */
  bossHeal?: number
  /** Up to this much extra damage as health runs out (0.6: +60% near 0 health). */
  rage?: number
  /** Chance of epic skill cards (×). */
  epicLuck?: number
}

const HEROES_LIST: HeroDef[] = [
  {
    id: 'rookie',
    name: 'Rookie',
    title: 'Brick Cadet',
    price: 0,
    color: '#5ab8ff',
    skin: '#ffd7b0',
    hat: 'cap',
    emblem: 'ball',
    voice: 'chime',
    hp: 100,
  },
  {
    id: 'knight',
    name: 'Sir Bastion',
    title: 'Shield Knight',
    price: 600,
    color: '#9fb4c8',
    skin: '#f1c7a1',
    hat: 'helmet',
    emblem: 'shield',
    voice: 'clang',
    hp: 150,
    breach: 0.75,
    speed: 0.9,
  },
  {
    id: 'flash',
    name: 'Zip',
    title: 'Speedster',
    price: 650,
    color: '#ffd43b',
    skin: '#ffd7b0',
    hat: 'goggles',
    emblem: 'wing',
    voice: 'zip',
    hp: 85,
    speed: 1.35,
    crit: 0.05,
  },
  {
    id: 'ranger',
    name: 'Wren',
    title: 'Ranger',
    price: 700,
    color: '#51cf66',
    skin: '#e8b98f',
    hat: 'hood',
    emblem: 'bow',
    voice: 'twang',
    hp: 85,
    innate: { eagle: 2 },
    crit: 0.08,
  },
  {
    id: 'baron',
    name: 'Goldie',
    title: 'Gold Baron',
    price: 800,
    color: '#fcc419',
    skin: '#ffd7b0',
    hat: 'tophat',
    emblem: 'coin',
    voice: 'coins',
    hp: 100,
    coins: 1.6,
    innate: { midas: 1 },
    damage: 0.85,
  },
  {
    id: 'berserker',
    name: 'Grakka',
    title: 'Berserker',
    price: 900,
    color: '#ff6b6b',
    skin: '#c99273',
    hat: 'horns',
    emblem: 'axe',
    voice: 'roar',
    hp: 80,
    damage: 1.1,
    rage: 0.6,
  },
  {
    id: 'sage',
    name: 'Old Quill',
    title: 'Sage',
    price: 900,
    color: '#b197fc',
    skin: '#f1c7a1',
    hat: 'wizard',
    emblem: 'book',
    voice: 'page',
    hp: 85,
    xp: 1.35,
  },
  {
    id: 'giant',
    name: 'Bram',
    title: 'Gentle Giant',
    price: 950,
    color: '#a9773c',
    skin: '#e0a77f',
    hat: 'none',
    emblem: 'fist',
    voice: 'stomp',
    hp: 120,
    innate: { big: 2 },
    speed: 0.85,
  },
  {
    id: 'pyro',
    name: 'Ember',
    title: 'Pyromancer',
    price: 1000,
    color: '#ff922b',
    skin: '#ffd7b0',
    hat: 'spikes',
    emblem: 'flame',
    voice: 'whoosh',
    hp: 95,
    innate: { fireball: 1 },
    damage: 0.9,
  },
  {
    id: 'juggler',
    name: 'Pip',
    title: 'Juggler',
    price: 1000,
    color: '#f783ac',
    skin: '#ffd7b0',
    hat: 'bandana',
    emblem: 'twin',
    voice: 'hop',
    hp: 100,
    innate: { twin: 1 },
    coins: 0.85,
  },
  {
    id: 'bomber',
    name: 'Boomer',
    title: 'Bombardier',
    price: 1100,
    color: '#495057',
    skin: '#e8b98f',
    hat: 'goggles',
    emblem: 'bomb',
    voice: 'boom',
    hp: 80,
    innate: { aftershock: 1 },
  },
  {
    id: 'pirate',
    name: 'Captain Rook',
    title: 'Sky Pirate',
    price: 1100,
    color: '#c92a2a',
    skin: '#e0a77f',
    hat: 'tricorn',
    emblem: 'anchor',
    voice: 'arr',
    hp: 100,
    startBalls: 3,
    coins: 1.25,
    xp: 0.8,
  },
  {
    id: 'tempest',
    name: 'Volta',
    title: 'Storm Caller',
    price: 1200,
    color: '#4dabf7',
    skin: '#f1c7a1',
    hat: 'wizard',
    emblem: 'bolt',
    voice: 'zap',
    hp: 90,
    innate: { lightning: 2 },
    damage: 0.95,
  },
  {
    id: 'monk',
    name: 'Master Sun',
    title: 'Combo Monk',
    price: 1200,
    color: '#ff8787',
    skin: '#e8b98f',
    hat: 'none',
    emblem: 'lotus',
    voice: 'gong',
    hp: 90,
    feverAt: 50,
    comboGap: 1.5,
  },
  {
    id: 'cleric',
    name: 'Sister Lumen',
    title: 'Cleric',
    price: 1300,
    color: '#fff3bf',
    skin: '#ffd7b0',
    hat: 'halo',
    emblem: 'heart',
    voice: 'bless',
    hp: 100,
    regen: 2,
    heal: 1.5,
    damage: 0.85,
  },
  {
    id: 'ninja',
    name: 'Kage',
    title: 'Shadow Ninja',
    price: 1300,
    color: '#343a40',
    skin: '#e8b98f',
    hat: 'mask',
    emblem: 'star',
    voice: 'slash',
    hp: 75,
    innate: { pierce: 1 },
    damage: 0.9,
  },
  {
    id: 'gambler',
    name: 'Lucky Lou',
    title: 'Gambler',
    price: 1400,
    color: '#20c997',
    skin: '#ffd7b0',
    hat: 'tophat',
    emblem: 'dice',
    voice: 'dice',
    hp: 75,
    crit: 0.1,
    epicLuck: 2,
  },
  {
    id: 'vampire',
    name: 'Count Vex',
    title: 'Vampire',
    price: 1500,
    color: '#862e9c',
    skin: '#e9e4f0',
    hat: 'none',
    emblem: 'fang',
    voice: 'bat',
    hp: 90,
    lifesteal: 0.3,
    heal: 0.5,
  },
  {
    id: 'paladin',
    name: 'Aurelia',
    title: 'Paladin',
    price: 1500,
    color: '#ffe066',
    skin: '#f1c7a1',
    hat: 'crown',
    emblem: 'sun',
    voice: 'horn',
    hp: 110,
    bossDamage: 1.5,
    bossHeal: 0.6,
    coins: 0.85,
  },
  {
    id: 'necro',
    name: 'Morda',
    title: 'Necromancer',
    price: 1600,
    color: '#5c940d',
    skin: '#d8e2c8',
    hat: 'hood',
    emblem: 'skull',
    voice: 'ghost',
    hp: 85,
    soul: 30,
    coins: 0.75,
  },
  {
    id: 'titan',
    name: 'Granite',
    title: 'Stone Titan',
    price: 1600,
    color: '#868e96',
    skin: '#adb5bd',
    hat: 'spikes',
    emblem: 'rock',
    voice: 'quake',
    hp: 220,
    breach: 0.85,
    damage: 0.85,
    speed: 0.9,
  },
  {
    id: 'tinker',
    name: 'Gizmo',
    title: 'Tinker',
    price: 1700,
    color: '#e8590c',
    skin: '#ffd7b0',
    hat: 'goggles',
    emblem: 'gear',
    voice: 'gear',
    hp: 90,
    slots: 1,
  },
  {
    id: 'frost',
    name: 'Isolde',
    title: 'Frost Witch',
    price: 1800,
    color: '#99e9f2',
    skin: '#e7f5ff',
    hat: 'crown',
    emblem: 'snow',
    voice: 'ice',
    hp: 90,
    frostEvery: 5,
    damage: 0.9,
  },
  {
    id: 'sorcerer',
    name: 'Nyx',
    title: 'Glass Sorcerer',
    price: 2000,
    color: '#cc5de8',
    skin: '#f3d9fa',
    hat: 'wizard',
    emblem: 'gem',
    voice: 'shatter',
    hp: 60,
    damage: 1.6,
    breach: 1.4,
  },
  {
    id: 'dragon',
    name: 'Drakon',
    title: 'Dragon Rider',
    price: 3500,
    color: '#e03131',
    skin: '#e0a77f',
    hat: 'horns',
    emblem: 'dragon',
    voice: 'dragon',
    hp: 85,
    innate: { fireball: 1 },
    breach: 1.4,
    damage: 0.9,
    bossDamage: 1.2,
  },
]

export const HEROES: Record<HeroId, HeroDef> = Object.fromEntries(
  HEROES_LIST.map((h) => [h.id, h]),
) as Record<HeroId, HeroDef>
/** Every hero, cheapest first (the shop and picker order). */
export const HERO_IDS: HeroId[] = HEROES_LIST.map((h) => h.id)
export const DEFAULT_HERO: HeroId = 'rookie'

export const isHeroId = (v: unknown): v is HeroId => typeof v === 'string' && v in HEROES

/** The hero a run is played with; runs from before heroes are the Rookie. */
export function heroOf(s: { hero?: HeroId }): HeroDef {
  return HEROES[s.hero ?? DEFAULT_HERO] ?? HEROES[DEFAULT_HERO]
}

/** One line of a hero's card: what it changes, and whether that helps (true) or hurts. */
export interface HeroPerk {
  /** English text with {placeholders}; the UI translates it. */
  text: string
  vars?: Record<string, string | number>
  good: boolean
}

const pct = (m: number) => `${Math.round(Math.abs(m - 1) * 100)}%`

/** What a hero changes, as lines for its card, made from its data so the card can't drift from the rules. */
export function heroPerks(def: HeroDef): HeroPerk[] {
  const out: HeroPerk[] = []
  const mult = (v: number | undefined, up: string, down: string, higherIsGood = true) => {
    if (v === undefined || v === 1) return
    out.push({ text: v > 1 ? up : down, vars: { p: pct(v) }, good: v > 1 === higherIsGood })
  }
  for (const [id, n] of Object.entries(def.innate ?? {}) as Array<[BoostId, number]>)
    out.push({ text: 'Starts with skill {skill} Lv {n}', vars: { skill: id, n }, good: true })
  if (def.startBalls) out.push({ text: '+{n} balls at the start', vars: { n: def.startBalls }, good: true })
  if (def.regen) out.push({ text: 'Heals {n} health every turn', vars: { n: def.regen }, good: true })
  if (def.lifesteal)
    out.push({
      text: 'Heals 1 health every {n} bricks broken',
      vars: { n: Math.round(1 / def.lifesteal) },
      good: true,
    })
  if (def.soul) out.push({ text: '+1 ball every {n} bricks broken', vars: { n: def.soul }, good: true })
  if (def.frostEvery)
    out.push({ text: "Every {n}th turn the bricks don't drop", vars: { n: def.frostEvery }, good: true })
  if (def.feverAt) out.push({ text: 'Fever starts at combo {n}', vars: { n: def.feverAt }, good: true })
  if (def.comboGap) out.push({ text: 'Combo lasts +{s} s', vars: { s: def.comboGap }, good: true })
  if (def.slots) out.push({ text: '+{n} skill slot', vars: { n: def.slots }, good: true })
  if (def.crit)
    out.push({ text: '+{p} crit chance', vars: { p: `${Math.round(def.crit * 100)}%` }, good: true })
  if (def.rage)
    out.push({ text: 'Up to +{p} damage as health runs low', vars: { p: pct(1 + def.rage) }, good: true })
  if (def.bossHeal)
    out.push({
      text: 'Heals {p} when a boss falls',
      vars: { p: `${Math.round(def.bossHeal * 100)}%` },
      good: true,
    })
  mult(def.bossDamage, '+{p} damage to bosses', '−{p} damage to bosses')
  if (def.epicLuck) out.push({ text: 'Epic skills ×{m} as likely', vars: { m: def.epicLuck }, good: true })
  mult(def.damage, '+{p} damage', '−{p} damage')
  mult(def.coins, '+{p} coins', '−{p} coins')
  mult(def.xp, '+{p} XP', '−{p} XP')
  mult(def.speed, '+{p} ball speed', '−{p} ball speed')
  mult(def.breach, 'Crashing bricks hurt +{p}', 'Crashing bricks hurt −{p}', false)
  mult(def.heal, '+{p} healing', '−{p} healing')
  // Health against the Rookie's 100.
  if (def.hp !== 100)
    out.push({
      text: def.hp > 100 ? '{n} health (tough)' : '{n} health (fragile)',
      vars: { n: def.hp },
      good: def.hp > 100,
    })
  // Good lines first, then the trade-offs.
  return [...out.filter((p) => p.good), ...out.filter((p) => !p.good)]
}
