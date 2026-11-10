import { describe, expect, it } from 'vitest'
import type { SpInput } from './sim'
import { HeldKeys, heldDir, MOVE_GAP_MS, type InputClock } from './input'

/** A clock a whole tick later on every read: every change is in a new tick (no coalescing). */
function slowClock(): InputClock {
  let t = 0
  return { now: () => (t += MOVE_GAP_MS), later: () => () => {} }
}

/** A manual clock: `advance(ms)` moves time and runs the timers that came due. */
function manualClock() {
  let t = 1000
  let timers: { at: number; fn: () => void }[] = []
  const clock: InputClock = {
    now: () => t,
    later(fn, ms) {
      const timer = { at: t + ms, fn }
      timers.push(timer)
      return () => (timers = timers.filter((x) => x !== timer))
    },
  }
  const advance = (ms: number) => {
    t += ms
    const due = timers.filter((x) => x.at <= t)
    timers = timers.filter((x) => x.at > t)
    for (const x of due) x.fn()
  }
  return { clock, advance, pending: () => timers.length }
}

const dir = (...codes: string[]) => heldDir(new Set(codes))

describe('keyboard direction', () => {
  it('maps WASD and arrows view-relative (x = right, z = toward the net)', () => {
    expect(dir('KeyW')).toEqual({ x: 0, z: 1 })
    expect(dir('ArrowDown')).toEqual({ x: 0, z: -1 })
    expect(dir('KeyA')).toEqual({ x: -1, z: 0 })
    expect(dir('ArrowRight')).toEqual({ x: 1, z: 0 })
    expect(dir()).toEqual({ x: 0, z: 0 })
  })

  it('normalises diagonals to length 1 (no faster diagonals)', () => {
    const d = dir('KeyW', 'KeyD')
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1)
    expect(d.x).toBeCloseTo(Math.SQRT1_2)
  })

  it('cancels opposite keys, and a key plus its arrow twin counts once', () => {
    expect(dir('KeyA', 'KeyD')).toEqual({ x: 0, z: 0 })
    expect(dir('KeyW', 'ArrowUp')).toEqual({ x: 0, z: 1 })
  })
})

describe('held keys', () => {
  /** A session that drops inputs while not live (countdown / paused), like Session.sendInput. */
  function setup() {
    const got: SpInput[] = []
    const net = { live: false }
    const keys = new HeldKeys(
      (i) => net.live && got.push(i),
      () => 42,
      slowClock(),
    )
    return { got, net, keys }
  }

  it('sends move only when the direction changes', () => {
    const { got, net, keys } = setup()
    net.live = true
    keys.press('KeyW')
    keys.press('ArrowUp')
    keys.release('ArrowUp')
    keys.release('KeyW')
    expect(got).toEqual([
      { t: 'move', x: 0, z: 1 },
      { t: 'move', x: 0, z: 0 },
    ])
  })

  it('resync re-sends a key held through the countdown', () => {
    const { got, net, keys } = setup()
    keys.press('KeyD') // dropped: not playing yet
    expect(got).toEqual([])
    net.live = true
    keys.resync()
    expect(got).toEqual([
      { t: 'move', x: 1, z: 0 },
      { t: 'charge', cancel: true },
    ])
  })

  it('resync sends a stop for a key let go while paused (or on blur)', () => {
    const { got, net, keys } = setup()
    net.live = true
    keys.press('KeyA')
    net.live = false
    keys.clear()
    net.live = true
    keys.resync()
    expect(got.at(-2)).toEqual({ t: 'move', x: 0, z: 0 })
  })

  it('swings with the held direction and the tick on screen', () => {
    const { got, net, keys } = setup()
    net.live = true
    keys.press('KeyS')
    keys.swing()
    expect(got.at(-1)).toEqual({ t: 'swing', x: 0, z: -1, tick: 42 })
  })
})

describe('joystick through held keys (one source of truth)', () => {
  function setup() {
    const got: SpInput[] = []
    const keys = new HeldKeys(
      (i) => got.push(i),
      () => 9,
      slowClock(),
    )
    return { got, keys }
  }

  it('the stick feeds the held direction: move sent on change, quantised to 0.05', () => {
    const { got, keys } = setup()
    keys.stick(0.31, 0.72)
    keys.stick(0.33, 0.74) // same 0.05 step → nothing new
    keys.stick(0, 0)
    expect(got).toEqual([
      { t: 'move', x: 0.3, z: 0.7 },
      { t: 'move', x: 0, z: 0 },
    ])
  })

  it('swing uses the stick direction as the held direction', () => {
    const { got, keys } = setup()
    keys.stick(0, -1)
    keys.swing()
    expect(got.at(-1)).toEqual({ t: 'swing', x: 0, z: -1, tick: 9 })
  })

  it('held keys win over the stick; letting go of the keys falls back to the stick', () => {
    const { got, keys } = setup()
    keys.stick(1, 0)
    keys.press('KeyW')
    expect(got.at(-1)).toEqual({ t: 'move', x: 0, z: 1 })
    keys.release('KeyW')
    expect(got.at(-1)).toEqual({ t: 'move', x: 1, z: 0 })
  })

  it('clear (blur / leaving play) drops the stick too', () => {
    const { got, keys } = setup()
    keys.stick(0.5, 0.5)
    keys.clear()
    expect(got.at(-1)).toEqual({ t: 'move', x: 0, z: 0 })
  })

  it('a stick overshoot never sends a vector longer than 1', () => {
    const { got, keys } = setup()
    keys.stick(0.8, 0.8)
    const m = got.at(-1) as { x: number; z: number }
    expect(Math.hypot(m.x, m.z)).toBeLessThanOrEqual(1)
  })
})

describe('move coalescing (at most one move per sim tick)', () => {
  function setup() {
    const got: SpInput[] = []
    const m = manualClock()
    const keys = new HeldKeys(
      (i) => got.push(i),
      () => 7,
      m.clock,
    )
    const moves = () => got.filter((i) => i.t === 'move')
    return { got, keys, moves, ...m }
  }

  it('a burst of stick moves inside one tick sends the first now and the latest at the next tick', () => {
    const { keys, moves, advance } = setup()
    keys.stick(0.2, 0)
    keys.stick(0.4, 0)
    keys.stick(0.6, 0)
    keys.stick(0.8, 0)
    expect(moves()).toEqual([{ t: 'move', x: 0.2, z: 0 }])
    advance(MOVE_GAP_MS)
    expect(moves()).toEqual([
      { t: 'move', x: 0.2, z: 0 },
      { t: 'move', x: 0.8, z: 0 },
    ])
  })

  it('never more than one move per tick over a long drag (120 Hz pointer events)', () => {
    const { keys, moves, advance } = setup()
    for (let i = 0; i < 120; i++) {
      keys.stick(Math.cos(i / 10), Math.sin(i / 10))
      advance(1000 / 120)
    }
    advance(MOVE_GAP_MS)
    // 1 s of dragging: at most one per 1/60 s (+1 for the first, sent at once).
    expect(moves().length).toBeLessThanOrEqual(61)
    expect(moves().length).toBeGreaterThan(30)
  })

  it('a change back to the last sent direction within the tick sends nothing extra', () => {
    const { keys, moves, advance } = setup()
    keys.stick(1, 0)
    keys.stick(0, 1)
    keys.stick(1, 0)
    advance(MOVE_GAP_MS)
    expect(moves()).toHaveLength(1)
  })

  it('a swing goes out at once with the latest held direction (even one not sent yet)', () => {
    const { got, keys } = setup()
    keys.stick(1, 0)
    keys.stick(0, -1) // coalesced: not sent yet
    keys.swing()
    expect(got.at(-1)).toEqual({ t: 'swing', x: 0, z: -1, tick: 7 })
  })

  it('a key press after a quiet tick goes out at once (keyboard latency unchanged)', () => {
    const { keys, moves, advance } = setup()
    advance(100)
    keys.press('KeyD')
    expect(moves()).toEqual([{ t: 'move', x: 1, z: 0 }])
  })

  it('dispose cancels a coalesced move', () => {
    const { keys, moves, advance, pending } = setup()
    keys.stick(1, 0)
    keys.stick(0, 1)
    keys.dispose()
    expect(pending()).toBe(0)
    advance(MOVE_GAP_MS)
    expect(moves()).toHaveLength(1)
  })
})

describe('hold-to-charge swing button', () => {
  function setup() {
    const got: SpInput[] = []
    const keys = new HeldKeys(
      (i) => got.push(i),
      () => 7,
      slowClock(),
    )
    return { got, keys }
  }

  it('press charges, release swings with the held direction and the tick on screen', () => {
    const { got, keys } = setup()
    keys.press('KeyW')
    expect(keys.swingDown('Space')).toBe(true)
    expect(got.at(-1)).toEqual({ t: 'charge' })
    expect(keys.charging).toBe(true)
    expect(keys.swingUp('Space')).toBe(true)
    expect(got.at(-1)).toEqual({ t: 'swing', x: 0, z: 1, tick: 7 })
    expect(keys.charging).toBe(false)
  })

  it('one source at a time: a second button while charging neither re-charges nor swings', () => {
    const { got, keys } = setup()
    keys.swingDown('Space')
    expect(keys.swingDown('KeyJ')).toBe(false)
    expect(keys.swingUp('KeyJ')).toBe(false)
    expect(got.filter((i) => i.t === 'charge')).toHaveLength(1)
    expect(got.some((i) => i.t === 'swing')).toBe(false)
    keys.swingUp('Space')
    expect(got.filter((i) => i.t === 'swing')).toHaveLength(1)
  })

  it('a release with no press (e.g. a key held from before focus) does nothing', () => {
    const { got, keys } = setup()
    expect(keys.swingUp('Space')).toBe(false)
    expect(got).toEqual([])
  })

  it('cancel (blur / pointer cancel) lets go without swinging; clear() cancels too', () => {
    const { got, keys } = setup()
    keys.swingDown('touch:3')
    keys.cancelSwing()
    expect(got.at(-1)).toEqual({ t: 'charge', cancel: true })
    expect(keys.swingUp('touch:3')).toBe(false)
    keys.swingDown('mouse')
    keys.clear()
    expect(got.at(-1)).toEqual({ t: 'charge', cancel: true })
    expect(got.some((i) => i.t === 'swing')).toBe(false)
    keys.cancelSwing() // nothing held: nothing sent
    expect(got.filter((i) => i.t === 'charge' && i.cancel)).toHaveLength(2)
  })

  it('resync re-sends the charge state (a cancel dropped while paused still reaches the sim)', () => {
    const { got, keys } = setup()
    keys.resync()
    expect(got).toContainEqual({ t: 'charge', cancel: true })
    got.length = 0
    keys.swingDown('Space')
    keys.resync()
    expect(got.filter((i) => i.t === 'charge')).toEqual([{ t: 'charge' }, { t: 'charge' }])
  })
})
