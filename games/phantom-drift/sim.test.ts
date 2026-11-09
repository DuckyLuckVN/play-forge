import { describe, expect, it } from 'vitest'
import {
  BASE_PERKS,
  comboMultiplier,
  createState,
  DEATH_TICKS,
  HEART_REGEN_TICKS,
  INVULN_TICKS,
  laneCount,
  multiplier,
  PHANTOM_COST,
  PHANTOM_TICKS,
  phantomDrift,
  rowIntervalTicks,
  speedAt,
  step,
  TIER_TICKS,
  type DriftInput,
  type DriftState,
  type Obj,
  type Perks,
} from './sim'

const me = [{ id: 'p0', name: 'P0', slot: 0, ready: true, connected: true }]
const send = (input: DriftInput) => [{ player: 'p0', input }]

/** A quiet state: nothing spawns unless a test places it. */
function quiet(): DriftState {
  const s = createState(me, 1)
  s.spawnIn = Infinity
  return s
}

function place(s: DriftState, obj: Omit<Obj, 'id' | 'row'>): Obj {
  const o = { id: s.nextId++, row: 0, ...obj } as Obj
  s.objects.push(o)
  return o
}

function run(s: DriftState, ticks: number, input?: DriftInput) {
  for (let i = 0; i < ticks; i++) step(s, i === 0 && input ? send(input) : [])
  return s
}

const events = (s: DriftState, ticks: number) => {
  const all: string[] = []
  for (let i = 0; i < ticks; i++) {
    step(s, [])
    all.push(...s.events.map((e) => e.type))
  }
  return all
}

describe('Phantom Drift sim', () => {
  it('starts in the middle of 3 lanes with full hearts', () => {
    const s = quiet()
    expect(s.lanes).toBe(3)
    expect(s.player.x).toBe(1)
    expect(s.player.hearts).toBe(3)
  })

  it('is deterministic per seed', () => {
    const a = createState(me, 9)
    const b = createState(me, 9)
    for (let i = 0; i < 900; i++) {
      step(a, i % 37 === 0 ? send('left') : [])
      step(b, i % 37 === 0 ? send('left') : [])
    }
    expect(a).toEqual(b)
  })

  it('slides one lane per press, clamped to the rift', () => {
    const s = quiet()
    run(s, 10, 'left')
    expect(s.player.x).toBe(0)
    run(s, 10, 'left')
    expect(s.player.x).toBe(0)
    step(s, send('right'))
    expect(s.player.x).toBeGreaterThan(0)
    expect(s.player.x).toBeLessThan(1)
    run(s, 10)
    expect(s.player.x).toBe(1)
  })

  it('ignores junk input', () => {
    const s = quiet()
    step(s, [{ player: 'p0', input: 'jump' as DriftInput }])
    expect(s.player.x).toBe(1)
  })

  it('loses a heart on a shard, then is briefly untouchable', () => {
    const s = quiet()
    place(s, { kind: 'shard', lane: 1, z: 6 })
    place(s, { kind: 'shard', lane: 1, z: 20 })
    const seen = events(s, 30)
    expect(seen.filter((e) => e === 'hit')).toHaveLength(1)
    expect(s.player.hearts).toBe(2)
    expect(s.player.invulnUntil).toBeGreaterThan(s.tick)
    run(s, INVULN_TICKS)
    place(s, { kind: 'shard', lane: 1, z: 4 })
    run(s, 10)
    expect(s.player.hearts).toBe(1)
  })

  it('dodging a shard in time is safe and close dodges are near misses', () => {
    const s = quiet()
    place(s, { kind: 'shard', lane: 1, z: 7 })
    step(s, send('left'))
    const seen = events(s, 30)
    expect(seen).not.toContain('hit')
    expect(seen).toContain('nearMiss')
    expect(s.player.combo).toBe(1)
    expect(s.score).toBeGreaterThanOrEqual(50)
  })

  it('an early dodge is safe but not a near miss', () => {
    const s = quiet()
    place(s, { kind: 'shard', lane: 1, z: 60 })
    step(s, send('left'))
    const seen = events(s, 120)
    expect(seen).not.toContain('hit')
    expect(seen).not.toContain('nearMiss')
  })

  it('a wall only spares its gap', () => {
    const hit = quiet()
    place(hit, { kind: 'wall', lane: 0, gap: 0, z: 10 })
    expect(events(hit, 40)).toContain('hit')
    const safe = quiet()
    place(safe, { kind: 'wall', lane: 1, gap: 1, z: 10 })
    expect(events(safe, 40)).not.toContain('hit')
  })

  it('a sweeper hits the lane it reaches the player on', () => {
    const s = quiet()
    place(s, { kind: 'sweeper', lane: 2, from: 2, to: 1, z: 30 })
    expect(events(s, 60)).toContain('hit')
    const t = quiet()
    place(t, { kind: 'sweeper', lane: 1, from: 1, to: 2, z: 30 })
    run(t, 1, 'left')
    expect(events(t, 60)).not.toContain('hit')
  })

  it('collects wisps for score, combo and Phantom charge', () => {
    const s = quiet()
    place(s, { kind: 'wisp', lane: 1, z: 5 })
    expect(events(s, 20)).toContain('wisp')
    expect(s.player.charge).toBe(1)
    expect(s.player.combo).toBe(1)
    expect(s.objects.find((o) => o.kind === 'wisp')).toBeUndefined()
  })

  it('Phantom needs a full meter and lets hazards pass through', () => {
    const s = quiet()
    step(s, send('phase'))
    expect(s.player.phantomUntil).toBeLessThanOrEqual(s.tick)
    s.player.charge = PHANTOM_COST
    step(s, send('phase'))
    expect(s.player.charge).toBe(0)
    expect(s.events.map((e) => e.type)).toContain('phantom')
    place(s, { kind: 'shard', lane: 1, z: 8 })
    expect(events(s, 30)).not.toContain('hit')
    expect(s.player.hearts).toBe(3)
    expect(events(s, PHANTOM_TICKS)).toContain('phantomEnd')
  })

  it('fallers telegraph above the player lane and slam it', () => {
    const s = quiet()
    s.drops.push({ at: s.tick + 60, count: 1 })
    run(s, 59)
    expect(s.fallers).toHaveLength(1)
    expect(s.fallers[0].lane).toBe(1)
    expect(events(s, 10)).toContain('hit')
  })

  it('dodging a faller late is a near miss', () => {
    const s = quiet()
    s.drops.push({ at: s.tick + 60, count: 1 })
    run(s, 55)
    step(s, send('right'))
    const seen = events(s, 10)
    expect(seen).not.toContain('hit')
    expect(seen).toContain('nearMiss')
  })

  it('a hit breaks the combo multiplier', () => {
    const s = quiet()
    s.player.combo = 12
    expect(multiplier(s.player.combo)).toBe(3)
    place(s, { kind: 'shard', lane: 1, z: 4 })
    run(s, 10)
    expect(s.player.combo).toBe(0)
    expect(multiplier(40)).toBe(5)
  })

  it('heals one heart after a long time without a hit', () => {
    const s = quiet()
    place(s, { kind: 'shard', lane: 1, z: 4 })
    run(s, 10)
    expect(s.player.hearts).toBe(2)
    expect(events(s, HEART_REGEN_TICKS)).toContain('heal')
    expect(s.player.hearts).toBe(3)
  })

  it('dies on the last heart, plays out a dying phase, then ends', () => {
    const s = quiet()
    s.player.hearts = 1
    place(s, { kind: 'shard', lane: 1, z: 4 })
    const seen = events(s, 10)
    expect(seen).toContain('die')
    expect(s.over).toBe(false)
    expect(s.diedAt).not.toBeNull()
    run(s, DEATH_TICKS - 12)
    expect(s.over).toBe(false)
    expect(events(s, 5)).toContain('over')
    expect(s.over).toBe(true)
    expect(phantomDrift.isFinished(s)).toBe(true)
    const frozen = s.tick
    step(s, [])
    expect(s.tick).toBe(frozen)
  })

  it('while dying: no input, no hits, no score, the world slows to a stop', () => {
    const s = quiet()
    s.player.hearts = 1
    place(s, { kind: 'shard', lane: 1, z: 4 })
    run(s, 10)
    const score = s.score
    const x = s.player.x
    const diedDist = s.diedDist
    place(s, { kind: 'shard', lane: 1, z: 3 })
    step(s, send('left'))
    const seen = events(s, 30)
    expect(s.player.x).toBe(x)
    expect(seen).not.toContain('hit')
    expect(s.score).toBe(score)
    expect(s.diedDist).toBe(diedDist)
    run(s, DEATH_TICKS - 45)
    expect(s.speed).toBeLessThan(speedAt(0) * 0.05)
  })

  it('speeds up by tier and widens the rift at tiers 3 and 5', () => {
    expect(speedAt(0)).toBeLessThan(speedAt(9))
    expect(speedAt(9) / speedAt(0)).toBeCloseTo(2.4)
    expect(speedAt(20)).toBe(speedAt(9))
    expect([0, 2, 3, 4, 5, 9].map(laneCount)).toEqual([3, 3, 4, 4, 5, 5])
    expect(rowIntervalTicks(0)).toBeGreaterThan(rowIntervalTicks(9))
    expect(rowIntervalTicks(30)).toBeGreaterThanOrEqual(36)
    const s = quiet()
    const seen = events(s, TIER_TICKS * 3 + 1)
    expect(seen.filter((e) => e === 'tier')).toHaveLength(3)
    expect(seen).toContain('lanes')
    expect(s.lanes).toBe(4)
  })

  it('scores distance over time', () => {
    const s = quiet()
    run(s, 600)
    expect(s.score).toBeGreaterThan(50)
    expect(s.dist).toBeCloseTo(speedAt(0) * 10)
  })
})

describe('Phantom Drift run stats', () => {
  it('counts wisps, near misses, best combo and Phantoms', () => {
    const s = quiet()
    place(s, { kind: 'wisp', lane: 1, z: 5 })
    run(s, 15)
    place(s, { kind: 'shard', lane: 1, z: 7 })
    step(s, send('left'))
    run(s, 30)
    s.player.charge = PHANTOM_COST
    step(s, send('phase'))
    expect(s.stats).toMatchObject({ wisps: 1, nearMisses: 1, bestCombo: 2, phantoms: 1 })
  })

  it('remembers the best combo after a hit resets it', () => {
    const s = quiet()
    s.player.combo = 6
    place(s, { kind: 'wisp', lane: 1, z: 4 })
    run(s, 10)
    place(s, { kind: 'shard', lane: 1, z: 4 })
    run(s, 10)
    expect(s.player.combo).toBe(0)
    expect(s.stats.bestCombo).toBe(7)
  })

  it('announces a higher multiplier once per level', () => {
    const s = quiet()
    s.player.combo = 4
    place(s, { kind: 'wisp', lane: 1, z: 4 })
    const seen: unknown[] = []
    for (let i = 0; i < 10; i++) {
      step(s, [])
      seen.push(...s.events.filter((e) => e.type === 'multiplier'))
    }
    expect(seen).toEqual([{ type: 'multiplier', mult: 2 }])
  })

  it('warns when a faller starts its telegraph, with how long it takes', () => {
    const s = quiet()
    s.drops.push({ at: s.tick + 60, count: 1 })
    const warns: unknown[] = []
    for (let i = 0; i < 60; i++) {
      step(s, [])
      warns.push(...s.events.filter((e) => e.type === 'warn'))
    }
    expect(warns).toHaveLength(1)
    expect(warns[0]).toMatchObject({ type: 'warn', lane: 1 })
    expect((warns[0] as { ticks: number }).ticks).toBeGreaterThan(20)
  })

  it('tracks top speed', () => {
    const s = quiet()
    run(s, TIER_TICKS * 2 + 1)
    expect(s.stats.topSpeed).toBe(speedAt(2))
  })
})

describe('Phantom Drift perks', () => {
  const with_ = (perks: Partial<Perks>) => {
    const s = createState(me, 1, { ...BASE_PERKS, ...perks })
    s.spawnIn = Infinity
    return s
  }
  /** A close dodge: the shard arrives 10 ticks after the ghost leaves its lane. */
  const closeDodge = (s: DriftState) => {
    place(s, { kind: 'shard', lane: 1, z: 13 })
    step(s, send('left'))
    return events(s, 30)
  }

  it('the default is the plain ghost', () => {
    expect(createState(me, 1).perks).toEqual(BASE_PERKS)
    expect(BASE_PERKS).toEqual({
      comboStep: 5,
      phantomTicks: PHANTOM_TICKS,
      regenTicks: HEART_REGEN_TICKS,
      nearWindow: 9,
      wispPoints: 10,
      phantomCost: PHANTOM_COST,
    })
  })

  it('combo step: the multiplier climbs every 4 instead of 5', () => {
    const s = with_({ comboStep: 4 })
    s.player.combo = 3
    place(s, { kind: 'wisp', lane: 1, z: 5 })
    const seen = events(s, 20)
    expect(seen).toContain('multiplier')
    expect(comboMultiplier(s)).toBe(2)
    const plain = quiet()
    plain.player.combo = 3
    place(plain, { kind: 'wisp', lane: 1, z: 5 })
    expect(events(plain, 20)).not.toContain('multiplier')
    expect(multiplier(16, 4)).toBe(5)
    expect(multiplier(40, 4)).toBe(5)
  })

  it('phantom ticks: Phantom lasts longer', () => {
    const s = with_({ phantomTicks: 150 })
    s.player.charge = PHANTOM_COST
    step(s, send('phase'))
    expect(s.player.phantomUntil - s.tick).toBe(149)
  })

  it('regen ticks: hearts regrow sooner', () => {
    const s = with_({ regenTicks: 36 * 60 })
    place(s, { kind: 'shard', lane: 1, z: 4 })
    run(s, 10)
    expect(s.player.hearts).toBe(2)
    expect(events(s, 36 * 60)).toContain('heal')
  })

  it('near window: a 10-tick dodge is a near miss only with the wider window', () => {
    expect(closeDodge(quiet())).not.toContain('nearMiss')
    const seen = closeDodge(with_({ nearWindow: 11 }))
    expect(seen).toContain('nearMiss')
    expect(seen).not.toContain('hit')
  })

  it('Phantom cost: a bigger ring to fill', () => {
    const s = with_({ wispPoints: 12, phantomCost: 12 })
    s.player.charge = 10
    step(s, send('phase'))
    expect(s.player.phantomUntil).toBe(0)
    s.player.charge = 11
    place(s, { kind: 'wisp', lane: 1, z: 5 })
    expect(events(s, 20)).toContain('charged')
    expect(s.player.charge).toBe(12)
    step(s, send('phase'))
    expect(s.player.phantomUntil).toBeGreaterThan(s.tick)
  })

  it('wisp points: a wisp scores 12 instead of 10', () => {
    const s = with_({ wispPoints: 12 })
    const got: number[] = []
    place(s, { kind: 'wisp', lane: 1, z: 5 })
    for (let i = 0; i < 20; i++) {
      step(s, [])
      for (const e of s.events) if (e.type === 'wisp') got.push(e.points)
    }
    expect(got).toEqual([12])
  })
})
