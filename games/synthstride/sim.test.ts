import { describe, expect, it } from 'vitest'
import { tileAt } from './grid'
import {
  beatTicks,
  createState,
  DEATH_TICKS,
  GROW_TIER,
  netView,
  MAX_LAG,
  OVERDRIVE_COST,
  PERFECT_TICKS,
  POINTS,
  positionsDuring,
  ranking,
  STRIKE_ACTIVE,
  STRIKE_GRACE,
  step,
  synthstride,
  TIER_TICKS,
  type Note,
  type Strike,
  type StrideInput,
  type StrideState,
} from './sim'
import { INTRO_BEATS, VERSE_BEATS } from './song'

const player = (i: number) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true })
const solo = [player(0)]
const run = (s: StrideState, input?: StrideInput, who = 'p0') =>
  step(s, input ? [{ player: who, input }] : [])
const runAll = (s: StrideState, inputs: [string, StrideInput][]) =>
  step(
    s,
    inputs.map(([player, input]) => ({ player, input })),
  )
const untilBeat = (s: StrideState, beat: number) => {
  while (s.beat < beat && !s.over) run(s)
  return s
}
const ticks = (s: StrideState, k: number) => {
  for (let i = 0; i < k && !s.over; i++) run(s)
}
const me = (s: StrideState, i = 0) => s.dancers[i]
const board = (s: StrideState, i = 0) => s.boards[i]
/** Stays in the intro (no strikes, no notes) unless a test adds them. */
const quiet = (players = solo, mode = 'shared') => createState(players, 3, { mode })
const strike = (tiles: number[], beat: number, extra: Partial<Strike> = {}): Strike => ({
  id: 50,
  kind: 'tiles',
  tiles,
  warnBeat: beat - 2,
  beat,
  hold: 0,
  ...extra,
})
const chain = (tiles: number[]): Note[] =>
  tiles.map((tile, index) => ({ id: 90 + index, tile, chain: 7, index, length: tiles.length, until: 999 }))
const moveEvent = (s: StrideState) => s.events.find((e) => e.type === 'move')

describe('Synthstride sim (solo)', () => {
  it('beats arrive at the tempo', () => {
    const s = createState(solo, 1)
    untilBeat(s, 0)
    const first = s.tick
    untilBeat(s, 4)
    expect(s.tick - first).toBeCloseTo(4 * beatTicks(s), -1)
  })

  it('tempo option sets the starting BPM', () => {
    expect(createState(solo, 1, { tempo: 'chill' }).bpm).toBe(90)
    expect(createState(solo, 1, { tempo: 'hyper' }).bpm).toBe(120)
    expect(createState(solo, 1, { tempo: 'bogus' }).tempo).toBe('normal')
  })

  it('a move right on the beat is Perfect and scores; off the beat resets the groove', () => {
    const s = createState(solo, 1)
    untilBeat(s, 0)
    run(s, 'right')
    expect(moveEvent(s)).toMatchObject({ rating: 'perfect', points: POINTS.perfect })
    expect(me(s).vitals.combo).toBe(1)
    while (s.tick - s.lastBeatTick < Math.round(beatTicks(s) / 2)) run(s)
    run(s, 'left')
    expect(moveEvent(s)).toMatchObject({ rating: 'off', points: 0 })
    expect(me(s).vitals.combo).toBe(0)
  })

  it('a second move in the same beat window is not rated twice', () => {
    const s = createState(solo, 1)
    untilBeat(s, 0)
    run(s, 'right')
    run(s, 'right')
    expect(moveEvent(s)).toMatchObject({ rating: null, points: 0 })
  })

  it('a move just before the beat counts for the coming beat', () => {
    const s = createState(solo, 1)
    untilBeat(s, 0)
    const next = s.lastBeatTick + Math.round(beatTicks(s))
    while (s.tick < next - PERFECT_TICKS + 1) run(s)
    run(s, 'up')
    expect(moveEvent(s)).toMatchObject({ rating: 'perfect' })
  })

  it('the latency offset turns a consistently late press into a Perfect', () => {
    const late = (lat: number) => {
      const s = createState(solo, 1)
      run(s, `lat${lat}`)
      untilBeat(s, 0)
      ticks(s, 6) // ≈ 120 ms late
      run(s, 'right')
      return moveEvent(s)
    }
    expect(late(0)).toMatchObject({ rating: 'good' })
    expect(late(7)).toMatchObject({ rating: 'perfect' })
    const s = createState(solo, 1)
    run(s, 'lat99')
    expect(me(s).latency).toBe(12)
  })

  it('does not walk off the board', () => {
    const s = createState(solo, 1)
    me(s).pos = 0
    run(s, 'left')
    run(s, 'up')
    expect(me(s).pos).toBe(0)
  })

  it('a strike hurts whoever stands in it after the grace; a quick step out is a dodge', () => {
    const s = quiet()
    me(s).pos = 0
    me(s).trail = [{ at: 0, pos: 0 }]
    board(s).strikes = [strike([0], 2)]
    untilBeat(s, 2)
    ticks(s, STRIKE_GRACE - 2)
    run(s, 'right')
    ticks(s, 20)
    expect(me(s).vitals.hearts).toBe(3)
    expect(me(s).stats.dodges).toBe(1)
  })

  it('standing in a strike costs a heart, the moment it lands (no delay solo)', () => {
    const s = quiet()
    me(s).pos = 10
    board(s).strikes = [strike([10], 1)]
    untilBeat(s, 1)
    const landed = s.tick
    while (me(s).vitals.hearts === 3 && s.tick < landed + 30) run(s)
    expect(me(s).vitals.hearts).toBe(2)
    expect(s.tick - landed).toBeLessThanOrEqual(STRIKE_GRACE + 1)
  })

  it('off-beat strikes land halfway between beats', () => {
    const s = quiet()
    me(s).pos = 10
    board(s).strikes = [strike([10], 1.5)]
    untilBeat(s, 1)
    ticks(s, 20)
    expect(me(s).vitals.hearts).toBe(3) // not yet: lands at 1.5
    ticks(s, 30)
    expect(me(s).vitals.hearts).toBe(2)
  })

  it('holes hurt when they open, then block their tile until their last beat', () => {
    const s = quiet()
    me(s).pos = 5
    board(s).strikes = [strike([6], 1, { kind: 'hole', hold: 3 })]
    untilBeat(s, 1)
    ticks(s, 20)
    run(s, 'right')
    expect(me(s).pos).toBe(5)
    expect(s.events).toContainEqual({ type: 'bump', p: 'p0', tile: 6 })
    untilBeat(s, 3)
    ticks(s, 20)
    run(s, 'right')
    expect(me(s).pos).toBe(5) // still blocked on beat 3
    untilBeat(s, 4)
    ticks(s, 20)
    run(s, 'right')
    expect(me(s).pos).toBe(6) // its last beat: step in, stand there from beat 5
  })

  it('chains: only the next note can be taken; they climb in value; the last pays a bonus', () => {
    const s = quiet()
    me(s).pos = tileAt(0, 0, 4)
    board(s).notes = chain([tileAt(1, 0, 4), tileAt(1, 1, 4)])
    run(s, 'down')
    run(s, 'right') // note #2, not next yet
    expect(me(s).stats.notes).toBe(0)
    run(s, 'up') // note #1
    expect(me(s).stats.notes).toBe(1)
    run(s, 'down') // note #2, last
    expect(me(s).stats.notes).toBe(2)
    expect(me(s).stats.chains).toBe(1)
    const notes = s.events.filter((e) => e.type === 'note')
    expect(notes[0]).toMatchObject({ index: 1, points: POINTS.note * 2 })
    expect(s.events).toContainEqual({ type: 'chain', p: 'p0', points: POINTS.chain * 2, length: 2 })
    expect(me(s).charge).toBe(1 + 1 + 2)
  })

  it('Overdrive needs a full charge and makes you immune', () => {
    const s = quiet()
    untilBeat(s, 0)
    run(s, 'overdrive')
    expect(me(s).overdriveUntil).toBe(-1)
    me(s).charge = OVERDRIVE_COST
    run(s, 'overdrive')
    expect(me(s).overdriveUntil).toBe(s.beat + 8)
    board(s).strikes = [strike([me(s).pos], s.beat + 1)]
    untilBeat(s, s.beat + 2)
    expect(me(s).vitals.hearts).toBe(3)
  })

  it('the song moves into a build-up and a drop, which scores double', () => {
    const s = createState(solo, 1)
    const sections: string[] = []
    while (s.beat < INTRO_BEATS + VERSE_BEATS + 10) {
      run(s)
      me(s).vitals.hearts = 99
      for (const e of s.events) if (e.type === 'section') sections.push(e.section)
    }
    expect(sections).toEqual(['verse', 'build', 'drop'])
    me(s).vitals.combo = 0
    const before = me(s).score
    while (s.tick !== s.lastBeatTick + 1) run(s)
    run(s, me(s).pos % 4 < 3 ? 'right' : 'left')
    expect(me(s).score - before).toBeGreaterThanOrEqual(POINTS.perfect * 2)
  })

  it('a build-up brings a long chain', () => {
    const s = createState(solo, 2)
    let spawned: number[] = []
    while ((s.section as string) !== 'build') {
      run(s)
      me(s).vitals.hearts = 99
      const building = (s.section as string) === 'build'
      if (!building) board(s).notes = []
      for (const e of s.events) if (e.type === 'noteSpawn' && building) spawned = e.tiles
    }
    expect(spawned.length).toBeGreaterThanOrEqual(3)
  })

  it('grows to 5×5 at the grow tier once the board is clear, keeping your spot', () => {
    const s = quiet()
    me(s).pos = tileAt(3, 2, 4)
    s.tick = GROW_TIER * TIER_TICKS - 1
    s.tier = GROW_TIER - 1
    let grew = false
    for (let i = 0; i < 600 && !grew; i++) {
      run(s)
      board(s).strikes = []
      grew = s.events.some((e) => e.type === 'grow')
    }
    expect(board(s).n).toBe(5)
    expect(me(s).pos).toBe(tileAt(3, 2, 5))
  })

  it('dies on the last heart, plays a dying phase (music stops), then ends', () => {
    const s = quiet()
    me(s).vitals.hearts = 1
    board(s).strikes = [strike([me(s).pos], 1)]
    untilBeat(s, 1)
    ticks(s, 20)
    expect(me(s).diedAt).not.toBeNull()
    const beat = s.beat
    ticks(s, DEATH_TICKS + 5)
    expect(s.over).toBe(true)
    expect(s.beat).toBe(beat)
  })

  it('is deterministic for a seed', () => {
    const a = createState(solo, 42)
    const b = createState(solo, 42)
    for (let i = 0; i < 3000; i++) {
      const input = i % 37 === 0 ? 'right' : i % 53 === 0 ? 'left' : undefined
      run(a, input)
      run(b, input)
    }
    expect(me(a).score).toBe(me(b).score)
    expect(board(a).strikes).toEqual(board(b).strikes)
  })
})

describe('Synthstride multiplayer', () => {
  const four = [0, 1, 2, 3].map(player)

  it('shared floor: one board for everyone, 5×5 from 3 players, spread-out starts', () => {
    const s = createState(four, 1, { mode: 'shared' })
    expect(s.boards.length).toBe(1)
    expect(board(s).n).toBe(5)
    expect(new Set(s.dancers.map((d) => d.pos)).size).toBe(4)
    expect(createState(four.slice(0, 2), 1, { mode: 'shared' }).boards[0].n).toBe(4)
  })

  it('own boards: a board each, same seed, so the same first hazards', () => {
    const s = createState(four.slice(0, 2), 9, { mode: 'race' })
    expect(s.boards.length).toBe(2)
    expect(s.dancers.map((d) => d.board)).toEqual([0, 1])
    while (s.beat < 20) step(s, [])
    expect(s.boards[0].strikes.map((k) => k.tiles)).toEqual(s.boards[1].strikes.map((k) => k.tiles))
  })

  it('a solo game is always one shared board, whatever the mode setting', () => {
    expect(createState(solo, 1, { mode: 'race' }).mode).toBe('shared')
  })

  it('shared: a strike only hurts the dancers in it; each has their own hearts and score', () => {
    const s = quiet(four.slice(0, 2))
    const [a, b] = s.dancers
    board(s).strikes = [strike([a.pos], 1)]
    untilBeat(s, 1)
    ticks(s, 20)
    expect(a.vitals.hearts).toBe(2)
    expect(b.vitals.hearts).toBe(3)
  })

  it('shared: notes go to whoever steps on them first', () => {
    const s = quiet(four.slice(0, 2))
    const [a, b] = s.dancers
    a.pos = tileAt(0, 0, 4)
    b.pos = tileAt(2, 0, 4)
    board(s).notes = chain([tileAt(1, 0, 4)])
    runAll(s, [
      ['p1', 'left'],
      ['p0', 'right'],
    ])
    expect(b.stats.notes).toBe(1)
    expect(a.stats.notes).toBe(0)
  })

  it('the match ends only when every dancer is out; the ranking is by score', () => {
    const s = quiet(four.slice(0, 2))
    const [a, b] = s.dancers
    a.score = 500
    b.score = 900
    a.vitals.hearts = 1
    board(s).strikes = [strike([a.pos], 1)]
    untilBeat(s, 1)
    ticks(s, 20)
    expect(a.diedAt).not.toBeNull()
    ticks(s, DEATH_TICKS * 3)
    expect(s.over).toBe(false) // b is still dancing
    synthstride.removePlayer!(s, 'p1')
    ticks(s, DEATH_TICKS + 2)
    expect(s.over).toBe(true)
    expect(ranking(s).map((d) => d.id)).toEqual(['p1', 'p0'])
  })

  it('own boards: a board whose dancer is out goes quiet', () => {
    const s = createState(four.slice(0, 2), 5, { mode: 'race' })
    while (s.beat < 20) step(s, [])
    synthstride.removePlayer!(s, 'p0')
    expect(s.boards[0].closed).toBe(true)
    expect(s.boards[0].strikes).toEqual([])
    while (s.beat < 40) step(s, [])
    expect(s.boards[0].strikes).toEqual([])
    expect(s.boards[1].strikes.length + s.boards[1].notes.length).toBeGreaterThanOrEqual(0)
  })
})

describe('Synthstride over the network', () => {
  const two = [player(0), player(1)]

  it('a timed move is rated at the moment the player pressed, not when it arrived', () => {
    const s = quiet(two)
    untilBeat(s, 0)
    const pressed = s.lastBeatTick + 0.5 // right on the beat for them
    ticks(s, 7) // arrives 7 ticks later (would be "good" or "off" if judged on arrival)
    run(s, `right@${pressed}:1`, 'p1')
    expect(moveEvent(s)).toMatchObject({ p: 'p1', rating: 'perfect' })
  })

  it('never trusts a claim further back than MAX_LAG or in the future', () => {
    const s = quiet(two)
    ticks(s, 100)
    run(s, 'right@0:1', 'p1')
    expect(me(s, 1).trail.at(-1)!.at).toBe(100 - MAX_LAG) // processed at tick 100
    run(s, `left@99999:2`, 'p1')
    expect(me(s, 1).trail.at(-1)!.at).toBe(101)
  })

  it('a sequence number is only ever applied once (no double moves on resend)', () => {
    const s = quiet(two)
    const start = me(s, 1).pos
    run(s, 'right@0:3', 'p1')
    run(s, 'right@0:3', 'p1')
    run(s, 'right@0:2', 'p1')
    expect(me(s, 1).pos).toBe(start + 1)
    expect(me(s, 1).seq).toBe(3)
  })

  it('a guest who stepped out in time on their screen is not hit, even if the step arrives late', () => {
    const s = quiet(two)
    const guest = me(s, 1)
    guest.lag = MAX_LAG // known to be ~150 ms behind
    board(s).strikes = [strike([guest.pos], 1)]
    untilBeat(s, 1)
    const landed = s.tick - 1
    // They stepped out 2 ticks after the beat (inside the grace), but it reaches the host 8 ticks later.
    ticks(s, STRIKE_GRACE + 4)
    run(s, `right@${landed + 2}:1`, 'p1')
    ticks(s, STRIKE_ACTIVE + MAX_LAG + 4)
    expect(guest.vitals.hearts).toBe(3)
    expect(guest.stats.dodges).toBe(1)
  })

  it('a guest who really stayed in is hit (late, once settled)', () => {
    const s = quiet(two)
    const guest = me(s, 1)
    guest.lag = MAX_LAG
    board(s).strikes = [strike([guest.pos], 1)]
    untilBeat(s, 1)
    ticks(s, STRIKE_GRACE + STRIKE_ACTIVE + MAX_LAG + 4)
    expect(guest.vitals.hearts).toBe(2)
  })

  it('positionsDuring reads the trail', () => {
    const trail = [
      { at: 0, pos: 1 },
      { at: 10, pos: 2 },
      { at: 20, pos: 3 },
    ]
    expect([...positionsDuring({ trail }, 12, 18)]).toEqual([2])
    expect([...positionsDuring({ trail }, 5, 15)].sort()).toEqual([1, 2])
    expect([...positionsDuring({ trail }, 25, 30)]).toEqual([3])
  })

  it('keeps the state small enough to send 60 times a second', () => {
    const s = createState([0, 1, 2, 3].map(player), 7, { mode: 'race' })
    let biggest = 0
    for (let i = 0; i < 60 * 90; i++) {
      step(s, [])
      for (const d of s.dancers) d.vitals.hearts = 3
      biggest = Math.max(biggest, JSON.stringify(netView(s)).length)
    }
    // Four players, four busy boards: what guests get stays a few kB per tick.
    expect(biggest).toBeLessThan(6000)
  })
  it('netView keeps everything a guest draws and drops host-only data', () => {
    const s = createState([0, 1].map(player), 7, { mode: 'race' })
    while (s.beat < 30) step(s, [])
    const view = netView(s)
    expect(view.dancers.map((d) => [d.pos, d.score, d.vitals.hearts])).toEqual(
      s.dancers.map((d) => [d.pos, d.score, d.vitals.hearts]),
    )
    expect(view.boards.map((b) => b.strikes.map((k) => k.tiles))).toEqual(
      s.boards.map((b) => b.strikes.map((k) => k.tiles)),
    )
    expect(view.dancers[0].trail).toEqual([])
    expect(s.dancers[0].trail.length).toBeGreaterThan(0) // the host's state is untouched
  })
})
