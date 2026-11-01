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
  minions: { adj: t('Hive'), text: t('Minions: summons 2 small bricks every turn.'), color: '#4be3a0' },
  mason: {
    adj: t('Mason'),
    text: t('Mason: builds a 3-brick wall below itself every 3 turns.'),
    color: '#c9a27a',
  },
  guards: {
    adj: t('Guarded'),
    text: t('Guardians: 2 guards at its sides; it takes half damage while they stand.'),
    color: '#8fa8ff',
  },
  brood: {
    adj: t('Brooding'),
    text: t('Brood: every 4 turns fills half the top row with bricks.'),
    color: '#6fdc8c',
  },
  eggs: {
    adj: t('Nesting'),
    text: t('Egg Layer: lays an egg that hatches into 3 bricks after 2 turns unless broken.'),
    color: '#f5e6b8',
  },
  mirror: {
    adj: t('Mirrored'),
    text: t('Mirror Image: 2 decoys block a quarter of hits; breaking one hurts it.'),
    color: '#d7c8ff',
  },
  spikes: {
    adj: t('Spiked'),
    text: t('Spikes: spike bricks pop any ball that hits them for this volley.'),
    color: '#ff4d6d',
  },
  splitters: {
    adj: t('Splitting'),
    text: t('Splitter Spawn: summons a splitter brick every turn.'),
    color: '#a0e86f',
  },
  totem: {
    adj: t('Totemic'),
    text: t('Totem: a totem heals it 5% every turn until you break it.'),
    color: '#3ddc97',
  },
  swarm: {
    adj: t('Swarming'),
    text: t('Swarm: every quarter of health lost, 4 minions burst out.'),
    color: '#9be15d',
  },
  shield: { adj: t('Crystal'), text: t('Shield: heals a little every turn.'), color: '#7fe7ff' },
  armored: { adj: t('Iron'), text: t('Armored: plain balls deal half damage.'), color: '#c9ccff' },
  bulwark: {
    adj: t('Walled'),
    text: t('Bulwark: shields on its sides; side hits do nothing.'),
    color: '#5ab8ff',
  },
  shell: { adj: t('Shelled'), text: t('Shell: hits on its top do nothing.'), color: '#7aa2ff' },
  underplate: {
    adj: t('Plated'),
    text: t('Underplate: hits on its bottom deal half damage.'),
    color: '#9db4d8',
  },
  phase: {
    adj: t('Phantom'),
    text: t('Phase Shift: every 3rd turn balls pass right through it.'),
    color: '#b9a6ff',
  },
  barrier: {
    adj: t('Warded'),
    text: t('Barrier: a bubble blocks the first few hits of every volley.'),
    color: '#66e0ff',
  },
  reflect: {
    adj: t('Gleaming'),
    text: t('Reflect: 1 in 10 hits bounces off faster, without damage.'),
    color: '#e6f3ff',
  },
  secondLife: {
    adj: t('Undying'),
    text: t('Second Life: once, it comes back with 30% health.'),
    color: '#ffd166',
  },
  stoneSkin: {
    adj: t('Stone'),
    text: t('Stone Skin: loses at most a quarter of its health per volley.'),
    color: '#a8a29e',
  },
  drifter: { adj: t('Wandering'), text: t('Drifter: slides one column every turn.'), color: '#b48cff' },
  blink: {
    adj: t('Blinking'),
    text: t('Blink: teleports to another column every 2 turns.'),
    color: '#d68cff',
  },
  lunge: {
    adj: t('Lunging'),
    text: t('Lunge: every 4 turns it lunges an extra row (it warns you first).'),
    color: '#ff8c42',
  },
  retreat: {
    adj: t('Cowardly'),
    text: t('Retreat: after losing a fifth of its health in one volley, it backs up a row.'),
    color: '#c3b1e1',
  },
  weaver: { adj: t('Weaving'), text: t('Weaver: slides two columns every turn.'), color: '#9f7aea' },
  hover: {
    adj: t('Floating'),
    text: t('Hover: falls only every other turn, but has more health.'),
    color: '#a5f3fc',
  },
  enrage: {
    adj: t('Raging'),
    text: t('Enrage: below half health it falls twice as fast.'),
    color: '#ff6b6b',
  },
  evasive: {
    adj: t('Elusive'),
    text: t('Evasive: dodges a column for every 10 hits it takes.'),
    color: '#c084fc',
  },
  core: {
    adj: t('Cored'),
    text: t('Crystal Core: hit the glowing core brick to hurt the boss 5% each time.'),
    color: '#ffe066',
  },
  heart: {
    adj: t('Exposed'),
    text: t('Exposed Heart: the middle of its underside takes double damage; the rest less.'),
    color: '#ff7eb6',
  },
  runes: {
    adj: t('Runic'),
    text: t('Runes: break all 3 runes to stun it for a turn and deal 15%.'),
    color: '#ffd43b',
  },
  powerCells: {
    adj: t('Powered'),
    text: t('Power Cells: takes 60% less damage until you break its 2 cells.'),
    color: '#fcc419',
  },
  rod: {
    adj: t('Conductive'),
    text: t('Lightning Rod: every hit on the rod zaps the boss for 3%.'),
    color: '#fff3a0',
  },
  volatile: {
    adj: t('Volatile'),
    text: t('Volatile: bombs and blasts deal triple damage.'),
    color: '#ffa94d',
  },
  icebound: {
    adj: t('Frozen'),
    text: t('Icebound: fire deals triple damage; plain balls half.'),
    color: '#a5d8ff',
  },
  cracked: { adj: t('Cracked'), text: t('Cracked: critical hits deal double damage.'), color: '#ffec99' },
  glutton: { adj: t('Greedy'), text: t('Glutton: eats a pickup every turn and heals 5%.'), color: '#f783ac' },
  frost: {
    adj: t('Frosty'),
    text: t('Frost: every 3 turns raises an ice wall that melts a turn later.'),
    color: '#99e9f2',
  },
  leech: {
    adj: t('Leeching'),
    text: t('Leech: holds back more of your balls each volley while it lives.'),
    color: '#e64980',
  },
  mire: { adj: t('Murky'), text: t('Mire: balls slow down near it.'), color: '#8ce99a' },
  shroud: {
    adj: t('Shrouded'),
    text: t('Shroud: your aim guide stops at the first bounce.'),
    color: '#868e96',
  },
  taxman: {
    adj: t('Taxing'),
    text: t('Taxman: steals 10% of your run coins every turn; pays back double when it falls.'),
    color: '#ffd43b',
  },
  gravity: { adj: t('Heavy'), text: t('Gravity Well: pulls balls toward it.'), color: '#845ef7' },
  repulse: { adj: t('Repelling'), text: t('Repulse: pushes balls away.'), color: '#22b8cf' },
  frenzy: {
    adj: t('Frenzied'),
    text: t('Frenzy: below half health, summons 2 bricks every turn.'),
    color: '#ff922b',
  },
  lastStand: {
    adj: t('Stubborn'),
    text: t("Last Stand: once, below a quarter health, it can't be hurt until next turn."),
    color: '#fab005',
  },
  fortify: {
    adj: t('Fortified'),
    text: t('Fortify: at half health it builds a wall below itself.'),
    color: '#adb5bd',
  },
  shatter: {
    adj: t('Brittle'),
    text: t('Shatter: when it falls it bursts into gold bricks.'),
    color: '#ffc83d',
  },
  charge: {
    adj: t('Charging'),
    text: t('Charge: every 5 turns it charges up; deal 15% that volley or it slams down 2 rows.'),
    color: '#ff6b6b',
  },
  rally: {
    adj: t('Rallying'),
    text: t('Rally: heals every brick on the board 20% each turn.'),
    color: '#69db7c',
  },
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
