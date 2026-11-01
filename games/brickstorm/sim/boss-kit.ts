// Small board helpers boss skills share: where bricks can go, summoning them,
// moving the boss, healing it.
import { randomInt } from '@forge/core/rng'
import { dims } from './dims'
import { hpCap, hpScale } from './rows'
import type { Boss, BossRole, Brick, BrickKind, RunState } from './types'

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
export function freeCells(s: RunState, where: (col: number, row: number) => boolean = () => true): Array<[number, number]> {
  const taken = new Set(s.bricks.map((b) => key(b.col, b.row)))
  const out: Array<[number, number]> = []
  for (let row = 0; row < dims(s).dangerRow; row++) {
    for (let col = 0; col < s.cols; col++) if (!taken.has(key(col, row)) && where(col, row)) out.push([col, row])
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

/** Removes non-boss bricks sitting in the boss's cells (it moved onto them). */
export function crushUnderBoss(s: RunState): void {
  const cells = new Set(bossParts(s).map((p) => key(p.col, p.row)))
  s.bricks = s.bricks.filter((b) => b.kind === 'boss' || !cells.has(key(b.col, b.row)))
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
