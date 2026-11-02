import { describe, expect, it } from 'vitest'
import { slotView } from './slot-view'
import { BASE_SLOTS, isInstant } from './sim/boosts'
import { createRun } from './sim/run'
import type { BoostId } from './sim/types'

describe('skill slot sockets', () => {
  it('a new run: every socket empty, the first marked as next', () => {
    const v = slotView(createRun(1))
    expect(v.max).toBe(BASE_SLOTS)
    expect(v.used).toBe(0)
    expect(v.full).toBe(false)
    expect(v.sockets.map((s) => s.kind === 'empty' && s.next)).toEqual([
      true,
      ...Array(BASE_SLOTS - 1).fill(false),
    ])
  })

  it('owned skills fill sockets in order, with their level; bonus skills take none', () => {
    const s = createRun(1)
    const a: BoostId = 'damage'
    const b: BoostId = 'coins'
    expect(isInstant('balls')).toBe(true)
    s.boosts = { [a]: 2, [b]: 1, balls: 1 } as never
    const v = slotView(s)
    expect(v.used).toBe(2)
    expect(v.sockets[0]).toMatchObject({ kind: 'filled', id: a, level: 2 })
    expect(v.sockets[2]).toEqual({ kind: 'empty', next: true })
  })

  it('a beaten boss adds a socket; all filled reads as full', () => {
    const s = createRun(1)
    s.bossesBeaten = 1
    expect(slotView(s).max).toBe(BASE_SLOTS + 1)
  })
})
