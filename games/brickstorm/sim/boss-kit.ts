// Small board helpers boss skills share: where bricks can go, summoning them,
// moving the boss, healing it.
import { randomInt } from '@forge/core/rng'
import { dims } from './dims'
import { hpCap, hpScale } from './rows'
import { cellCenter } from './rows'
import type { Boss, BossRole, BossSkillId, Brick, BrickKind, BrickShape, Face, RunState } from './types'

export function bossParts(s: RunState): Brick[] {
  return s.bricks.filter((b) => b.kind === 'boss')
}

/** The boss's bounds in cells. */
export function bossBounds(s: RunState): { left: number; right: number; top: number; bottom: number } {
  const parts = bossParts(s)
  return {
    left: Math.min(...parts.map((b) => b.col)),
    right: Math.max(...parts.map((b) => b.col)),
    top: Math.min(...parts.map((b) => b.row)),
    bottom: Math.max(...parts.map((b) => b.row)),
  }
}

const key = (col: number, row: number) => `${col},${row}`

/** Empty cells above the danger line, optionally only those `where` allows, in board order. */
export function freeCells(
  s: RunState,
  where: (col: number, row: number) => boolean = () => true,
): Array<[number, number]> {
  const taken = new Set(s.bricks.map((b) => key(b.col, b.row)))
  const out: Array<[number, number]> = []
  for (let row = 0; row < dims(s).dangerRow; row++) {
    for (let col = 0; col < s.cols; col++)
      if (!taken.has(key(col, row)) && where(col, row)) out.push([col, row])
  }
  return out
}

/** Up to `n` cells picked at random (from the run's rng) out of `cells`. */
export function pickCells(s: RunState, cells: Array<[number, number]>, n: number): Array<[number, number]> {
  const pool = [...cells]
  const out: Array<[number, number]> = []
  while (out.length < n && pool.length) out.push(pool.splice(randomInt(s.rng, pool.length), 1)[0])
  return out
}

/** Hp of a small summoned brick: a bit under a normal brick, never more than the run can deal. */
export function minionHp(s: RunState, scale = 0.6): number {
  return Math.max(1, Math.min(Math.round(hpScale(s.turn) * scale), hpCap(s)))
}

/** Puts a brick in each cell. */
export function summon(
  s: RunState,
  cells: Array<[number, number]>,
  hp: number,
  opts: { role?: BossRole; kind?: BrickKind; timer?: number } = {},
): Brick[] {
  return cells.map(([col, row]) => {
    const b: Brick = { id: s.nextId++, col, row, hp, maxHp: hp, kind: opts.kind ?? 'normal', split: false }
    if (opts.role) b.role = opts.role
    if (opts.timer !== undefined) b.timer = opts.timer
    s.bricks.push(b)
    return b
  })
}

/** The sides each triangle's slope faces (named by its right-angle corner, so the slope faces away from it). */
export const SLOPE_FACES: Record<'tri-tl' | 'tri-tr' | 'tri-bl' | 'tri-br', Face[]> = {
  'tri-tl': ['bottom', 'right'],
  'tri-tr': ['bottom', 'left'],
  'tri-bl': ['top', 'right'],
  'tri-br': ['top', 'left'],
}
const STEP: Record<Face, [number, number]> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }

/**
 * A ward at (col, row) beside a sloped boss part, on the side its slope
 * faces, takes the same angle: the armour carries the slope on. Else square.
 */
export function wardShape(s: RunState, col: number, row: number): BrickShape | undefined {
  for (const p of bossParts(s)) {
    if (!p.shape || p.shape === 'orb') continue
    for (const f of SLOPE_FACES[p.shape]) {
      const [dc, dr] = STEP[f]
      if (p.col + dc === col && p.row + dr === row) return p.shape
    }
  }
  return undefined
}

/** Coins a brick the boss smashes pays (gold pays triple). No XP: the boss did the work. */
const CRUSH_COINS = 1

/**
 * Smashes non-boss bricks in the boss's cells, or within `ring` cells of them
 * (an arrival clears room around itself). They pay a coin each and the
 * effects get one `bossCrush` with where they were.
 */
export function crushUnderBoss(s: RunState, ring = 0): void {
  const cells = new Set<string>()
  for (const p of bossParts(s))
    for (let dc = -ring; dc <= ring; dc++)
      for (let dr = -ring; dr <= ring; dr++) cells.add(key(p.col + dc, p.row + dr))
  const crushed = s.bricks.filter((b) => b.kind !== 'boss' && cells.has(key(b.col, b.row)))
  if (!crushed.length) return
  s.bricks = s.bricks.filter((b) => !crushed.includes(b))
  const coins = crushed.reduce((sum, b) => sum + CRUSH_COINS * (b.kind === 'gold' ? 3 : 1), 0)
  s.coins += coins
  s.events.push({ type: 'bossCrush', at: crushed.map((b) => cellCenter(b.col, b.row)), coins })
}

/** Moves the whole boss, crushing what is in the way. */
export function moveBoss(s: RunState, dcol: number, drow: number): void {
  for (const p of bossParts(s)) {
    p.col += dcol
    p.row += drow
  }
  crushUnderBoss(s)
}

export function healBoss(s: RunState, boss: Boss, amount: number): void {
  boss.hp = Math.min(boss.maxHp, boss.hp + amount)
  for (const p of bossParts(s)) p.hp = boss.hp
}

/** A per-skill counter on the boss (0 when unset). */
export function mem(boss: Boss, name: string): number {
  return boss.mem?.[name] ?? 0
}

export function setMem(boss: Boss, name: string, value: number): void {
  boss.mem = { ...boss.mem, [name]: value }
}

/** The middle of the boss's body, in px. */
export function bossCenter(s: RunState): { x: number; y: number } {
  const { left, right, top, bottom } = bossBounds(s)
  const a = cellCenter(left, top)
  const b = cellCenter(right, bottom)
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Tells the player a skill went off (the boss shouts its name). */
export function announce(s: RunState, id: BossSkillId): void {
  if (!bossParts(s).length) return
  s.events.push({ type: 'bossSkill', id, ...bossCenter(s) })
}

/** Turns since the boss arrived (0 on its first turn). */
export function age(s: Pick<RunState, 'turn'>, boss: Boss): number {
  return s.turn - boss.turn
}

export function roleBricks(s: RunState, role: BossRole): Brick[] {
  return s.bricks.filter((b) => b.role === role)
}
