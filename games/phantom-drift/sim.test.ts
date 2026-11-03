import { describe, expect, it } from 'vitest'
import {
  createState,
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

  it('ends when the last heart is gone', () => {
    const s = quiet()
    s.player.hearts = 1
    place(s, { kind: 'shard', lane: 1, z: 4 })
    run(s, 10)
    expect(s.over).toBe(true)
    expect(phantomDrift.isFinished(s)).toBe(true)
    const frozen = s.tick
    step(s, [])
    expect(s.tick).toBe(frozen)
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
  })
})
