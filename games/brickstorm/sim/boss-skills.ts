// What each boss skill does, as hooks the fight calls at set moments. A skill
// only fills in the hooks it needs; boss.ts runs them in the boss's skill order.
import { random, randomInt } from '@forge/core/rng'
import {
  age,
  announce,
  bossBounds,
  bossCenter,
  bossParts,
  freeCells,
  healBoss,
  mem,
  minionHp,
  moveBoss,
  pickCells,
  roleBricks,
  setMem,
  summon,
} from './boss-kit'
import { CELL } from './config'
import { dims } from './dims'
import { breachUnit, hurtHero } from './health'
import { cellCenter } from './rows'
import type { DamageSource } from './damage'
import type { Ball, Boss, BossSkillId, BossTier, Brick, RunState } from './types'

/** Which side of the boss a ball struck. */
export type Face = 'top' | 'bottom' | 'left' | 'right'

export interface BossHit {
  source: DamageSource
  /** Set for ball hits. */
  face?: Face
  /** Column of the part that was hit, if known. */
  col?: number
  crit?: boolean
  /** Where it landed, in px, for sparks. */
  at?: { x: number; y: number }
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
  /** After it lost hp (from `before`). */
  hurt?(s: RunState, boss: Boss, before: number, hit: BossHit): void
  /** Its hp hit 0: return true to stay alive (the hook sets the new hp). */
  death?(s: RunState, boss: Boss): boolean
  /** After it fell, at (x, y). */
  defeated?(s: RunState, boss: Boss, at: { x: number; y: number }): void
  /** A volley starts. */
  launch?(s: RunState, boss: Boss): void
  /** A volley ended, before the board drops. */
  volleyEnd?(s: RunState, boss: Boss): void
  /** Extra rows it moves after the board drops (negative: it stays or rises). */
  drop?(s: RunState, boss: Boss): number
  /** A ball touches it on `face`: hit it, bounce off harmlessly ('block'), or pass through. */
  contact?(s: RunState, boss: Boss, ball: Ball, face: Face): 'hit' | 'block' | 'pass'
  /** Bends a flying ball's velocity. */
  force?(s: RunState, boss: Boss, ball: Ball, dt: number): void
  /** How fast a ball may move right now (1 = full speed). */
  slow?(s: RunState, boss: Boss, ball: Ball): number
  /** A brick it summoned took damage. */
  roleHit?(s: RunState, boss: Boss, brick: Brick, amount: number, source: DamageSource): void
  /** A brick it summoned was destroyed. */
  roleKill?(s: RunState, boss: Boss, brick: Brick): void
  /** The hero lost `amount` health (a crash or an attack). */
  heroHurt?(s: RunState, boss: Boss, amount: number): void
}

// Tuning, one place.
/** Ward hp, × a summoned brick's. */
const WARD_HP = 1
/** A ball hit on a thorn hurts the hero this share of a crashing brick… */
const THORN_HIT = 0.12
/** …but thorns take at most this share of max health per volley. */
const THORN_CAP = 0.15
/** A slam hurts like this many crashing bricks (if anything is near the line). */
const SLAM_HIT = 1.5
/** Drain: the boss heals this share of its max hp for each 100% of the hero's health it takes. */
const DRAIN_SHARE = 0.6
const SHIELD_HEAL = 0.08
const TOTEM_HEAL = 0.05
const GLUTTON_HEAL = 0.05
const RALLY_HEAL = 0.2
const GUARDED = 0.5
const POWERED = 0.4
const CORE_HIT = 0.05
/** Weak points take at most this share of the boss per volley. */
const WEAK_CAP = 0.15
const ROD_ZAP = 0.03
const RUNES_BREAK = 0.15
const STONE_CAP = 0.25
const RETREAT_AT = 0.2
const CHARGE_NEEDS = 0.15
const SECOND_LIFE = 0.3
const PULL = 900
const SLOW = 0.8

/** True on every `n`th turn of the fight (never on the turn it arrived). */
const every = (s: RunState, boss: Boss, n: number) => age(s, boss) > 0 && age(s, boss) % n === 0
/** Cells just below the boss's lowest row, across its width. */
const below = (s: RunState) => {
  const { left, right, bottom } = bossBounds(s)
  return freeCells(s, (c, r) => r === bottom + 1 && c >= left && c <= right)
}
/** Free cells away from the boss, between the top and a few rows above the line. */
const open = (s: RunState, fromRow = 0) => {
  const { left, right, top, bottom } = bossBounds(s)
  const last = dims(s).dangerRow - 3
  return freeCells(
    s,
    (c, r) => r >= fromRow && r <= last && !(c >= left - 1 && c <= right + 1 && r >= top && r <= bottom + 1),
  )
}
const minions = (s: RunState, n: number, cells = freeCells(s, (_, r) => r === 0)) =>
  summon(s, pickCells(s, cells, n), minionHp(s), { role: 'minion' })
/**
 * Spots tucked against the boss (beside it, or just above it): hard to reach,
 * so a weak point there takes a banked shot, not a lucky one.
 */
const tucked = (s: RunState) => {
  const { left, right, top, bottom } = bossBounds(s)
  const cells = freeCells(
    s,
    (c, r) =>
      (r >= top - 1 && r <= bottom && (c === left - 1 || c === right + 1)) ||
      (r === top - 1 && c >= left && c <= right),
  )
  return cells.length ? cells : open(s, 1)
}
/** Stone wards on a weak point's open sides (below, left, right): you must break in, or bank around. */
const fortify = (s: RunState, bricks: Brick[]) => {
  const line = dims(s).dangerRow
  const taken = (c: number, r: number) => s.bricks.some((b) => b.col === c && b.row === r)
  for (const b of bricks)
    for (const [c, r] of [
      [b.col, b.row + 1],
      [b.col - 1, b.row],
      [b.col + 1, b.row],
    ])
      if (c >= 0 && c < s.cols && r >= 0 && r < line - 1 && !taken(c, r))
        summon(s, [[c, r]], minionHp(s, WARD_HP), { role: 'ward' })
}
/**
 * A weak point was hit: only a real hit (a ball or a fireball) counts, never
 * splash (blasts, aftershock, lightning), and it can take at most WEAK_CAP of
 * the boss per volley, so no build melts a boss through it. Returns whether it hurt.
 */
const weakHit = (s: RunState, boss: Boss, source: DamageSource, share: number): boolean => {
  if (source !== 'ball' && source !== 'fire') return false
  const room = WEAK_CAP - mem(boss, 'weakHurt')
  if (room <= 0) return false
  const dealt = Math.min(share, room)
  setMem(boss, 'weakHurt', mem(boss, 'weakHurt') + dealt)
  hurtBy(s, boss, dealt)
  return true
}

/** Like respawn, but the weak point goes somewhere hard to reach and is walled in. */
const respawnGuarded = (s: RunState, boss: Boss, role: Brick['role'], n: number, hp: number) => {
  if (roleBricks(s, role!).length) return
  fortify(s, summon(s, pickCells(s, tucked(s), n), hp, { role }))
  announce(s, boss.traits.find((id) => SKILL_ROLE[id] === role) ?? boss.traits[0])
}
/** Free cells in the lower half of the board, away from the boss: where its attacks land. */
const low = (s: RunState) => open(s, Math.max(1, bossBounds(s).bottom + 1))

/** A share of max hp, as damage that skips the skills (it comes from the boss's own weak points). */
const hurtBy = (s: RunState, boss: Boss, share: number) => {
  boss.hp -= boss.maxHp * share
  boss.mem = { ...boss.mem, volley: (boss.mem?.volley ?? 0) + boss.maxHp * share }
  for (const p of bossParts(s)) p.hp = Math.max(1, boss.hp)
  if (boss.hp <= 0) boss.hp = 0.0001 // falls on the next hit; never dies from a side effect mid-chain
}
/** Crossed below `share` of max hp with this hit. */
const crossed = (boss: Boss, before: number, share: number) =>
  before >= boss.maxHp * share && boss.hp < boss.maxHp * share
const ballNear = (s: RunState, ball: Ball, reach: number) => {
  const c = bossCenter(s)
  const { left, right, top, bottom } = bossBounds(s)
  const halfW = ((right - left + 1) * CELL) / 2
  const halfH = ((bottom - top + 1) * CELL) / 2
  const dx = Math.max(0, Math.abs(ball.x - c.x) - halfW)
  const dy = Math.max(0, Math.abs(ball.y - c.y) - halfH)
  return Math.hypot(dx, dy) < reach
}
const slide = (s: RunState, boss: Boss, cols: number) => {
  for (let i = 0; i < cols; i++) {
    const { left, right } = bossBounds(s)
    if ((boss.dir > 0 && right + 1 >= s.cols) || (boss.dir < 0 && left - 1 < 0))
      boss.dir = boss.dir === 1 ? -1 : 1
    moveBoss(s, boss.dir, 0)
  }
}
const respawn = (
  s: RunState,
  boss: Boss,
  role: Brick['role'],
  n: number,
  place: () => Array<[number, number]>,
  hp: number,
) => {
  if (roleBricks(s, role!).length) return
  summon(s, pickCells(s, place(), n), hp, { role })
  announce(s, boss.traits.find((id) => SKILL_ROLE[id] === role) ?? boss.traits[0])
}

/** The brick each summoning skill owns. */
const SKILL_ROLE: Partial<Record<BossSkillId, Brick['role']>> = {
  guards: 'guard',
  eggs: 'egg',
  mirror: 'decoy',
  spikes: 'spike',
  totem: 'totem',
  runes: 'rune',
  powerCells: 'cell',
  rod: 'rod',
  core: 'core',
  frost: 'ice',
}

export const BOSS_SKILLS: Record<BossSkillId, BossSkill> = {
  // ---------- Summon ----------
  minions: {
    tier: 1,
    turn: (s) => minions(s, 2),
  },
  mason: {
    tier: 1,
    turn: (s, boss) => {
      if (!every(s, boss, 3)) return
      summon(s, pickCells(s, below(s), 3), minionHp(s), { role: 'minion' })
      announce(s, 'mason')
    },
  },
  guards: {
    tier: 2,
    spawn: (s, boss) => respawn(s, boss, 'guard', 2, () => besideBoss(s), minionHp(s, 1.2)),
    turn: (s, boss) => {
      if (every(s, boss, 5)) respawn(s, boss, 'guard', 2, () => besideBoss(s), minionHp(s, 1.2))
    },
    damage: (s, _b, amount) => (roleBricks(s, 'guard').length ? amount * GUARDED : amount),
  },
  brood: {
    tier: 2,
    turn: (s, boss) => {
      if (!every(s, boss, 4)) return
      const row = freeCells(s, (_, r) => r === 0)
      summon(s, pickCells(s, row, Math.ceil(row.length / 2)), minionHp(s, 1), { role: 'minion' })
      announce(s, 'brood')
    },
  },
  eggs: {
    tier: 2,
    turn: (s, boss) => {
      for (const egg of roleBricks(s, 'egg')) {
        egg.timer = (egg.timer ?? 1) - 1
        if (egg.timer > 0) continue
        s.bricks.splice(s.bricks.indexOf(egg), 1)
        const near = freeCells(s, (c, r) => Math.abs(c - egg.col) <= 1 && Math.abs(r - egg.row) <= 1)
        summon(
          s,
          [
            [egg.col, egg.row],
            ...pickCells(
              s,
              near.filter(([c, r]) => c !== egg.col || r !== egg.row),
              2,
            ),
          ],
          minionHp(s),
          { role: 'minion' },
        )
        announce(s, 'eggs')
      }
      if (every(s, boss, 3)) summon(s, pickCells(s, below(s), 1), minionHp(s, 0.8), { role: 'egg', timer: 2 })
    },
  },
  mirror: {
    tier: 2,
    spawn: (s, boss) =>
      respawn(
        s,
        boss,
        'decoy',
        2,
        () => freeCells(s, (c, r) => r === 0 && (c === 0 || c === s.cols - 1)),
        Math.round(boss.maxHp * 0.12),
      ),
    turn: (s, boss) => {
      if (every(s, boss, 5))
        respawn(
          s,
          boss,
          'decoy',
          2,
          () => freeCells(s, (c, r) => r === 0 && (c === 0 || c === s.cols - 1)),
          Math.round(boss.maxHp * 0.12),
        )
    },
    // While a copy stands, a quarter of ball hits strike an illusion.
    damage: (s, _b, amount, hit) =>
      hit.source === 'ball' && roleBricks(s, 'decoy').length && random(s.rng) < 0.25 ? 0 : amount,
    roleKill: (s, boss, brick) => {
      if (brick.role === 'decoy') hurtBy(s, boss, 0.08)
    },
  },
  spikes: {
    tier: 3,
    turn: (s, boss) => {
      if (!every(s, boss, 3)) return
      summon(s, pickCells(s, open(s, 1), 2), minionHp(s, 0.5), { role: 'spike' })
      announce(s, 'spikes')
    },
  },
  splitters: {
    tier: 1,
    turn: (s) => {
      summon(
        s,
        pickCells(
          s,
          freeCells(s, (_, r) => r === 0),
          1,
        ),
        minionHp(s, 0.8),
        { kind: 'splitter', role: 'minion' },
      )
    },
  },
  totem: {
    tier: 2,
    spawn: (s, boss) => respawn(s, boss, 'totem', 1, () => open(s), minionHp(s, 1.5)),
    turn: (s, boss) => {
      if (roleBricks(s, 'totem').length) healBoss(s, boss, boss.maxHp * TOTEM_HEAL)
      else if (every(s, boss, 6)) respawn(s, boss, 'totem', 1, () => open(s), minionHp(s, 1.5))
    },
  },
  swarm: {
    tier: 2,
    hurt: (s, boss, before) => {
      if (![0.75, 0.5, 0.25].some((k) => crossed(boss, before, k))) return
      const { bottom } = bossBounds(s)
      minions(
        s,
        4,
        freeCells(s, (_, r) => r <= bottom + 2),
      )
      announce(s, 'swarm')
    },
  },

  // ---------- Defense ----------
  shield: {
    tier: 1,
    turn: (s, boss) => healBoss(s, boss, boss.maxHp * SHIELD_HEAL),
  },
  armored: {
    tier: 1,
    damage: (_s, _boss, amount, hit) => (hit.source === 'ball' ? amount / 2 : amount),
  },
  bulwark: {
    tier: 2,
    contact: (_s, _b, _ball, face) => (face === 'left' || face === 'right' ? 'block' : 'hit'),
  },
  shell: {
    tier: 1,
    contact: (_s, _b, _ball, face) => (face === 'top' ? 'block' : 'hit'),
  },
  underplate: {
    tier: 2,
    damage: (_s, _b, amount, hit) => (hit.face === 'bottom' ? amount / 2 : amount),
  },
  phase: {
    tier: 2,
    turn: (s, boss) => {
      if (phased(s, boss)) announce(s, 'phase')
    },
    contact: (s, boss) => (phased(s, boss) ? 'pass' : 'hit'),
  },
  barrier: {
    tier: 2,
    spawn: (s, boss) => setMem(boss, 'barrier', Math.max(2, Math.ceil(s.ballCount / 5))),
    launch: (s, boss) => setMem(boss, 'barrier', Math.max(2, Math.ceil(s.ballCount / 5))),
    damage: (_s, boss, amount, hit) => {
      if (hit.source !== 'ball' || mem(boss, 'barrier') <= 0) return amount
      setMem(boss, 'barrier', mem(boss, 'barrier') - 1)
      return 0
    },
  },
  reflect: {
    tier: 2,
    contact: (s, _b, ball) => {
      if (random(s.rng) >= 0.1) return 'hit'
      ball.vx *= 1.25
      ball.vy *= 1.25
      return 'block'
    },
  },
  secondLife: {
    tier: 3,
    death: (s, boss) => {
      if (mem(boss, 'revived')) return false
      setMem(boss, 'revived', 1)
      boss.hp = boss.maxHp * SECOND_LIFE
      announce(s, 'secondLife')
      return true
    },
  },
  stoneSkin: {
    tier: 2,
    damage: (_s, boss, amount) => Math.min(amount, Math.max(0, boss.maxHp * STONE_CAP - mem(boss, 'volley'))),
  },

  // ---------- Movement ----------
  drifter: {
    tier: 1,
    turn: (s, boss) => slide(s, boss, 1),
  },
  blink: {
    tier: 2,
    turn: (s, boss) => {
      if (!every(s, boss, 2)) return
      const { left, right } = bossBounds(s)
      const room = s.cols - (right - left + 1)
      if (room <= 0) return
      let to = randomInt(s.rng, room + 1)
      if (to === left) to = (to + 1) % (room + 1)
      moveBoss(s, to - left, 0)
      announce(s, 'blink')
    },
  },
  lunge: {
    tier: 2,
    turn: (s, boss) => {
      if (age(s, boss) % 4 !== 3) return
      setMem(boss, 'lunge', 1)
      announce(s, 'lunge')
    },
    drop: (_s, boss) => {
      if (!mem(boss, 'lunge')) return 0
      setMem(boss, 'lunge', 0)
      return 1
    },
  },
  retreat: {
    tier: 2,
    volleyEnd: (s, boss) => {
      if (mem(boss, 'volley') >= boss.maxHp * RETREAT_AT) {
        setMem(boss, 'retreat', 1)
        announce(s, 'retreat')
      }
    },
    drop: (_s, boss) => {
      if (!mem(boss, 'retreat')) return 0
      setMem(boss, 'retreat', 0)
      return -2
    },
  },
  weaver: {
    tier: 1,
    turn: (s, boss) => slide(s, boss, 2),
  },
  hover: {
    tier: 1,
    spawn: (_s, boss) => {
      boss.maxHp = Math.round(boss.maxHp * 1.25)
      boss.hp = boss.maxHp
    },
    drop: (s, boss) => (age(s, boss) % 2 === 1 ? -1 : 0),
  },
  enrage: {
    tier: 1,
    turn: (s, boss) => {
      if (boss.hp < boss.maxHp / 2) moveBoss(s, 0, 1)
    },
  },
  evasive: {
    tier: 2,
    hurt: (s, boss, _before, hit) => {
      if (hit.source !== 'ball') return
      setMem(boss, 'dodge', mem(boss, 'dodge') + 1)
      if (mem(boss, 'dodge') % 10 !== 0) return
      slide(s, boss, 1)
      announce(s, 'evasive')
    },
  },

  // ---------- Weak points ----------
  core: {
    tier: 1,
    spawn: (s, boss) => respawnGuarded(s, boss, 'core', 1, minionHp(s, 2)),
    turn: (s, boss) => {
      if (every(s, boss, 4)) respawnGuarded(s, boss, 'core', 1, minionHp(s, 2))
    },
    launch: (_s, boss) => setMem(boss, 'weakHurt', 0),
    roleHit: (s, boss, brick, _amount, source) => {
      if (brick.role === 'core') weakHit(s, boss, source, CORE_HIT)
    },
  },
  heart: {
    tier: 2,
    damage: (s, _b, amount, hit) => {
      if (hit.source !== 'ball') return amount
      const { left, right } = bossBounds(s)
      const middle = Math.floor((left + right) / 2)
      const heart = hit.face === 'bottom' && (hit.col === middle || hit.col === Math.ceil((left + right) / 2))
      return heart ? amount * 2 : amount * 0.6
    },
  },
  runes: {
    tier: 2,
    spawn: (s) => {
      fortify(s, summon(s, pickCells(s, tucked(s), 3), minionHp(s), { role: 'rune' }))
    },
    turn: (s, boss) => {
      if (mem(boss, 'runesAt') && s.turn >= mem(boss, 'runesAt')) {
        setMem(boss, 'runesAt', 0)
        fortify(s, summon(s, pickCells(s, tucked(s), 3), minionHp(s), { role: 'rune' }))
        announce(s, 'runes')
      }
    },
    roleKill: (s, boss, brick) => {
      if (brick.role !== 'rune' || roleBricks(s, 'rune').length) return
      hurtBy(s, boss, RUNES_BREAK)
      setMem(boss, 'stunned', 1)
      setMem(boss, 'runesAt', s.turn + 4)
      announce(s, 'runes')
    },
    drop: (_s, boss) => {
      if (!mem(boss, 'stunned')) return 0
      setMem(boss, 'stunned', 0)
      return -1
    },
  },
  powerCells: {
    tier: 2,
    spawn: (s, boss) =>
      respawn(
        s,
        boss,
        'cell',
        2,
        () => freeCells(s, (c, r) => r === 0 && (c === 0 || c === s.cols - 1)),
        minionHp(s, 1.5),
      ),
    turn: (s, boss) => {
      if (every(s, boss, 6))
        respawn(
          s,
          boss,
          'cell',
          2,
          () => freeCells(s, (c, r) => r === 0 && (c === 0 || c === s.cols - 1)),
          minionHp(s, 1.5),
        )
    },
    damage: (s, _b, amount) => (roleBricks(s, 'cell').length ? amount * POWERED : amount),
  },
  rod: {
    tier: 1,
    spawn: (s, boss) => respawnGuarded(s, boss, 'rod', 1, minionHp(s, 2.5)),
    turn: (s, boss) => {
      if (every(s, boss, 5)) respawnGuarded(s, boss, 'rod', 1, minionHp(s, 2.5))
    },
    launch: (_s, boss) => setMem(boss, 'weakHurt', 0),
    roleHit: (s, boss, brick, _amount, source) => {
      if (brick.role !== 'rod' || !weakHit(s, boss, source, ROD_ZAP)) return
      const from = cellCenter(brick.col, brick.row)
      const to = bossCenter(s)
      s.events.push({ type: 'zap', x1: from.x, y1: from.y, x2: to.x, y2: to.y, depth: 0 })
    },
  },
  volatile: {
    tier: 1,
    damage: (_s, _b, amount, hit) => (hit.source === 'blast' || hit.source === 'bomb' ? amount * 3 : amount),
  },
  icebound: {
    tier: 1,
    damage: (_s, _b, amount, hit) =>
      hit.source === 'fire' ? amount * 3 : hit.source === 'ball' ? amount / 2 : amount,
  },
  cracked: {
    tier: 1,
    damage: (_s, _b, amount, hit) => (hit.crit ? amount * 2 : amount),
  },

  // ---------- Tricks ----------
  glutton: {
    tier: 2,
    turn: (s, boss) => {
      if (!s.pickups.length) return
      const c = bossCenter(s)
      const near = [...s.pickups].sort(
        (a, b) =>
          Math.hypot((a.col + 0.5) * CELL - c.x, a.row * CELL - c.y) -
          Math.hypot((b.col + 0.5) * CELL - c.x, b.row * CELL - c.y),
      )[0]
      s.pickups.splice(s.pickups.indexOf(near), 1)
      healBoss(s, boss, boss.maxHp * GLUTTON_HEAL)
      announce(s, 'glutton')
    },
  },
  frost: {
    tier: 2,
    turn: (s, boss) => {
      for (const ice of roleBricks(s, 'ice')) {
        ice.timer = (ice.timer ?? 1) - 1
        if (ice.timer <= 0) s.bricks.splice(s.bricks.indexOf(ice), 1)
      }
      if (!every(s, boss, 3)) return
      const { left, right } = bossBounds(s)
      const cols = [...Array(s.cols).keys()].filter((c) => c < left || c > right)
      if (!cols.length) return
      const col = cols[randomInt(s.rng, cols.length)]
      const last = Math.min(5, dims(s).dangerRow - 3)
      summon(
        s,
        freeCells(s, (c, r) => c === col && r <= last),
        1,
        { role: 'ice', timer: 1 },
      )
      announce(s, 'frost')
    },
  },
  leech: {
    tier: 3,
    launch: (s, boss) => {
      const held = Math.min(mem(boss, 'leech') + 1, Math.floor(s.ballCount / 3))
      setMem(boss, 'leech', held)
      const queued = s.balls.filter((b) => b.status === 'queued')
      const keep = Math.max(1, queued.length - held)
      s.balls = s.balls.filter((b) => b.status !== 'queued' || queued.indexOf(b) < keep)
      if (held > 0) announce(s, 'leech')
    },
  },
  mire: {
    tier: 2,
    slow: (s, _b, ball) => (ballNear(s, ball, CELL) ? SLOW : 1),
  },
  shroud: {
    tier: 3,
  },
  taxman: {
    tier: 3,
    turn: (s, boss) => {
      const tax = Math.floor(s.coins * 0.1)
      if (tax <= 0) return
      s.coins -= tax
      setMem(boss, 'tax', mem(boss, 'tax') + tax)
      announce(s, 'taxman')
    },
    defeated: (s, boss) => {
      s.coins += mem(boss, 'tax')
    },
  },
  gravity: {
    tier: 2,
    force: (s, _b, ball, dt) => pull(s, ball, dt, PULL),
  },
  repulse: {
    tier: 2,
    force: (s, _b, ball, dt) => pull(s, ball, dt, -PULL),
  },

  // ---------- Rage ----------
  frenzy: {
    tier: 2,
    turn: (s, boss) => {
      if (boss.hp >= boss.maxHp / 2) return
      minions(s, 2)
      announce(s, 'frenzy')
    },
  },
  lastStand: {
    tier: 3,
    hurt: (s, boss, before) => {
      if (mem(boss, 'stood') || !crossed(boss, before, 0.25)) return
      setMem(boss, 'stood', 1)
      setMem(boss, 'immuneUntil', s.turn + 1)
      announce(s, 'lastStand')
    },
    damage: (s, boss, amount) => (s.turn < mem(boss, 'immuneUntil') ? 0 : amount),
  },
  fortify: {
    tier: 2,
    hurt: (s, boss, before) => {
      if (mem(boss, 'fortified') || !crossed(boss, before, 0.5)) return
      setMem(boss, 'fortified', 1)
      const { bottom } = bossBounds(s)
      summon(
        s,
        freeCells(s, (_, r) => r === bottom + 1),
        minionHp(s),
        { role: 'minion' },
      )
      announce(s, 'fortify')
    },
  },
  shatter: {
    tier: 1,
    defeated: (s, _boss, at) => {
      const col = Math.floor(at.x / CELL)
      const cells = freeCells(
        s,
        (c, r) => Math.abs(c - col) <= 2 && r <= Math.max(1, Math.round(at.y / CELL)),
      )
      summon(s, pickCells(s, cells, 6), minionHp(s, 0.5), { kind: 'gold' })
    },
  },
  charge: {
    tier: 3,
    turn: (s, boss) => {
      if (age(s, boss) % 5 !== 4) return
      setMem(boss, 'charging', 1)
      announce(s, 'charge')
    },
    volleyEnd: (_s, boss) => {
      if (!mem(boss, 'charging')) return
      setMem(boss, 'charging', 0)
      if (mem(boss, 'volley') < boss.maxHp * CHARGE_NEEDS) setMem(boss, 'slam', 1)
    },
    drop: (_s, boss) => {
      if (!mem(boss, 'slam')) return 0
      setMem(boss, 'slam', 0)
      return 2
    },
  },
  rally: {
    tier: 2,
    turn: (s) => {
      for (const b of s.bricks) if (b.kind !== 'boss') b.hp = Math.min(b.maxHp, b.hp + b.maxHp * RALLY_HEAL)
    },
  },

  // ---------- Attacks: they hurt the hero, not just the board ----------
  thorns: {
    tier: 1,
    // Spiky bricks across the lower board: every ball hit on one costs health.
    // Fire, bombs and lasers break them safely.
    spawn: (s) => {
      summon(s, pickCells(s, low(s), 3), minionHp(s, 0.8), { role: 'thorn' })
      s.events.push({ type: 'bossAttack', id: 'thorns', ...bossCenter(s) })
    },
    turn: (s, boss) => {
      const missing = 3 - roleBricks(s, 'thorn').length
      if (missing > 0 && every(s, boss, 3)) {
        summon(s, pickCells(s, low(s), missing), minionHp(s, 0.8), { role: 'thorn' })
        announce(s, 'thorns')
      }
    },
    launch: (_s, boss) => setMem(boss, 'thornHurt', 0),
    roleHit: (s, boss, brick, _amount, source) => {
      if (brick.role !== 'thorn' || source !== 'ball') return
      const done = mem(boss, 'thornHurt')
      const dmg = Math.min(breachUnit(s.turn) * THORN_HIT, s.maxHp * THORN_CAP - done)
      if (dmg <= 0) return
      setMem(boss, 'thornHurt', done + dmg)
      hurtHero(s, dmg, cellCenter(brick.col, brick.row), 'thorn')
    },
  },
  barrage: {
    tier: 1,
    // Every 2 turns (3 for a first boss) it fires 2 missiles from under itself; they fall 2 rows a
    // turn and hurt double if they reach the line. Shoot them down.
    turn: (s, boss) => {
      const line = dims(s).dangerRow
      const taken = (c: number, r: number) => s.bricks.some((b) => b.col === c && b.row === r)
      for (const m of roleBricks(s, 'missile').sort((a, b) => b.row - a.row))
        if (m.row + 1 < line && !taken(m.col, m.row + 1)) m.row++
      if (every(s, boss, (boss.tier ?? 1) === 1 ? 3 : 2)) {
        const { left, right, bottom } = bossBounds(s)
        const cells = freeCells(s, (c, r) => r === bottom + 1 && c >= left - 1 && c <= right + 1)
        summon(s, pickCells(s, cells, 2), minionHp(s, 0.35), { role: 'missile' })
        s.events.push({ type: 'bossAttack', id: 'barrage', ...bossCenter(s) })
      }
    },
  },
  slam: {
    tier: 2,
    // Every 3 turns it slams the ground (warning the turn before): every brick
    // drops a row, and the hero is hurt if anything is near the line.
    turn: (s, boss) => {
      const a = age(s, boss)
      if (a > 0 && a % 3 === 2) s.events.push({ type: 'bossWarn', id: 'slam' })
      if (a <= 0 || a % 3 !== 0) return
      const parts = new Set(bossParts(s).map((b) => `${b.col},${b.row}`))
      const taken = new Set(s.bricks.map((b) => `${b.col},${b.row}`))
      // Lowest first, so a column moves down together.
      for (const b of s.bricks.filter((b) => b.kind !== 'boss').sort((x, y) => y.row - x.row)) {
        const to = `${b.col},${b.row + 1}`
        if (parts.has(to) || taken.has(to)) continue
        taken.delete(`${b.col},${b.row}`)
        b.row++
        taken.add(to)
      }
      for (const p of s.pickups) p.row++
      s.pickups = s.pickups.filter((p) => p.row < dims(s).dangerRow)
      s.events.push({ type: 'bossAttack', id: 'slam', ...bossCenter(s) })
      if (s.bricks.some((b) => b.kind !== 'boss' && b.row >= dims(s).dangerRow - 2))
        hurtHero(s, breachUnit(s.turn) * SLAM_HIT, bossCenter(s), 'slam')
    },
  },
  hex: {
    tier: 2,
    // Every 4 turns it curses the 2 lowest plain bricks into thorns.
    turn: (s, boss) => {
      if (!every(s, boss, 4)) return
      const plain = s.bricks.filter((b) => b.kind === 'normal' && !b.role).sort((a, b) => b.row - a.row)
      for (const b of plain.slice(0, 2)) b.role = 'thorn'
      if (plain.length) s.events.push({ type: 'bossAttack', id: 'hex', ...bossCenter(s) })
    },
    launch: (_s, boss) => setMem(boss, 'thornHurt', 0),
    roleHit: (s, boss, brick, _amount, source) => {
      if (brick.role !== 'thorn' || source !== 'ball' || boss.traits.includes('thorns')) return
      const done = mem(boss, 'thornHurt')
      const dmg = Math.min(breachUnit(s.turn) * THORN_HIT, s.maxHp * THORN_CAP - done)
      if (dmg <= 0) return
      setMem(boss, 'thornHurt', done + dmg)
      hurtHero(s, dmg, cellCenter(brick.col, brick.row), 'thorn')
    },
  },
  drain: {
    tier: 3,
    // Whatever health the hero loses, it drinks.
    heroHurt: (s, boss, amount) => healBoss(s, boss, boss.maxHp * (amount / s.maxHp) * DRAIN_SHARE),
  },
}

/** Phase Shift: every 3rd turn of the fight it is a ghost. */
export function phased(s: Pick<RunState, 'turn'>, boss: Boss): boolean {
  return boss.traits.includes('phase') && age(s, boss) % 3 === 2
}

/** Free cells on either side of the boss's lowest row. */
function besideBoss(s: RunState): Array<[number, number]> {
  const { left, right, bottom } = bossBounds(s)
  return freeCells(s, (c, r) => r === bottom && (c === left - 1 || c === right + 1))
}

/** Accelerates a ball toward (or, negative, away from) the boss's middle, fading with distance. */
function pull(s: RunState, ball: Ball, dt: number, strength: number): void {
  const c = bossCenter(s)
  const dx = c.x - ball.x
  const dy = c.y - ball.y
  const d = Math.hypot(dx, dy)
  if (d < 1 || d > 4 * CELL) return
  const speed = Math.hypot(ball.vx, ball.vy)
  const k = (strength * dt * (1 - d / (4 * CELL))) / d
  ball.vx += dx * k
  ball.vy += dy * k
  // Bending, not speeding up: keep its speed.
  const now = Math.hypot(ball.vx, ball.vy)
  ball.vx *= speed / now
  ball.vy *= speed / now
}

export const SKILL_IDS = Object.keys(BOSS_SKILLS) as BossSkillId[]
