// A laser pickup's beam earns XP like any hit, and shows it flying to the bar.
import { describe, expect, it } from 'vitest'
import { laserRow } from './run'
import { empty } from './testing'

describe('laser XP', () => {
  it('earns XP and an xp event per brick it hits', () => {
    const s = empty()
    s.bricks.push({ id: s.nextId++, col: 1, row: 2, hp: 50, maxHp: 50, kind: 'normal' } as never)
    s.bricks.push({ id: s.nextId++, col: 3, row: 2, hp: 50, maxHp: 50, kind: 'normal' } as never)
    laserRow(s, 2, 10)
    expect(s.xp).toBeGreaterThan(0)
    expect(s.events.filter((e) => e.type === 'xpFly')).toHaveLength(2)
  })
})
