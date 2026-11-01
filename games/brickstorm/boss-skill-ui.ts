// How each boss skill reads and looks: the adjective it gives the boss's name,
// its line on the boss card, and the colour of its effects.
import { t } from './i18n'
import type { Boss, BossSkillId } from './sim/types'

export interface SkillInfo {
  /** "Crystal" in "Crystal Golem". */
  adj: string
  /** "Shield: heals a little every turn." */
  text: string
  color: string
}

export const SKILL_INFO: Record<BossSkillId, SkillInfo> = {
  shield: { adj: t('Crystal'), text: t('Shield: heals a little every turn.'), color: '#7fe7ff' },
  minions: { adj: t('Hive'), text: t('Minions: summons 2 small bricks every turn.'), color: '#4be3a0' },
  drifter: { adj: t('Wandering'), text: t('Drifter: slides one column every turn.'), color: '#b48cff' },
  armored: { adj: t('Iron'), text: t('Armored: plain balls deal half damage.'), color: '#c9ccff' },
  enrage: { adj: t('Raging'), text: t('Enrage: below half health it falls twice as fast.'), color: '#ff6b6b' },
}

/** Info for a skill id, with a plain fallback for ids this build doesn't know (newer saves). */
export function skillInfo(id: string): SkillInfo {
  return SKILL_INFO[id as BossSkillId] ?? { adj: '', text: id, color: '#c9ccff' }
}

const NOUN: Record<string, string> = {
  Golem: t('Golem'),
  Titan: t('Titan'),
  Colossus: t('Colossus'),
  Warden: t('Warden'),
  Behemoth: t('Behemoth'),
  Hydra: t('Hydra'),
}

/** "Crystal Golem": its first skill's adjective and its kind. */
export function bossName(boss: Pick<Boss, 'traits' | 'noun'>): string {
  const adj = boss.traits[0] ? skillInfo(boss.traits[0]).adj : ''
  const noun = NOUN[boss.noun] ?? boss.noun
  return adj ? t('{adj} {noun}', { adj, noun }) : noun
}
