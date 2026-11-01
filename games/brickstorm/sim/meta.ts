// Run-level actions outside the normal turn loop: revives and run-start helpers.
import { rollChoices } from './boosts'
import { MAX_COLS, MAX_ROWS } from './config'
import { dims } from './dims'
import { liftBoss } from './boss'
import { randomInt } from '@forge/core/rng'
import { damageBrick, killBrick } from './damage'
import { applyPickup, laserRow, openPickOrAim } from './run'
import type { ActiveHelper, RunState, StartHelper } from './types'

/** Coins for the next revive this run: 100, 200, 300… */
export function reviveCost(s: RunState): number {
  return 100 * (s.revivesUsed + 1)
}

/** After game over: clears the 3 rows nearest the danger line and plays on. The caller has paid. */
export function revive(s: RunState): void {
  if (s.phase !== 'over') return
  const { dangerRow } = dims(s)
  liftBoss(s)
  s.bricks = s.bricks.filter((b) => b.row < dangerRow - 2)
  s.pickups = s.pickups.filter((p) => p.row < dangerRow - 2)
  s.revivesUsed++
  s.events.push({ type: 'revive' })
  // Same turn: aim again (the next volley brings the next row).
  openPickOrAim(s)
}

/** Applies helpers the player switched on for this run. */
export function applyHelpers(s: RunState, use: Partial<Record<StartHelper, boolean>>): void {
  if (use.headStart) s.ballCount += 5
  if (use.powerStart) s.boosts.damage = (s.boosts.damage ?? 0) + 2
  if (use.goldStart) s.boosts.coins = (s.boosts.coins ?? 0) + 2
  if (use.eagleStart) s.boosts.eagle = Math.max(1, s.boosts.eagle ?? 0)
  if (use.luckyStart) {
    s.pendingPicks++
    s.phase = 'pick'
    s.choices = rollChoices(s)
  }
}

/**
 * Spends a mid-run helper. Only while aiming; returns false (and does nothing)
 * otherwise, so the caller only takes it from the inventory on true.
 */
export function useHelper(s: RunState, id: ActiveHelper): boolean {
  if (s.phase !== 'aim') return false
  s.combo = 0 // helper kills pay the base coin rate, not the last volley's combo
  switch (id) {
    case 'pushBack': {
      // The boss only moves up if it has room; it never loses a piece.
      const bossStuck = s.bricks.some((b) => b.kind === 'boss' && b.row === 0)
      const moves = (b: { kind: string }) => b.kind !== 'boss' || !bossStuck
      s.bricks = s.bricks.filter((b) => b.row > 0 || !moves(b))
      s.pickups = s.pickups.filter((p) => p.row > 0)
      for (const b of s.bricks) if (moves(b)) b.row--
      for (const p of s.pickups) p.row--
      break
    }
    case 'rowBomb': {
      const lowest = Math.max(-1, ...s.bricks.map((b) => b.row))
      for (const b of s.bricks.filter((b) => b.row === lowest)) killBrick(s, b, 0)
      break
    }
    case 'freeze':
      s.freezeNext = true
      break
    case 'firePack':
      s.fireCharges += 5
      break
    case 'surge':
      s.surgeNext = true
      break
    case 'megaBomb': {
      for (const b of s.bricks.filter((b) => b.kind !== 'boss'))
        damageBrick(s, b, Math.max(1, b.hp / 2), 'blast')
      const part = s.bricks.find((b) => b.kind === 'boss')
      if (part && s.boss) damageBrick(s, part, s.boss.maxHp * 0.15, 'blast')
      break
    }
    case 'colBomb': {
      const per = new Map<number, number>()
      for (const b of s.bricks) per.set(b.col, (per.get(b.col) ?? 0) + 1)
      const col = [...per.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]
      for (const b of s.bricks.filter((b) => b.col === col)) killBrick(s, b, 0)
      break
    }
    case 'laserGrid': {
      const rows = [...new Set(s.bricks.map((b) => b.row))].sort((a, b) => b - a).slice(0, 3)
      for (const row of rows) laserRow(s, row)
      break
    }
    case 'midasTouch': {
      const plain = s.bricks.filter((b) => b.kind === 'normal')
      for (let i = 0; i < 4 && plain.length; i++)
        plain.splice(randomInt(s.rng, plain.length), 1)[0].kind = 'gold'
      break
    }
    case 'ballRain':
      s.rainNext = (s.rainNext ?? 0) + 10
      break
    case 'overcharge':
      s.overchargeNext = true
      break
    case 'vacuum':
      for (const p of s.pickups.splice(0)) applyPickup(s, p)
      break
    case 'pierceShot':
      s.pierceNext = true
      break
  }
  s.events.push({ type: 'helper', id })
  openPickOrAim(s) // a level-up from Row Bomb opens its pick now
  return true
}

/** Every GROW_EVERY turns: the player adds a column or a row (each axis is capped). */
export function growBoard(s: RunState, axis: 'col' | 'row'): void {
  if (s.phase !== 'grow') return
  if (axis === 'col' && s.cols >= MAX_COLS) return
  if (axis === 'row' && s.rows >= MAX_ROWS) return
  if (axis === 'col') s.cols++
  else s.rows++
  s.growPending = false
  s.events.push({ type: 'grow', axis })
  openPickOrAim(s)
}
