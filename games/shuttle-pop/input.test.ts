import { describe, expect, it } from 'vitest'
import type { SpInput } from './sim'
import { HeldKeys, heldDir } from './input'

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
    expect(got).toEqual([{ t: 'move', x: 1, z: 0 }])
  })

  it('resync sends a stop for a key let go while paused (or on blur)', () => {
    const { got, net, keys } = setup()
    net.live = true
    keys.press('KeyA')
    net.live = false
    keys.clear()
    net.live = true
    keys.resync()
    expect(got.at(-1)).toEqual({ t: 'move', x: 0, z: 0 })
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
