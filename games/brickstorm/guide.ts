// What every brick, pickup and special ball does, for the Guide screen, the
// first-seen hints and the run stats side panel.
import { t } from './i18n'
import { BOOSTS, modsOf, xpToNext } from './sim/boosts'
import type { BoostId, RunState } from './sim/types'

export interface GuideEntry {
  /** 'brick:bomb', 'pickup:laser', 'ball:fire' … */
  id: string
  name: string
  text: string
}

export const GUIDE: GuideEntry[] = [
  {
    id: 'brick:normal',
    name: 'Brick',
    text: 'Break it before it reaches the red line. The number is its health.',
  },
  { id: 'brick:gold', name: 'Gold brick', text: 'Always drops 2× coins.' },
  {
    id: 'brick:bomb',
    name: 'Bomb brick',
    text: 'Explodes when broken, damaging the 8 bricks around it. Bombs chain!',
  },
  { id: 'brick:lightning', name: 'Lightning brick', text: 'When broken, zaps every other brick in its row.' },
  {
    id: 'brick:mystery',
    name: 'Mystery brick',
    text: 'Breaks open for a surprise: balls, coins, fireballs or a free boost.',
  },
  {
    id: 'brick:armored',
    name: 'Armored brick',
    text: 'Plain balls only chip 1 per hit. Fire, bombs and lasers hit it fully.',
  },
  { id: 'brick:splitter', name: 'Splitter brick', text: 'Splits into two half-health bricks when broken.' },
  {
    id: 'brick:boss',
    name: 'Boss',
    text: 'Every 30 turns. One big health bar, 1–2 special traits, and no new rows until it falls. Beat it for coins, a free boost and an extra boost slot.',
  },
  { id: 'pickup:ball', name: '+1 Ball', text: 'Touch it to add a ball for the rest of the run.' },
  { id: 'pickup:coin', name: 'Coin', text: 'Touch it for 5 coins to spend in the shop.' },
  { id: 'pickup:fire', name: 'Fire charge', text: 'Your next volley starts with 3 fireballs.' },
  { id: 'pickup:laser', name: 'Laser', text: 'Fires a beam across its row every time a ball passes it, until the volley ends.' },
  {
    id: 'ball:fire',
    name: 'Fireball',
    text: 'Burns straight through bricks for double damage without bouncing.',
  },
  { id: 'ball:bomb', name: 'Bomb ball', text: 'Explodes on its first hit, damaging a 3×3 area.' },
]

/** Special brick and pickup kinds on the board that the player hasn't been told about yet. */
export function newlySeen(s: RunState, seen: string[]): string[] {
  const ids = [
    // Bosses get their own card each fight.
    ...s.bricks.filter((b) => b.kind !== 'normal' && b.kind !== 'boss').map((b) => `brick:${b.kind}`),
    ...s.pickups.map((p) => `pickup:${p.kind}`),
  ]
  return [...new Set(ids)].filter((id) => !seen.includes(id))
}

const num = (n: number) => String(Math.round(n * 10) / 10)

/** Label/value rows for the stats side panel. */
export function runStats(s: RunState, bestTurn: number): Array<[string, string]> {
  const mods = modsOf(s.boosts)
  return [
    [t('Turn'), String(s.turn)],
    [t('Best turn'), String(Math.max(bestTurn, s.turn))],
    [t('Balls'), String(s.ballCount)],
    [t('Damage per hit'), num(mods.damageMult)],
    [t('Crit chance'), `${Math.round(mods.critChance * 100)}%`],
    [t('Combo'), t('{n} (best {best})', { n: s.combo, best: s.bestCombo })],
    [t('Level'), `${s.level + 1} · ${Math.floor(s.xp)}/${xpToNext(s.level)} XP`],
    [t('Coins this run'), String(s.coins)],
  ]
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/** What a boost does at the level you own, for its detail popup. */
export function boostDetail(id: BoostId, n: number): string {
  const m = modsOf({ [id]: n })
  const now: Record<BoostId, string> = {
    damage: t('Balls deal +{p} damage (×{m} per hit).', { p: pct(0.25 * n), m: m.damageMult }),
    balls: t('You got +{n} balls in total from this boost.', { n: 2 * n }),
    coins: t('Coins from bricks and pickups are worth +{p}.', { p: pct(0.3 * n) }),
    speed: t('Balls fly +{p} faster.', { p: pct(0.15 * n) }),
    pierce: t('Each ball passes straight through the first brick it hits (still damaging it).'),
    crit: t('{p} of hits are critical and deal 3× damage.', { p: pct(m.critChance) }),
    bouncy: t('Each wall bounce adds +1 damage to that ball for the rest of the volley.'),
    double: t('Your volley is doubled for 3 turns each time you pick this.'),
    fireball: t('Every {n}th ball is a fireball that burns through bricks for 2× damage.', {
      n: m.fireEvery,
    }),
    bombball: t('Every {n}th ball explodes on its first hit, damaging a 3×3 area.', { n: m.bombEvery }),
    twin: t('Each ball splits in two on its first brick hit.'),
    big: t('Balls are +{p} bigger, so they hit more.', { p: pct(0.2 * n) }),
    lightning: t('{p} of hits arc to the 2 nearest bricks.', { p: pct(m.zapChance) }),
    aftershock: t('When a brick breaks, its 4 neighbours take a hit too.'),
    magnet: t('Pickups up to a whole cell away fly to your balls.'),
    midas:
      n > 1 ? t('Every brick you break pays +{n} coins.', { n }) : t('Every brick you break pays +1 coin.'),
    keeper: t('Your combo survives {s} s without a hit (normally 1.5 s).', { s: 1.5 + n }),
    brain: t('You earn +{p} XP, so you level up faster.', { p: pct(0.3 * n) }),
    glass: t('All damage ×2, but bricks drop an extra row every 10th turn.'),
    eagle: t('Your aim guide is +{p} longer, so you can plan more bounces.', { p: pct(0.5 * n) }),
    secondWind: t('Once per run, a brick reaching the bottom wipes its row instead of ending the run.'),
  }
  const max = BOOSTS[id].max
  return now[id] + (max < 99 ? t(' (level {n} of {max})', { n, max }) : '')
}
