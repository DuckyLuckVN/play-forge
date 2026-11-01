import { describe, expect, it } from 'vitest'
import { SKILL_INFO } from '../boss-skill-ui'
import {
  bossContact,
  bossDrop,
  bossForce,
  bossHidesGuide,
  bossLaunch,
  bossParts,
  bossVolleyEnd,
  ATTACKS,
  BOSS_ROOM,
  bossTurn,
  rollTraits,
  shrinkArena,
  spawnBoss,
} from './boss'
import { bossBounds, roleBricks } from './boss-kit'
import { dims } from './dims'
import { brickBreach, hurtHero } from './health'
import { BOSS_SKILLS, SKILL_IDS } from './boss-skills'
import { CELL } from './config'
import { damageBrick } from './damage'
import { cellCenter } from './rows'
import { canRecall, drainEvents, fire, recall, startNextTurn, step } from './run'
import { useHelper } from './meta'
import { brick, empty } from './testing'
import type { Ball, BossSkillId, RunState } from './types'

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
const turns = (s: RunState, n: number) => {
  for (let i = 0; i < n; i++) startNextTurn(s)
}
const hp = (s: RunState) => s.boss!.hp
const max = (s: RunState) => s.boss!.maxHp
const hit = (s: RunState, amount: number, source: 'ball' | 'fire' | 'blast' | 'bomb' = 'ball', more = {}) =>
  damageBrick(s, bossParts(s)[0], amount, source, 0, more)
const left = (s: RunState) => Math.min(...bossParts(s).map((b) => b.col))
const top = (s: RunState) => Math.min(...bossParts(s).map((b) => b.row))
const ballAt = (x: number, y: number, vx = 0, vy = -600): Ball => ({
  x,
  y,
  vx,
  vy,
  status: 'flying',
  kind: 'normal',
  r: 7,
  split: false,
  inside: [],
  pierceLeft: 0,
  bounceBonus: 0,
  lastBrick: -1,
})
const skillEvents = (s: RunState, id: BossSkillId) =>
  drainEvents(s).filter((e) => e.type === 'bossSkill' && e.id === id).length

describe('boss skills: summon', () => {
  it('minions: 2 minions on the top row every turn', () => {
    const s = fight(['minions'])
    turns(s, 1)
    expect(roleBricks(s, 'minion')).toHaveLength(2)
  })

  it('mason: a wall of 3 under it every 3 turns', () => {
    const s = fight(['mason'])
    turns(s, 2)
    expect(roleBricks(s, 'minion')).toHaveLength(0)
    turns(s, 1)
    const wall = roleBricks(s, 'minion')
    expect(wall).toHaveLength(3)
    for (const b of wall) expect(b.row).toBe(2)
    expect(skillEvents(s, 'mason')).toBe(1)
  })

  it('guards: two guards beside it halve damage until both fall', () => {
    const s = fight(['guards'])
    const guards = roleBricks(s, 'guard')
    expect(guards).toHaveLength(2)
    const start = hp(s)
    hit(s, 10)
    expect(hp(s)).toBe(start - 5)
    for (const g of guards) damageBrick(s, g, 1e9, 'ball')
    hit(s, 10)
    expect(hp(s)).toBe(start - 15)
  })

  it('brood: fills half the free top row every 4 turns', () => {
    const s = fight(['brood'])
    turns(s, 4)
    const free = s.cols - bossParts(s).filter((b) => b.row === 0).length
    expect(roleBricks(s, 'minion')).toHaveLength(Math.ceil(free / 2))
  })

  it('eggs: an egg under it hatches into bricks two turns later', () => {
    const s = fight(['eggs'])
    turns(s, 3)
    expect(roleBricks(s, 'egg')).toHaveLength(1)
    turns(s, 2)
    expect(roleBricks(s, 'minion').length).toBeGreaterThanOrEqual(1)
    expect(roleBricks(s, 'minion').length).toBeLessThanOrEqual(3)
  })

  it('mirror: two decoys; breaking one hurts the boss', () => {
    const s = fight(['mirror'])
    const decoys = roleBricks(s, 'decoy')
    expect(decoys).toHaveLength(2)
    const start = hp(s)
    damageBrick(s, decoys[0], 1e9, 'ball')
    expect(hp(s)).toBeCloseTo(start - max(s) * 0.08)
  })

  it('spikes: a ball that hits a spike is popped for the volley', () => {
    const s = fight(['spikes'])
    turns(s, 3)
    expect(roleBricks(s, 'spike')).toHaveLength(2)
    const spike = roleBricks(s, 'spike')[0]
    const c = cellCenter(spike.col, spike.row)
    s.phase = 'volley'
    s.balls = [ballAt(c.x, c.y + CELL)]
    for (let i = 0; i < 30 && s.phase === 'volley'; i++) step(s)
    expect(drainEvents(s).some((e) => e.type === 'pop')).toBe(true)
  })

  it('splitters: a splitter brick every turn', () => {
    const s = fight(['splitters'])
    turns(s, 2)
    expect(s.bricks.filter((b) => b.kind === 'splitter')).toHaveLength(2)
  })

  it('totem: heals it each turn until broken', () => {
    const s = fight(['totem'])
    s.boss!.hp = max(s) / 2
    turns(s, 1)
    expect(hp(s)).toBeCloseTo(max(s) * 0.55)
    damageBrick(s, roleBricks(s, 'totem')[0], 1e9, 'ball')
    turns(s, 1)
    expect(hp(s)).toBeCloseTo(max(s) * 0.55)
  })

  it('swarm: 4 minions each time it loses a quarter of its health', () => {
    const s = fight(['swarm'])
    hit(s, max(s) * 0.3)
    expect(roleBricks(s, 'minion')).toHaveLength(4)
    hit(s, max(s) * 0.01)
    expect(roleBricks(s, 'minion')).toHaveLength(4)
  })
})

describe('boss skills: defense', () => {
  it('bulwark: side hits bounce off harmlessly', () => {
    const s = fight(['bulwark'])
    expect(bossContact(s, ballAt(0, 0), 'left')).toBe('block')
    expect(bossContact(s, ballAt(0, 0), 'right')).toBe('block')
    expect(bossContact(s, ballAt(0, 0), 'bottom')).toBe('hit')
  })

  it('shell: hits on top bounce off harmlessly', () => {
    const s = fight(['shell'])
    expect(bossContact(s, ballAt(0, 0), 'top')).toBe('block')
    expect(bossContact(s, ballAt(0, 0), 'bottom')).toBe('hit')
  })

  it('a blocked ball really deals no damage', () => {
    const s = fight(['bulwark'])
    const start = hp(s)
    const r = bossParts(s).find((b) => b.col === left(s))!
    const c = cellCenter(r.col, r.row)
    s.phase = 'volley'
    s.balls = [ballAt(c.x - CELL, c.y, 600, 0)]
    for (let i = 0; i < 20; i++) step(s)
    expect(hp(s)).toBe(start)
  })

  it('underplate: hits from below deal half', () => {
    const s = fight(['underplate'])
    const start = hp(s)
    hit(s, 10, 'ball', { face: 'bottom' })
    expect(hp(s)).toBe(start - 5)
    hit(s, 10, 'ball', { face: 'left' })
    expect(hp(s)).toBe(start - 15)
  })

  it('phase: every 3rd turn balls pass through', () => {
    const s = fight(['phase'])
    turns(s, 1)
    expect(bossContact(s, ballAt(0, 0), 'bottom')).toBe('hit')
    turns(s, 1)
    expect(bossContact(s, ballAt(0, 0), 'bottom')).toBe('pass')
  })

  it('barrier: blocks the first few ball hits of every volley', () => {
    const s = fight(['barrier'])
    bossLaunch(s)
    const start = hp(s)
    for (let i = 0; i < 4; i++) hit(s, 10) // 20 balls → 4 blocked
    expect(hp(s)).toBe(start)
    hit(s, 10)
    expect(hp(s)).toBe(start - 10)
    hit(s, 10, 'blast')
    expect(hp(s)).toBe(start - 20)
    bossLaunch(s)
    hit(s, 10)
    expect(hp(s)).toBe(start - 20)
  })

  it('reflect: about 1 in 10 contacts bounce off', () => {
    const s = fight(['reflect'])
    let blocked = 0
    for (let i = 0; i < 1000; i++) if (bossContact(s, ballAt(0, 0), 'bottom') === 'block') blocked++
    expect(blocked).toBeGreaterThan(60)
    expect(blocked).toBeLessThan(140)
  })

  it('second life: once, it survives a killing blow with 30%', () => {
    const s = fight(['secondLife'])
    hit(s, 1e9, 'blast')
    expect(s.boss).toBeTruthy()
    expect(hp(s)).toBeCloseTo(max(s) * 0.3)
    hit(s, 1e9, 'blast')
    expect(s.boss).toBeNull()
  })

  it('stone skin: loses at most a quarter per volley', () => {
    const s = fight(['stoneSkin'])
    bossLaunch(s)
    hit(s, 1e9, 'blast')
    expect(hp(s)).toBeCloseTo(max(s) * 0.75)
    hit(s, 10)
    expect(hp(s)).toBeCloseTo(max(s) * 0.75)
    bossLaunch(s)
    hit(s, 10)
    expect(hp(s)).toBeCloseTo(max(s) * 0.75 - 10)
  })
})

describe('boss skills: movement', () => {
  it('blink: jumps to another column every 2 turns', () => {
    const s = fight(['blink'])
    const at = left(s)
    turns(s, 1)
    expect(left(s)).toBe(at)
    turns(s, 1)
    expect(left(s)).not.toBe(at)
    expect(left(s) + 2).toBeLessThan(s.cols)
  })

  it('lunge: warns, then drops an extra row', () => {
    const s = fight(['lunge'])
    turns(s, 3)
    expect(skillEvents(s, 'lunge')).toBe(1)
    bossDrop(s)
    expect(top(s)).toBe(1)
    bossDrop(s)
    expect(top(s)).toBe(1)
  })

  it('retreat: backs up after a big volley, never above the top', () => {
    const s = fight(['retreat'])
    for (const p of bossParts(s)) p.row += 3
    bossLaunch(s)
    hit(s, max(s) * 0.25)
    bossVolleyEnd(s)
    bossDrop(s)
    expect(top(s)).toBe(1)
    bossLaunch(s)
    hit(s, max(s) * 0.25)
    bossVolleyEnd(s)
    bossDrop(s)
    expect(top(s)).toBe(0)
  })

  it('weaver: slides two columns a turn', () => {
    const s = fight(['weaver'])
    const at = left(s)
    turns(s, 1)
    expect(Math.abs(left(s) - at)).toBe(2)
  })

  it('hover: more health, and stays put every other turn', () => {
    const plain = fight([])
    const s = fight(['hover'])
    expect(max(s)).toBe(Math.round(max(plain) * 1.25))
    turns(s, 1)
    bossDrop(s)
    for (const p of bossParts(s)) p.row += 2
    bossDrop(s)
    expect(top(s)).toBe(1)
  })

  it('evasive: shifts a column every 10 ball hits', () => {
    const s = fight(['evasive'])
    const at = left(s)
    for (let i = 0; i < 9; i++) hit(s, 1)
    expect(left(s)).toBe(at)
    hit(s, 1)
    expect(Math.abs(left(s) - at)).toBe(1)
  })
})

describe('boss skills: weak points', () => {
  it('core: every hit on the core takes 5% of the boss', () => {
    const s = fight(['core'])
    const core = roleBricks(s, 'core')[0]
    const start = hp(s)
    damageBrick(s, core, 1, 'ball')
    expect(hp(s)).toBeCloseTo(start - max(s) * 0.05)
  })

  it('heart: the middle of its underside takes double, elsewhere less', () => {
    const s = fight(['heart'])
    const mid = left(s) + 1
    const start = hp(s)
    damageBrick(
      s,
      bossParts(s).find((b) => b.col === mid)!,
      10,
      'ball',
      0,
      { face: 'bottom' },
    )
    expect(hp(s)).toBe(start - 20)
    damageBrick(
      s,
      bossParts(s).find((b) => b.col === left(s))!,
      10,
      'ball',
      0,
      { face: 'bottom' },
    )
    expect(hp(s)).toBe(start - 26)
  })

  it('runes: breaking all three stuns it and deals 15%', () => {
    const s = fight(['runes'])
    for (const p of bossParts(s)) p.row += 2
    const runes = roleBricks(s, 'rune')
    expect(runes).toHaveLength(3)
    const start = hp(s)
    for (const r of runes) damageBrick(s, r, 1e9, 'ball')
    expect(hp(s)).toBeCloseTo(start - max(s) * 0.15)
    bossDrop(s)
    expect(top(s)).toBe(1)
  })

  it('power cells: 60% less damage while the cells stand', () => {
    const s = fight(['powerCells'])
    const cells = roleBricks(s, 'cell')
    expect(cells).toHaveLength(2)
    const start = hp(s)
    hit(s, 10)
    expect(hp(s)).toBeCloseTo(start - 4)
    for (const c of cells) damageBrick(s, c, 1e9, 'ball')
    hit(s, 10)
    expect(hp(s)).toBeCloseTo(start - 14)
  })

  it('rod: each hit on the rod zaps the boss for 3%', () => {
    const s = fight(['rod'])
    const start = hp(s)
    damageBrick(s, roleBricks(s, 'rod')[0], 1, 'ball')
    expect(hp(s)).toBeCloseTo(start - max(s) * 0.03)
    expect(drainEvents(s).some((e) => e.type === 'zap')).toBe(true)
  })

  it('volatile, icebound and cracked change damage by source', () => {
    const v = fight(['volatile'])
    hit(v, 10, 'blast')
    expect(max(v) - hp(v)).toBe(30)
    const i = fight(['icebound'])
    hit(i, 10, 'fire')
    hit(i, 10, 'ball')
    expect(max(i) - hp(i)).toBe(35)
    const c = fight(['cracked'])
    hit(c, 10, 'ball', { crit: true })
    expect(max(c) - hp(c)).toBe(20)
  })
})

describe('boss skills: tricks', () => {
  it('glutton: eats a pickup and heals', () => {
    const s = fight(['glutton'])
    s.boss!.hp = max(s) / 2
    s.pickups.push({ id: s.nextId++, col: 0, row: 5, kind: 'ball' })
    turns(s, 1)
    expect(s.pickups).toHaveLength(0)
    expect(hp(s)).toBeCloseTo(max(s) * 0.55)
  })

  it('frost: an unbreakable ice wall that melts a turn later', () => {
    const s = fight(['frost'])
    turns(s, 3)
    const ice = roleBricks(s, 'ice')
    expect(ice.length).toBeGreaterThan(0)
    expect(new Set(ice.map((b) => b.col)).size).toBe(1)
    damageBrick(s, ice[0], 1e9, 'blast')
    expect(roleBricks(s, 'ice')).toHaveLength(ice.length)
    turns(s, 1)
    expect(roleBricks(s, 'ice')).toHaveLength(0)
  })

  it('leech: holds back a growing number of balls', () => {
    const s = fight(['leech'])
    fire(s, Math.PI / 2)
    expect(s.balls).toHaveLength(19)
    s.phase = 'aim'
    fire(s, Math.PI / 2)
    expect(s.balls).toHaveLength(18)
  })

  it('mire: slows balls near it only', () => {
    const s = fight(['mire'])
    const c = cellCenter(left(s) + 1, 2)
    expect(bossForce(s, ballAt(c.x, c.y + 10), 1 / 60)).toBe(0.8)
    expect(bossForce(s, ballAt(c.x, c.y + 4 * CELL), 1 / 60)).toBe(1)
  })

  it('shroud: hides the aim guide past the first bounce', () => {
    expect(bossHidesGuide(fight(['shroud']))).toBe(true)
    expect(bossHidesGuide(fight([]))).toBe(false)
  })

  it('taxman: takes 10% of run coins a turn and gives it back when it falls', () => {
    const s = fight(['taxman'])
    s.coins = 100
    turns(s, 1)
    expect(s.coins).toBe(90)
    hit(s, 1e9, 'blast')
    expect(s.coins).toBe(100 + 4 * 31)
  })

  it('gravity bends a passing ball toward it; repulse away; speed stays', () => {
    for (const [id, sign] of [
      ['gravity', 1],
      ['repulse', -1],
    ] as const) {
      const s = fight([id])
      const c = cellCenter(left(s) + 1, 1)
      const ball = ballAt(c.x + CELL * 1.5, c.y + CELL * 2, 0, -600)
      bossForce(s, ball, 1 / 60)
      expect(Math.sign(-ball.vx)).toBe(sign)
      expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(600)
    }
  })
})

describe('boss skills: rage', () => {
  it('frenzy: below half health, 2 minions a turn', () => {
    const s = fight(['frenzy'])
    turns(s, 1)
    expect(roleBricks(s, 'minion')).toHaveLength(0)
    s.boss!.hp = max(s) / 3
    turns(s, 1)
    expect(roleBricks(s, 'minion')).toHaveLength(2)
  })

  it('last stand: once, under a quarter, it is untouchable until next turn', () => {
    const s = fight(['lastStand'])
    hit(s, max(s) * 0.8, 'blast')
    const left = hp(s)
    hit(s, 10, 'blast')
    expect(hp(s)).toBe(left)
    turns(s, 1)
    hit(s, 10, 'blast')
    expect(hp(s)).toBe(left - 10)
  })

  it('fortify: at half health, a wall below it', () => {
    const s = fight(['fortify'])
    hit(s, max(s) * 0.6, 'blast')
    const wall = roleBricks(s, 'minion')
    expect(wall.length).toBe(s.cols)
    for (const b of wall) expect(b.row).toBe(2)
  })

  it('shatter: bursts into gold bricks', () => {
    const s = fight(['shatter'])
    hit(s, 1e9, 'blast')
    expect(s.bricks.filter((b) => b.kind === 'gold').length).toBeGreaterThan(0)
  })

  it('charge: slams down 2 rows unless hit hard that volley', () => {
    const s = fight(['charge'])
    turns(s, 4)
    expect(skillEvents(s, 'charge')).toBe(1)
    bossLaunch(s)
    hit(s, 1)
    bossVolleyEnd(s)
    bossDrop(s)
    expect(top(s)).toBe(2)
    const t = fight(['charge'])
    turns(t, 4)
    bossLaunch(t)
    hit(t, max(t) * 0.2, 'blast')
    bossVolleyEnd(t)
    bossDrop(t)
    expect(top(t)).toBe(0)
  })

  it('rally: heals the other bricks', () => {
    const s = fight(['rally'])
    const b = brick(s, 0, 5, 100)
    b.hp = 50
    turns(s, 1)
    expect(b.hp).toBe(70)
  })
})

describe('boss skills: all', () => {
  it('every skill has a tier, a name and a text', () => {
    expect(SKILL_IDS).toHaveLength(55)
    for (const id of SKILL_IDS) {
      expect([1, 2, 3]).toContain(BOSS_SKILLS[id].tier)
      expect(SKILL_INFO[id].adj).toBeTruthy()
      expect(SKILL_INFO[id].text).toContain(':')
    }
  })

  it('its machinery goes when it falls; its minions stay as plain bricks', () => {
    const s = fight(['minions', 'guards', 'core'])
    turns(s, 1)
    hit(s, 1e9, 'blast')
    expect(s.bricks.some((b) => b.role)).toBe(false)
    expect(s.bricks.length).toBe(2)
  })

  it('rolls fit together: the first is from its own tier, no clashing pair', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const tier of [1, 2, 3] as const) {
        const s = empty(seed)
        const skills = rollTraits(s, tier)
        expect(skills).toHaveLength(tier === 1 ? 2 : tier + 2)
        expect(BOSS_SKILLS[skills[0]].tier).toBe(tier)
        for (const id of skills) expect(BOSS_SKILLS[id].tier).toBeLessThanOrEqual(tier)
        const has = (...ids: BossSkillId[]) => ids.filter((id) => skills.includes(id)).length
        expect(has('shell', 'bulwark', 'underplate', 'heart')).toBeLessThanOrEqual(1)
        expect(has('drifter', 'weaver', 'blink', 'evasive')).toBeLessThanOrEqual(1)
      }
    }
  })

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
        }
      }
      expect(['aim', 'over', 'pick', 'grow']).toContain(s.phase)
    }
  }, 20_000) // many full fights: ~2 s alone, slower when the whole suite runs in parallel
})

describe('boss attacks: they hurt the hero', () => {
  it('thorns hurt the hero on a ball hit, but fire, bombs and lasers break them safely', () => {
    const s = fight(['thorns'])
    const thorns = roleBricks(s, 'thorn')
    expect(thorns.length).toBeGreaterThan(0)
    const hp = s.hp
    damageBrick(s, thorns[0], 1, 'ball')
    expect(s.hp).toBeLessThan(hp)
    expect(drainEvents(s).some((e) => e.type === 'heroHit')).toBe(true)
    const after = s.hp
    damageBrick(s, thorns[0], 1, 'fire')
    damageBrick(s, thorns[0], 1, 'blast')
    expect(s.hp).toBe(after)
  })

  it('thorns take at most 15% of max health in one volley', () => {
    const s = fight(['thorns'])
    const t = roleBricks(s, 'thorn')[0]
    t.hp = t.maxHp = 1e9
    for (let i = 0; i < 500; i++) damageBrick(s, t, 1, 'ball')
    expect(s.maxHp - s.hp).toBeLessThanOrEqual(s.maxHp * 0.15 + 1e-6)
  })

  it('barrage fires missiles that fall two rows a turn and hurt double when they crash', () => {
    const s = fight(['barrage'])
    s.boss!.tier = 2
    s.boss!.turn = s.turn - 2 // due this turn
    bossTurn(s)
    const missiles = roleBricks(s, 'missile')
    expect(missiles).toHaveLength(2)
    const row = missiles[0].row
    bossTurn(s)
    expect(missiles[0].row).toBe(row + 1) // plus the board's own drop each turn: 2 a turn
    const plain = brick(s, 0, dims(s).dangerRow, 10)
    const missile = { ...plain, id: 9999, col: 1, role: 'missile' as const }
    expect(brickBreach(s, missile)).toBeCloseTo(2 * brickBreach(s, plain))
  })

  it('slam warns the turn before, drops every brick a row, and hurts if bricks are close', () => {
    const s = fight(['slam'])
    const b = brick(s, 0, dims(s).dangerRow - 3, 50)
    s.boss!.turn = s.turn - 2
    bossTurn(s)
    expect(drainEvents(s).some((e) => e.type === 'bossWarn' && e.id === 'slam')).toBe(true)
    expect(b.row).toBe(dims(s).dangerRow - 3)
    s.boss!.turn = s.turn - 3
    const hp = s.hp
    bossTurn(s)
    expect(b.row).toBe(dims(s).dangerRow - 2)
    expect(s.hp).toBeLessThan(hp)
  })

  it('hex curses the lowest plain bricks into thorns', () => {
    const s = fight(['hex'])
    const low = brick(s, 0, dims(s).dangerRow - 2, 50)
    s.boss!.turn = s.turn - 4
    bossTurn(s)
    expect(low.role).toBe('thorn')
  })

  it('drain heals the boss from health the hero loses', () => {
    const s = fight(['drain'])
    s.boss!.hp = s.boss!.maxHp / 2
    const before = s.boss!.hp
    hurtHero(s, 20, { x: 0, y: 0 }, 'thorn')
    expect(s.boss!.hp).toBeGreaterThan(before)
  })

  it('every boss rolls at least one attack', () => {
    for (let seed = 1; seed <= 200; seed++)
      for (const tier of [1, 2, 3] as const)
        expect(rollTraits(empty(seed), tier).some((id) => ATTACKS.includes(id))).toBe(true)
  })

  it('weak points spawn tucked against the boss and walled in by wards', () => {
    const s = fight(['core'])
    const core = roleBricks(s, 'core')[0]
    expect(core).toBeTruthy()
    const { left, right, top, bottom } = bossBounds(s)
    const near =
      (core.col === left - 1 || core.col === right + 1) && core.row >= top - 1 && core.row <= bottom
    const above = core.row === top - 1 && core.col >= left && core.col <= right
    expect(near || above).toBe(true)
    expect(roleBricks(s, 'ward').length).toBeGreaterThan(0)
  })
})

describe('boss arena', () => {
  it('grows 2 rows when a boss arrives and shrinks back once the rows are empty', () => {
    const s = empty()
    const rows = s.rows
    spawnBoss(s, ['minions'], 'block')
    expect(s.rows).toBe(rows + BOSS_ROOM)
    s.boss = null
    s.bricks = []
    shrinkArena(s)
    shrinkArena(s)
    expect(s.rows).toBe(rows)
    expect(s.bossRoom).toBe(0)
  })

  it('never shrinks onto a brick (that would make it crash)', () => {
    const s = empty()
    spawnBoss(s, ['minions'], 'block')
    s.boss = null
    s.bricks = []
    brick(s, 0, s.rows - 2, 10)
    const rows = s.rows
    shrinkArena(s)
    expect(s.rows).toBe(rows)
  })
})

describe('bomb exploits on bosses (regressions)', () => {
  it('Row Bomb hits the boss once (20%), however many parts sit in the lowest row', () => {
    const s = fight(['minions'], 'giant') // 4 parts wide
    s.bricks = s.bricks.filter((b) => b.kind === 'boss')
    const boss = s.boss!
    useHelper(s, 'rowBomb')
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.8)
  })

  it('Column Bomb hits the boss once (20%), even down a tall column of parts', () => {
    const s = fight(['minions'], 'giant') // 3 parts tall
    s.bricks = s.bricks.filter((b) => b.kind === 'boss')
    const boss = s.boss!
    useHelper(s, 'colBomb')
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.8)
  })

  it('a core only feels real hits (balls and fireballs), at most 15% of the boss a volley', () => {
    const s = fight(['core'])
    const boss = s.boss!
    const core = roleBricks(s, 'core')[0]
    core.hp = core.maxHp = 1e9
    // Splash (blasts, aftershock, lightning) does nothing to the boss through the core.
    for (const src of ['blast', 'bomb', 'zap'] as const) damageBrick(s, core, 1, src)
    expect(boss.hp).toBe(boss.maxHp)
    // Ball hits do, but capped per volley.
    for (let i = 0; i < 50; i++) damageBrick(s, core, 1, 'ball')
    expect(boss.maxHp - boss.hp).toBeCloseTo(boss.maxHp * 0.15)
    // A new volley resets the cap.
    bossLaunch(s)
    damageBrick(s, core, 1, 'ball')
    expect(boss.maxHp - boss.hp).toBeCloseTo(boss.maxHp * 0.2)
  })
})
