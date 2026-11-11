import { describe, expect, it } from 'vitest'
import { spawnBoss } from './boss'
import { SKILL_IDS } from './boss-skills'
import { canRecall, drainEvents, endBonus, fire, recall, step } from './run'
import { empty } from './testing'
import type { BossSkillId, RunState } from './types'

/** A turn-30 run with a boss that has exactly `skills`, at the top, waiting to aim. */
function fight(skills: BossSkillId[], shape = 'block', seed = 1): RunState {
  const s = empty(seed)
  s.turn = 30
  s.ballCount = 20
  spawnBoss(s, skills, shape)
  s.phase = 'aim'
  drainEvents(s)
  return s
}

describe('boss skills: all', () => {
  it('a whole fight with every skill runs without errors', () => {
    for (let i = 0; i < SKILL_IDS.length; i += 4) {
      const s = fight(SKILL_IDS.slice(i, i + 4), 'giant', i + 1)
      const phase = (): string => s.phase
      for (let t = 0; t < 12 && phase() === 'aim'; t++) {
        fire(s, Math.PI / 2 - 0.3 + (t % 3) * 0.3)
        // Like a player, recall a volley that drags on (a ball can bounce over the boss for ever).
        for (let k = 0; k < 120 * 60 && phase() === 'volley'; k++) {
          step(s)
          if (s.volleyTime > 15 && canRecall(s)) recall(s)
          // The bonus round's socket was hit: the player reads the news and carries on.
          if (s.bonus?.won) endBonus(s)
        }
      }
      expect(['aim', 'over', 'pick', 'grow']).toContain(s.phase)
    }
  })
})
