import { describe, expect, it } from 'vitest'
import { ABILITY, type Strike } from './ability'
import { answersPrediction, GuestShuttle, PREDICT, type OwnSwing } from './guestshuttle'
import { courtDims } from './courtsize'
import { solveLaunch, type Vec3 } from './physics'
import { hitPower } from './power'
import { launchShot, shotTarget } from './shots'
import { RenderClock } from './renderclock'
import { clampDir, createState, MAX_REWIND, step, type SpEvent, type SpInput, type SpState } from './sim'
import type { InputEvent } from '@forge/net/session'

const DT = 1 / 60

function rally(pos: Vec3, vel: Vec3): SpState {
  const s = createState(
    [
      { id: 'a', name: 'A', slot: 0, ready: true },
      { id: 'b', name: 'B', slot: 1, ready: true },
    ] as never,
    1,
  )
  s.phase = 'rally'
  s.phaseT = 0
  s.shuttle.lastHitter = 0
  s.shuttle.pending = null
  s.shuttle.pos = { ...pos }
  s.shuttle.vel = { ...vel }
  return s
}

/** host[n] = state at tick (start tick + n); host[0] is the initial state. */
function host(s: SpState, n: number): SpState[] {
  const out = [structuredClone(s)]
  for (let i = 0; i < n; i++) {
    step(s, [])
    out.push(structuredClone(s))
  }
  return out
}

const clear = () => {
  const s = rally({ x: 0, y: 1.2, z: -5 }, { x: 0, y: 0, z: 0 })
  s.shuttle.vel = solveLaunch(s.shuttle.pos, { x: 0, z: 5.5 }, 50, 30)
  return s
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
})

/** Drive one frame per tick (60 Hz); `drop` ticks are never delivered. Returns [drawn, expected] per frame. */
function run(states: SpState[], drop: (tick: number) => boolean) {
  const clock = new RenderClock(60)
  const gs = new GuestShuttle(clock)
  const base = states[0].tick
  const out: { got: Vec3; want: Vec3 }[] = []
  for (let n = 0; n < states.length; n++) {
    const s = states[n]
    if (!drop(s.tick)) {
      clock.onState(s.tick)
      gs.push(s)
    }
    clock.update(DT)
    gs.update(DT)
    const i = Math.floor(clock.tick) - base
    if (n < 4 || i + 1 >= states.length || i < 0) continue
    const want = lerp(states[i].shuttle.pos, states[i + 1].shuttle.pos, clock.tick - Math.floor(clock.tick))
    out.push({ got: { ...gs.pos }, want })
  }
  return out
}

function expectClose(frames: { got: Vec3; want: Vec3 }[]) {
  expect(frames.length).toBeGreaterThan(5)
  for (const { got, want } of frames) {
    expect(got.x).toBeCloseTo(want.x, 9)
    expect(got.y).toBeCloseTo(want.y, 9)
    expect(got.z).toBeCloseTo(want.z, 9)
  }
}

describe('GuestShuttle', () => {
  it('matches the host flight exactly with no jitter', () => {
    expectClose(run(host(clear(), 50), () => false))
  })

  it('extrapolates the exact host flight through a 5-tick gap', () => {
    const states = host(clear(), 50)
    const t0 = states[20].tick
    expectClose(run(states, (t) => t >= t0 && t < t0 + 5))
  })

  it('stops at the floor like the sim', () => {
    const states = host(rally({ x: 0.3, y: 1, z: -2 }, { x: 0.5, y: 0, z: 1 }), 80)
    const landing = states.findIndex((s) => s.shuttle.pos.y === 0 && s.phase === 'point')
    expect(landing).toBeGreaterThan(8)
    const t0 = states[landing - 2].tick
    const frames = run(states, (t) => t >= t0 && t < t0 + 5)
    expectClose(frames)
    expect(Math.min(...frames.map((f) => f.got.y))).toBeGreaterThanOrEqual(0)
    expect(frames[frames.length - 1].got.z).toBeCloseTo(states[landing].shuttle.pos.z, 9)
  })

  it('stops on the net like the sim', () => {
    const states = host(rally({ x: 0, y: 0.8, z: -1.5 }, { x: 0, y: 0.5, z: 12 }), 50)
    const net = states.findIndex((s) => s.events.some((e) => e.k === 'net'))
    expect(net).toBeGreaterThan(2)
    const t0 = states[net - 1].tick
    const frames = run(states, (t) => t >= t0 && t < t0 + 5)
    expectClose(frames)
    expect(Math.max(...frames.map((f) => f.got.z))).toBeLessThan(0)
  })

  it('snaps and holds the newest position outside flight', () => {
    const states = host(clear(), 10)
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    const serve = structuredClone(states[10])
    serve.phase = 'serve'
    serve.shuttle.pos = { x: 1, y: 1, z: 6 }
    clock.onState(serve.tick)
    gs.push(serve)
    clock.update(DT)
    gs.update(DT)
    expect(gs.snapped).toBe(true)
    expect(gs.pos).toEqual(serve.shuttle.pos)
  })

  it('does not run a sample past a later hit', () => {
    const states = host(clear(), 30)
    const hitAt = states[20].tick
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    gs.push(states[10])
    // The hit-tick sample was lost; a later one carries the event and the new flight.
    const later = structuredClone(states[25])
    later.shuttle.vel = { x: 0, y: 3, z: -20 }
    later.events = [{ id: 1, tick: hitAt, k: 'hit', side: 1, grade: 'good', shot: 'clear' } as never]
    gs.push(later)
    clock.onState(later.tick)
    clock.tick = hitAt + 2
    gs.update(DT)
    // Without the break check sample 10 would run on past the hit and show the old path here.
    expect(gs.pos.x).toBeCloseTo(later.shuttle.pos.x, 9)
    expect(gs.pos.y).toBeCloseTo(later.shuttle.pos.y, 9)
    expect(gs.pos.z).toBeCloseTo(later.shuttle.pos.z, 9)
  })

  it('a late hit bends onto the new path without a jump', () => {
    const s = clear()
    const states: SpState[] = [structuredClone(s)]
    let hit: SpState['events'][number] | undefined
    for (let i = 0; i < 60; i++) {
      step(s, [])
      states.push(structuredClone(s))
      if (i === 19) {
        // A hit on this tick: flight reverses toward the other end. Events persist a while, like the sim's.
        s.shuttle.lastHitter = 1
        s.shuttle.vel = solveLaunch(s.shuttle.pos, { x: 0, z: -5.5 }, 40, 30)
        states[states.length - 1] = structuredClone(s)
        hit = { id: 1, tick: s.tick, k: 'hit', side: 1, grade: 'good', shot: 'clear' } as never
      }
      if (hit && i >= 19 && i < 29) states[states.length - 1].events = [hit]
    }
    const hitTick = states[20].tick
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    const base = states[0].tick
    let prev: Vec3 | null = null
    let worst = 0
    const recent: number[] = []
    let settled = 0
    for (let n = 0; n < states.length; n++) {
      const t = states[n].tick
      // Nothing delivered for the 4 ticks around the hit, then the burst.
      if (t < hitTick - 1 || t > hitTick + 2 || t === hitTick + 3) {
        clock.onState(t)
        gs.push(states[n])
      }
      clock.update(DT)
      gs.update(DT)
      const i = Math.floor(clock.tick) - base
      if (n < 4 || i + 1 >= states.length) continue
      const a = states[i].shuttle.pos
      const b = states[i + 1].shuttle.pos
      const want = lerp(a, b, clock.tick - Math.floor(clock.tick))
      // The old path keeps its speed until the burst, so measure against the fastest recent host segment.
      recent.push(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / DT)
      if (recent.length > 6) recent.shift()
      const speed = Math.max(...recent)
      if (prev && !gs.snapped) {
        const d = Math.hypot(gs.pos.x - prev.x, gs.pos.y - prev.y, gs.pos.z - prev.z)
        worst = Math.max(worst, d / (speed * DT))
      }
      expect(gs.snapped).toBe(false)
      if (t >= hitTick + 3 + 18)
        settled = Math.max(settled, Math.hypot(gs.pos.x - want.x, gs.pos.y - want.y, gs.pos.z - want.z))
      prev = { ...gs.pos }
    }
    expect(worst).toBeLessThanOrEqual(1.6)
    expect(settled).toBeLessThan(0.02)
  })

  it('a serve placement snaps', () => {
    const states = host(clear(), 10)
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    for (const s of states.slice(0, 8)) {
      clock.onState(s.tick)
      gs.push(s)
      clock.update(DT)
      gs.update(DT)
    }
    const serve = structuredClone(states[9])
    serve.phase = 'serve'
    serve.shuttle.pos = { x: 1, y: 1, z: 4 }
    clock.onState(serve.tick)
    gs.push(serve)
    clock.update(DT)
    gs.update(DT)
    expect(gs.snapped).toBe(true)
    expect(gs.pos).toEqual(serve.shuttle.pos)
  })

  it('a flight-phase serve event snaps instead of bending', () => {
    const states = host(clear(), 12)
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    for (const s of states.slice(0, 8)) {
      clock.onState(s.tick)
      gs.push(s)
      clock.update(DT)
      gs.update(DT)
    }
    const placed = structuredClone(states[10])
    // < RECONCILE.snap from the shown path so only the serve-break path can cause the snap.
    placed.shuttle.pos = { ...states[8].shuttle.pos }
    placed.shuttle.pos.x += 0.5
    placed.events = [{ id: 2, tick: placed.tick - 1, k: 'serve' } as never]
    clock.onState(placed.tick)
    gs.push(placed)
    clock.update(DT)
    gs.update(DT)
    expect(gs.snapped).toBe(true)
  })

  it('shuttle follows a clock resync', () => {
    const states = host(clear(), 200)
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    const base = states[0].tick
    for (let n = 0; n < 6; n++) {
      clock.onState(states[n].tick)
      gs.push(states[n])
      clock.update(DT)
      gs.update(DT)
    }
    for (let f = 0; f < 120; f++) {
      clock.update(DT)
      gs.update(DT)
    }
    const s = states[130]
    clock.onState(s.tick)
    gs.push(s)
    clock.update(DT)
    gs.update(DT)
    const i = Math.floor(clock.tick) - base
    const want = lerp(states[i].shuttle.pos, states[i + 1].shuttle.pos, clock.tick - Math.floor(clock.tick))
    expect(Math.abs(gs.pos.x - want.x)).toBeLessThan(1e-9)
    expect(Math.abs(gs.pos.y - want.y)).toBeLessThan(1e-9)
    expect(Math.abs(gs.pos.z - want.z)).toBeLessThan(1e-9)
  })
})

// ---- Own-hit prediction: the guest (seat b, side 1) and the real host sim over a jittery link. ----

const TICK_MS = 1000 / 60
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })

/** A slow serve-like lob dropping toward seat b (side 1): it passes b at (0.3, 4.0) around y ≈ 1.9 m. */
function incoming(host: { x: number; z: number } = { x: 0.3, z: 4 }): SpState {
  const s = rally({ x: 0, y: 1.6, z: -3 }, { x: 0, y: 0, z: 0 })
  s.shuttle.vel = solveLaunch(s.shuttle.pos, { x: 0, z: 5.5 }, 25, 40)
  s.players[1].x = host.x
  s.players[1].z = host.z
  // The rally began with a serve: its event is still in the state's recent events (a serve return).
  s.events = [{ id: 0, tick: s.tick, k: 'serve', side: 0 }]
  return s
}

interface CoFrame {
  tick: number
  pos: Vec3
}

/**
 * Host sim + guest view, both on fake time: host ticks every TICK_MS; states reach the guest after
 * 40 + 0..25 ms (RTT ~100 ms, 25 ms jitter, ordered); the guest's swing reaches the host after
 * `inputMs` (default the same link). The guest swings on the first frame `when(seenTick)` holds.
 */
function coSim(o: {
  state: SpState
  /** The guest's own predicted spot (reach is judged from it). */
  guestAt: { x: number; z: number }
  held: { x: number; z: number }
  when: (seen: number) => boolean
  inputMs?: number
  seed?: number
  ticks?: number
}) {
  let x = (o.seed ?? 1) >>> 0 || 1
  const rnd = () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296
  const s = o.state
  const base = s.tick
  const host: SpState[] = [structuredClone(s)]
  const sent: { at: number; state: SpState }[] = []
  const inputs: { at: number; ev: InputEvent<SpInput> }[] = []
  const clock = new RenderClock(60)
  const gs = new GuestShuttle(clock)
  const frames: CoFrame[] = []
  let lastArr = -Infinity
  let next = 0
  let swingFrame = -1
  let predicted = false
  /** gs.predicted() on the first frame the host's hit confirmed the prediction. */
  let confirmed: ReturnType<GuestShuttle['predicted']> | undefined
  /** Frame index at which each host tick arrived. */
  const arrivedAt = new Map<number, number>()
  const end = (o.ticks ?? 110) * TICK_MS
  for (let t = 7; t <= end; t += TICK_MS) {
    // Host ticks due by now.
    while ((s.tick + 1 - base) * TICK_MS <= t) {
      const tt = (s.tick + 1 - base) * TICK_MS
      const due = inputs.filter((i) => i.at <= tt)
      for (const d of due) inputs.splice(inputs.indexOf(d), 1)
      step(
        s,
        due.map((d) => d.ev),
      )
      const c = structuredClone(s)
      host.push(c)
      sent.push({ at: (lastArr = Math.max(lastArr, tt + 40 + rnd() * 25)), state: c })
    }
    while (next < sent.length && sent[next].at <= t) {
      const st = sent[next++].state
      clock.onState(st.tick)
      gs.push(st)
      arrivedAt.set(st.tick, frames.length)
      if (confirmed === undefined && gs['pred'] && gs['pred'].until !== Infinity) confirmed = gs.predicted()
    }
    clock.update(DT)
    gs.update(DT)
    frames.push({ tick: clock.tick, pos: { ...gs.pos } })
    if (swingFrame < 0 && next > 0 && o.when(clock.seenTick())) {
      swingFrame = frames.length - 1
      const tick = clock.seenTick()
      const sw: OwnSwing = { side: 1, held: o.held, charge: 0, player: o.guestAt, tap: false }
      predicted = gs.predictHit(sw)
      inputs.push({
        at: t + (o.inputMs ?? 40 + rnd() * 25),
        ev: { player: 'b', input: { t: 'swing', x: o.held.x, z: o.held.z, tick } },
      })
    }
  }
  /** The host's flight at fractional state tick k. */
  const hostAt = (k: number): Vec3 => {
    const i = Math.floor(k) - base
    const a = host[Math.min(i, host.length - 1)].shuttle.pos
    const b = host[Math.min(i + 1, host.length - 1)].shuttle.pos
    return lerp(a, b, k - Math.floor(k))
  }
  const own = (k: 'hit' | 'whiff') =>
    host[host.length - 1].events.find((e) => e.k === k && 'side' in e && e.side === 1) ??
    host.flatMap((h) => h.events).find((e) => e.k === k && 'side' in e && e.side === 1)
  return { frames, host, base, hostAt, own, swingFrame, predicted, arrivedAt, gs, confirmed }
}

/** First state tick the closest approach of the shuttle to seat b (history tick = state tick + 1). */
function closest(s: SpState, at: { x: number; z: number }): number {
  const c = structuredClone(s)
  let best = Infinity
  let tick = 0
  for (let i = 0; i < 90; i++) {
    const d = Math.hypot(c.shuttle.pos.x - at.x, c.shuttle.pos.z - at.z)
    if (d < best) {
      best = d
      tick = c.tick + 1
    }
    step(c, [])
  }
  return tick
}

describe('GuestShuttle own-hit prediction', () => {
  const ON = { x: 0.3, z: 4 }

  it('predicted shot leaves from the contact tick (no fly-past)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const C = closest(incoming(), ON)
      const r = coSim({ state: incoming(), guestAt: ON, held: { x: 0, z: -1 }, when: (k) => k >= C, seed })
      expect(r.predicted, `seed ${seed}`).toBe(true)
      const hit = r.own('hit')!
      expect(hit, `seed ${seed}`).toMatchObject({ grade: 'perfect' })
      // Confirmed by the host: still the prediction (the sound echo matches the hit with the same rule).
      expect(r.confirmed, `seed ${seed}`).toMatchObject({ side: 1, grade: 'perfect', power: 0 })
      expect(answersPrediction(hit, 'hit', 1, r.confirmed!.from), `seed ${seed}`).toBe(true)
      const maxHostZ = Math.max(...r.host.map((h) => h.shuttle.pos.z))
      const after = r.frames.slice(r.swingFrame + 1, r.swingFrame + 40)
      for (let i = 1; i < after.length; i++) {
        // Side 1: toward the net is −z.
        expect(after[i].pos.z - after[i - 1].pos.z, `seed ${seed} frame ${i}`).toBeLessThan(0)
      }
      for (const f of after) expect(f.pos.z, `seed ${seed}`).toBeLessThanOrEqual(maxHostZ + 0.05)
    }
  })

  it.each(['perfect', 'good'] as const)('host agrees: no visible correction (%s)', (grade) => {
    for (let seed = 1; seed <= 5; seed++) {
      const C = closest(incoming(), ON)
      const late = grade === 'good' ? 8 : 0
      const r = coSim({
        state: incoming(),
        guestAt: ON,
        held: { x: 0.4, z: -1 },
        when: (k) => k >= C + late,
        seed,
      })
      expect(r.predicted).toBe(true)
      const hit = r.own('hit')!
      expect(hit, `seed ${seed}`).toMatchObject({ grade })
      // From the frame the host's hit state arrived: drawn steps follow the host flight's steps.
      const from = r.arrivedAt.get(hit.tick)!
      let first = true
      for (let i = from; i < r.frames.length; i++) {
        const a = r.frames[i - 1]
        const b = r.frames[i]
        if (a.tick < hit.tick) continue
        if (first) {
          expect(dist(b.pos, r.hostAt(b.tick)), `seed ${seed} at arrival`).toBeLessThan(0.1)
          first = false
        }
        const corr = dist(sub(b.pos, a.pos), sub(r.hostAt(b.tick), r.hostAt(a.tick)))
        expect(corr, `seed ${seed} frame ${i}`).toBeLessThanOrEqual(0.02)
      }
      expect(first).toBe(false)
    }
  })

  it.each(['perfect', 'good'] as const)(
    'an un-jittered host hit is exactly the predicted flight (%s)',
    (grade) => {
      for (let seed = 1; seed <= 5; seed++) {
        const C = closest(incoming(), ON)
        const state = incoming()
        // mulberry32 seed whose 2nd draw (the aim jitter radius) is ~7e-10: the host aims un-jittered too.
        state.rng = 25632116
        const r = coSim({
          state,
          guestAt: ON,
          held: { x: 0.4, z: -1 },
          when: (k) => k >= C + (grade === 'good' ? 8 : 0),
          seed,
        })
        const hit = r.own('hit')!
        expect(hit, `seed ${seed}`).toMatchObject({ grade })
        let n = 0
        for (let i = r.swingFrame + 1; i < r.frames.length; i++) {
          const f = r.frames[i]
          if (f.tick < hit.tick) continue
          expect(dist(f.pos, r.hostAt(f.tick)), `seed ${seed} frame ${i}`).toBeLessThan(1e-3)
          n++
        }
        expect(n).toBeGreaterThan(20)
      }
    },
  )

  it('a confirmed prediction is dropped once the clock passes its hit tick', () => {
    const C = closest(incoming(), ON)
    const r = coSim({ state: incoming(), guestAt: ON, held: { x: 0.4, z: -1 }, when: (k) => k >= C })
    expect(r.own('hit')).toBeTruthy()
    expect((r.gs as unknown as { pred: unknown }).pred).toBeNull()
  })

  /** Every frame after the host's answer moves ≤ maxStep + the host's own step; on the host path within 30 ticks. */
  function expectConverges(r: ReturnType<typeof coSim>, answerTick: number) {
    const from = r.arrivedAt.get(answerTick)!
    for (let i = from; i < r.frames.length; i++) {
      const a = r.frames[i - 1]
      const b = r.frames[i]
      const hostStep = dist(r.hostAt(b.tick), r.hostAt(a.tick))
      expect(dist(b.pos, a.pos), `frame ${i}`).toBeLessThanOrEqual(PREDICT.maxStep + hostStep + 1e-9)
      if (i >= from + 30) expect(dist(b.pos, r.hostAt(b.tick)), `frame ${i}`).toBeLessThan(0.02)
    }
    expect(r.frames.length).toBeGreaterThan(from + 31)
  }

  it('host says miss: converges within 30 ticks, ≤ 0.3 m per frame', () => {
    const guestAt = { x: 0.9, z: 4 }
    for (let seed = 1; seed <= 5; seed++) {
      // On the host the guest stands 0.5 m further: out of reach.
      const C = closest(incoming(), guestAt)
      const r = coSim({
        state: incoming({ x: 1.4, z: 4 }),
        guestAt,
        held: { x: 0, z: 1 },
        when: (k) => k >= C,
        seed,
        ticks: 120,
      })
      expect(r.predicted).toBe(true)
      expect(r.own('hit')).toBeUndefined()
      const whiff = r.own('whiff')!
      expect(whiff).toBeDefined()
      expectConverges(r, whiff.tick)
    }
  })

  it('host picks a different shot: converges', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const C = closest(incoming(), ON)
      // The host has the guest further back than its prediction: the same swing is 13+ ticks early
      // there (late → a clear, not the predicted Perfect drop).
      const r = coSim({
        state: incoming({ x: 0.3, z: 4.9 }),
        guestAt: ON,
        held: { x: 0, z: 0 },
        when: (k) => k >= C,
        seed,
        ticks: 130,
      })
      expect(r.predicted).toBe(true)
      const hit = r.own('hit')!
      expect(hit, `seed ${seed}`).toMatchObject({ grade: 'late', shot: 'clear' })
      expectConverges(r, hit.tick)
    }
  })

  it('a press predicts only a contact within CHARGE.start ticks (the sim tap rule)', () => {
    const C = closest(incoming(), ON)
    const tryAt = (seen: number, tap: boolean) => {
      const states = host(incoming(), C + 2)
      const clock = new RenderClock(60)
      const gs = new GuestShuttle(clock)
      for (const st of states) {
        clock.onState(st.tick)
        gs.push(st)
      }
      clock.tick = seen - 1 // seenTick() = round(tick) + 1
      gs.update(DT)
      return gs.predictHit({ side: 1, held: { x: 0, z: -1 }, charge: 0, player: ON, tap })
    }
    expect(tryAt(C - 12, true)).toBe(false)
    expect(tryAt(C - 12, false)).toBe(true)
    expect(tryAt(C - 9, true)).toBe(true)
  })

  it('grades like the host under pressure: a swing 5 ticks past the closest approach is Good', () => {
    const C = closest(incoming(), ON)
    const predictAt = (pressured: boolean) => {
      const start = incoming()
      start.shuttle.pressured = pressured
      const states = host(start, C + 8)
      const clock = new RenderClock(60)
      const gs = new GuestShuttle(clock)
      for (const st of states) {
        clock.onState(st.tick)
        gs.push(st)
      }
      clock.tick = C + 5 - 1 // seenTick() = round(tick) + 1
      gs.update(DT)
      expect(gs.predictHit({ side: 1, held: { x: 0, z: -1 }, charge: 0, player: ON, tap: false })).toBe(true)
      expect(gs.predicted()).toMatchObject({
        side: 1,
        grade: expect.any(String),
        shot: expect.any(String),
        power: 0,
      })
      return gs['pred']!.grade
    }
    expect(predictAt(true)).toBe('good')
    expect(predictAt(false)).toBe('perfect')
  })

  it("a charged swing's prediction carries the sim's power (launchShot gain × grade share)", () => {
    const C = closest(incoming(), ON)
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    expect(gs.predicted()).toBeNull()
    for (const st of host(incoming(), C + 8)) {
      clock.onState(st.tick)
      gs.push(st)
    }
    clock.tick = C - 1 // seenTick() = round(tick) + 1
    gs.update(DT)
    const held = { x: 0.4, z: -1 }
    expect(gs.predictHit({ side: 1, held, charge: 1, player: ON, tap: false })).toBe(true)
    const p = gs.predicted()!
    const { gain } = launchShot(
      p.shot,
      p.grade,
      gs['pred']!.flight.pos,
      shotTarget(p.shot, 1, held.x),
      () => 0,
      1,
    )
    expect(p.power).toBe(hitPower(p.grade, gain))
    expect(p.power).toBeGreaterThan(0)
    gs.reset()
    expect(gs.predicted()).toBeNull()
  })

  it('predictHit aims on the host court from the samples', () => {
    const xl = courtDims('xl')
    const C = closest(incoming(), ON)
    const predict = (court?: typeof xl) => {
      const clock = new RenderClock(60)
      const gs = new GuestShuttle(clock)
      for (const st of host(incoming(), C + 8)) {
        clock.onState(st.tick)
        gs.push(
          court ? { tick: st.tick, phase: st.phase, shuttle: st.shuttle, events: st.events, court } : st,
        )
      }
      clock.tick = C - 1
      gs.update(DT)
      const held = { x: 0.4, z: -1 }
      expect(gs.predictHit({ side: 1, held, charge: 1, player: ON, tap: false })).toBe(true)
      const p = gs.predicted()!
      return { p, from: gs['pred']!.flight.pos, vel: gs['pred']!.flight.vel, held }
    }
    const big = predict(xl)
    const norm = predict(undefined)
    const want = launchShot(
      big.p.shot,
      big.p.grade,
      big.from,
      shotTarget(big.p.shot, 1, clampDir(big.held.x, big.held.z).x, xl),
      () => 0,
      1,
      xl,
    ).vel
    expect(big.vel).toEqual(want)
    expect(big.vel).not.toEqual(norm.vel)
  })

  it('answersPrediction: own event of that kind from the rewind window on', () => {
    const at = (tick: number, side: 0 | 1 = 1): SpEvent => ({
      id: 1,
      tick,
      k: 'hit',
      side,
      grade: 'good',
      shot: 'clear',
    })
    expect(answersPrediction(at(100 - MAX_REWIND), 'hit', 1, 100)).toBe(true)
    expect(answersPrediction(at(100 - MAX_REWIND - 1), 'hit', 1, 100)).toBe(false)
    expect(answersPrediction(at(100, 0), 'hit', 1, 100)).toBe(false)
    expect(answersPrediction(at(100), 'whiff', 1, 100)).toBe(false)
    expect(answersPrediction({ id: 2, tick: 100, k: 'whiff', side: 1 }, 'whiff', 1, 100)).toBe(true)
  })

  it('no prediction when the opponent hit last or a hit is pending', () => {
    const states = host(incoming(), 30)
    const sw: OwnSwing = { side: 1, held: { x: 0, z: 0 }, charge: 0, player: { x: 0, z: 0 }, tap: false }
    for (const mutate of [
      (s: SpState) => (s.shuttle.lastHitter = 1),
      (s: SpState) =>
        (s.shuttle.pending = {
          atTick: s.tick + 3,
          side: 0,
          kind: 'clear',
          grade: 'good',
          aimX: 0,
          charge: 0,
          fromTick: s.tick + 3,
        }),
    ]) {
      const clock = new RenderClock(60)
      const gs = new GuestShuttle(clock)
      for (const st of states) {
        const c = structuredClone(st)
        mutate(c)
        // The shuttle sits on seat b: any allowed swing would connect.
        sw.player = { x: c.shuttle.pos.x, z: c.shuttle.pos.z }
        clock.onState(c.tick)
        gs.push(c)
        clock.update(DT)
        gs.update(DT)
      }
      const before = { ...gs.pos }
      expect(gs.predictHit({ ...sw, player: { x: gs.pos.x, z: Math.max(0.1, gs.pos.z) } })).toBe(false)
      clock.update(DT)
      gs.update(DT)
      expect(gs.pos.z).toBeGreaterThan(before.z)
    }
  })
})

describe('GuestShuttle own prediction vs a bonk', () => {
  const ON = { x: 0.3, z: 4 }
  const ME = 'b'

  /** A guest that predicted its own hit on the `incoming()` rally; `feed` pushes later host states (events added). */
  function predicted() {
    const states = host(incoming(), 80)
    const C = closest(incoming(), ON)
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    let n = 0
    const feed = (s: SpState) => {
      clock.onState(s.tick)
      gs.push(s)
      clock.update(DT)
      gs.update(DT)
    }
    while (clock.seenTick() < C && n < states.length) feed(structuredClone(states[n++]))
    const sw: OwnSwing = { side: 1, id: ME, held: { x: 0, z: -1 }, charge: 0, player: ON, tap: false }
    expect(gs.predictHit(sw)).toBe(true)
    const from = gs.predicted()!.from
    const next = (mut: (s: SpState) => void) => {
      const s = structuredClone(states[n++])
      mut(s)
      feed(s)
    }
    return { gs, from, next }
  }
  const bonk = (tick: number, who: string): SpEvent => ({ id: 90, tick, k: 'bonk', side: 1, who, by: 'a' })

  it('an own bonk drops an unanswered own prediction', () => {
    const { gs, from, next } = predicted()
    next((s) => s.events.push(bonk(from + 1, ME)))
    expect(gs.predicted()).toBeNull()
  })

  it('a teammate bonk, an older bonk, or a confirmed pending keeps it', () => {
    const a = predicted()
    a.next((s) => s.events.push(bonk(a.from + 1, 'mate')))
    expect(a.gs.predicted()).not.toBeNull()
    const b = predicted()
    b.next((s) => s.events.push(bonk(b.from - 1, ME)))
    expect(b.gs.predicted()).not.toBeNull()
    const c = predicted()
    const pending = (s: SpState) => {
      s.shuttle.pending = {
        atTick: s.tick + 3,
        side: 1,
        kind: 'clear',
        grade: 'good',
        aimX: 0,
        charge: 0,
        fromTick: s.tick + 3,
      }
      s.events.push(bonk(c.from + 1, ME))
    }
    c.next(pending)
    expect(c.gs.predicted()).not.toBeNull()
    // The host's own hit then confirms it as usual.
    c.next((s) => {
      pending(s)
      s.events.push({ id: 91, tick: c.from + 2, k: 'hit', side: 1, grade: 'good', shot: 'clear' })
    })
    expect(c.gs.predicted()).not.toBeNull()
    expect((c.gs as unknown as { pred: { until: number } }).pred.until).toBe(c.from + 2)
  })

  it('without an id, a bonk on the swinger side drops it', () => {
    const { gs, from, next } = predicted()
    ;(gs as unknown as { pred: { id?: string } }).pred.id = undefined
    next((s) => s.events.push(bonk(from + 1, 'mate')))
    expect(gs.predicted()).toBeNull()
  })
})

// ---- Own jump / lunge: the guest picks the host's move and predicts the host's shot. ----

describe('GuestShuttle own jump / lunge prediction', () => {
  /** Side-1 (seat b) mirrors of sim.test's LOB (over b at y ≈ 3.4) and WIDE (1.8 m wide at y ≈ 0.7). */
  const LOB = { pos: { x: 0, y: 4.2, z: 2.6 }, vel: { x: 0, y: -1, z: 5 }, at: { x: 0, z: 4 } }
  const WIDE = { pos: { x: 1.8, y: 0.9, z: 1 }, vel: { x: 0, y: 0.6, z: 8 }, at: { x: 0, z: 2.83 } }
  type Scene = typeof LOB

  function scene(sc: Scene): SpState {
    const s = rally(sc.pos, sc.vel)
    s.players[1].x = sc.at.x
    s.players[1].z = sc.at.z
    // mulberry32 seed whose 2nd draw (the aim jitter radius) is ~7e-10: the host aims un-jittered too.
    s.rng = 25632116
    return s
  }

  /** History tick of the scene flight's closest approach to `at` inside `act`'s reach box. */
  function boxContact(sc: Scene, act: Strike): number {
    const c = scene(sc)
    const r = ABILITY[act].reach
    let best = Infinity
    let tick = -1
    for (let i = 0; i < 60; i++) {
      const { x, y, z } = c.shuttle.pos
      const d = Math.hypot(x - sc.at.x, z - sc.at.z)
      if (y >= r.minY && y <= r.maxY && d <= r.radius && d < best) {
        best = d
        tick = c.tick + 1
      }
      step(c, [])
    }
    expect(tick).toBeGreaterThan(0)
    return tick
  }

  /**
   * The guest presses on screen tick P = contact − lead (it has every host state up to P − 1); the host
   * gets `{t:'ability', tick: P}` at host tick P + lag. Returns the guest's pick + prediction and the host's hit.
   */
  function parity(sc: Scene, act: Strike, lag: number) {
    const P = boxContact(sc, act) - ABILITY[act].lead
    const s = scene(sc)
    const clock = new RenderClock(60)
    const gs = new GuestShuttle(clock)
    while (s.tick < P - 1) {
      step(s, [])
      clock.onState(s.tick)
      gs.push(structuredClone(s))
    }
    clock.tick = P - 1 // seenTick() = round(tick) + 1 = P
    gs.update(DT)
    expect(clock.seenTick()).toBe(P)
    const held = { x: 0, z: 1 }
    const pick = gs.pickAbility(sc.at, 1, true)
    const sw: OwnSwing = {
      side: 1,
      held,
      charge: 0,
      player: sc.at,
      tap: false,
      pressTick: P,
      act: pick.k as Strike,
    }
    const predicted = pick.k !== 'hop' && gs.predictHit(sw)
    const pred = gs['pred']
    let hit: SpEvent | undefined
    let launch: Vec3 | undefined
    for (let i = 0; i < 80 && !hit; i++) {
      const press = s.tick + 1 === P + lag
      step(s, press ? [{ player: 'b', input: { t: 'ability', x: held.x, z: held.z, tick: P } }] : [])
      hit = s.events.find((e) => e.k === 'hit' && e.side === 1)
      if (hit) launch = s.history.find((h) => h.tick === hit!.tick)?.vel
    }
    return { pick, predicted, pred, hit, launch }
  }

  it.each([0, 5])('own jump: same kind, grade and launch as the host (lag %i)', (lag) => {
    const r = parity(LOB, 'jump', lag)
    expect(r.pick.k).toBe('jump')
    expect(r.predicted).toBe(true)
    expect(r.hit).toMatchObject({ act: 'jump', shot: 'smash' })
    const hit = r.hit as Extract<SpEvent, { k: 'hit' }>
    expect(r.pred).toMatchObject({ side: 1, grade: hit.grade, shot: hit.shot, power: hit.power })
    // The host's answer is recognised as the echo of this prediction (HitEcho's rule).
    expect(answersPrediction(hit, 'hit', 1, r.pred!.from)).toBe(true)
    for (const k of ['x', 'y', 'z'] as const) expect(r.pred!.flight.vel[k]).toBeCloseTo(r.launch![k], 3)
  })

  it.each([0, 5])('own lunge matches the host the same way (lag %i)', (lag) => {
    const r = parity(WIDE, 'lunge', lag)
    expect(r.pick.k).toBe('lunge')
    expect(r.pick.dx).toBeGreaterThan(0.99) // toward the shuttle (world +x)
    expect(r.predicted).toBe(true)
    expect(r.hit).toMatchObject({ act: 'lunge', shot: 'clear' })
    const hit = r.hit as Extract<SpEvent, { k: 'hit' }>
    expect(hit.grade).not.toBe('perfect')
    expect(r.pred).toMatchObject({ side: 1, grade: hit.grade, shot: hit.shot, power: hit.power })
    expect(answersPrediction(hit, 'hit', 1, r.pred!.from)).toBe(true)
    for (const k of ['x', 'y', 'z'] as const) expect(r.pred!.flight.vel[k]).toBeCloseTo(r.launch![k], 3)
  })

  it('no prediction for a hop / out-of-turn press', () => {
    const P = boxContact(LOB, 'jump') - ABILITY.jump.lead
    const view = (mutate: (s: SpState) => void, upTo = P - 1, start = scene(LOB)) => {
      const clock = new RenderClock(60)
      const gs = new GuestShuttle(clock)
      for (const st of host(start, upTo - start.tick)) {
        const c = structuredClone(st)
        mutate(c)
        clock.onState(c.tick)
        gs.push(c)
      }
      clock.tick = upTo // seenTick() = upTo + 1
      gs.update(DT)
      return gs
    }
    // Our own shot last (not ours to hit), a hit pending, or a swing still cooling down: hop.
    expect(view((s) => (s.shuttle.lastHitter = 1)).pickAbility(LOB.at, 1, true).k).toBe('hop')
    expect(view(() => {}).pickAbility(LOB.at, 1, false).k).toBe('hop')
    expect(view(() => {}).pickAbility(LOB.at, 1, true).k).toBe('jump')
    // An empty view (no state yet) hops.
    expect(new GuestShuttle(new RenderClock(60)).pickAbility(LOB.at, 1, true).k).toBe('hop')
    // The wide drive stays below 1 m: out of the jump box, so a jump predicts nothing (the lunge does).
    const L = boxContact(WIDE, 'lunge') - ABILITY.lunge.lead
    const gs = view(() => {}, L - 1, scene(WIDE))
    const sw: OwnSwing = {
      side: 1,
      held: { x: 0, z: 1 },
      charge: 0,
      player: WIDE.at,
      tap: false,
      act: 'jump',
    }
    expect(gs.predictHit(sw)).toBe(false)
    expect(gs.predictHit({ ...sw, act: undefined })).toBe(false) // nor a plain swing
    expect(gs.predictHit({ ...sw, act: 'lunge' })).toBe(true)
  })
})
