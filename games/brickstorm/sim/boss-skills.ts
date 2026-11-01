// What each boss skill does, as hooks the fight calls at set moments. A skill
// only fills in the hooks it needs; boss.ts runs them in the boss's skill order.
import { bossBounds, freeCells, healBoss, minionHp, moveBoss, pickCells, summon } from './boss-kit'
import type { DamageSource } from './damage'
import type { Boss, BossSkillId, BossTier, RunState } from './types'

/** Which side of the boss a ball struck. */
export type Face = 'top' | 'bottom' | 'left' | 'right'

export interface BossHit {
  source: DamageSource
  /** Set for ball hits. */
  face?: Face
  /** Column of the part that was hit, if known. */
  col?: number
  crit?: boolean
}

export interface BossSkill {
  /** The earliest boss tier that can roll it. */
  tier: BossTier
  /** When the boss arrives. */
  spawn?(s: RunState, boss: Boss): void
  /** At the start of every turn after it arrived. */
  turn?(s: RunState, boss: Boss): void
  /** Changes damage on its way in; returns the new amount. */
  damage?(s: RunState, boss: Boss, amount: number, hit: BossHit): number
}

const SHIELD_HEAL = 0.08

export const BOSS_SKILLS: Record<BossSkillId, BossSkill> = {
  shield: {
    tier: 1,
    turn: (s, boss) => healBoss(s, boss, boss.maxHp * SHIELD_HEAL),
  },
  minions: {
    tier: 1,
    turn: (s) => summon(s, pickCells(s, freeCells(s, (_, r) => r === 0), 2), minionHp(s)),
  },
  drifter: {
    tier: 1,
    turn: (s, boss) => {
      const { left, right } = bossBounds(s)
      if ((boss.dir > 0 && right + 1 >= s.cols) || (boss.dir < 0 && left - 1 < 0)) boss.dir = boss.dir === 1 ? -1 : 1
      moveBoss(s, boss.dir, 0)
    },
  },
  armored: {
    tier: 1,
    damage: (_s, _boss, amount, hit) => (hit.source === 'ball' ? amount / 2 : amount),
  },
  enrage: {
    tier: 1,
    turn: (s, boss) => {
      if (boss.hp < boss.maxHp / 2) moveBoss(s, 0, 1)
    },
  },
}

export const SKILL_IDS = Object.keys(BOSS_SKILLS) as BossSkillId[]
