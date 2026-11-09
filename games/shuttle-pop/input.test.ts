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
