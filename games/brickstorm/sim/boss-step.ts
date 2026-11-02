// A boss without a movement skill of its own still fights smart: every other
// turn it picks a side (away from where your balls hurt it most, or else
// toward the open side of the board), warns you, and steps there next turn.
import { bossBounds, bossParts, mem, moveBoss, setMem } from './boss-kit'
import type { Boss, BossSkillId, RunState } from './types'

/** It plans a step every this many turns of its life (and takes it the turn after). */
export const STEP_EVERY = 2
/** One side must have taken this many times the other's damage to count as "hit there". */
const DODGE_BIAS = 1.2
/** Skills that already move the boss sideways: those bosses don't also step. */
const MOVERS: readonly BossSkillId[] = ['drifter', 'weaver', 'blink', 'evasive']

/** A ball hit the boss's part in `col`: remember which half took the damage. */
export function tallyHit(s: RunState, boss: Boss, col: number, dealt: number): void {
  if (dealt <= 0 || !bossParts(s).length) return
  const { left, right } = bossBounds(s)
  const mid = (left + right) / 2
  if (col < mid) setMem(boss, 'hitL', mem(boss, 'hitL') + dealt)
  else if (col > mid) setMem(boss, 'hitR', mem(boss, 'hitR') + dealt)
}

/** True if the whole body can move one column `dir` without leaving the board or crushing its own summons. */
function canStep(s: RunState, dir: 1 | -1): boolean {
  const parts = bossParts(s)
  const { left, right } = bossBounds(s)
  if (left + dir < 0 || right + dir >= s.cols) return false
  const cells = new Set(parts.map((p) => `${p.col + dir},${p.row}`))
  return !s.bricks.some((b) => b.kind !== 'boss' && b.role && cells.has(`${b.col},${b.row}`))
}

/** Away from the half that took more ball damage; else toward the side with fewer of your bricks; else stay. */
function chooseStep(s: RunState, boss: Boss): 1 | -1 | 0 {
  const l = mem(boss, 'hitL')
  const r = mem(boss, 'hitR')
  let dir: 1 | -1 | 0 = 0
  if (l > r * DODGE_BIAS) dir = 1
  else if (r > l * DODGE_BIAS) dir = -1
  else {
    const { left, right } = bossBounds(s)
    const plain = s.bricks.filter((b) => b.kind !== 'boss')
    const onLeft = plain.filter((b) => b.col < left).length
    const onRight = plain.filter((b) => b.col > right).length
    if (onLeft !== onRight) dir = onLeft < onRight ? -1 : 1
  }
  if (dir === 0) return 0
  if (canStep(s, dir)) return dir
  return 0
}

/** The boss's step, once per boss turn: take the step it warned about, or plan the next one. */
export function bossStep(s: RunState, boss: Boss): void {
  if (boss.traits.some((t) => MOVERS.includes(t)) || !bossParts(s).length) return
  const planned = mem(boss, 'step')
  if (planned === 1 || planned === -1) {
    setMem(boss, 'step', 0)
    // The board may have changed since the warning (a ward summoned): check again.
    if (!canStep(s, planned)) return
    moveBoss(s, planned, 0)
    s.events.push({ type: 'bossStep', dir: planned })
    return
  }
  const age = s.turn - boss.turn
  if (age <= 0 || age % STEP_EVERY !== 0) return
  const dir = chooseStep(s, boss)
  setMem(boss, 'hitL', 0)
  setMem(boss, 'hitR', 0)
  if (!dir) return
  setMem(boss, 'step', dir)
  s.events.push({ type: 'bossWarn', id: 'step', dir })
}
