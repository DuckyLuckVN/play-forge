// The boss is announced three turns ahead, counting down.
import { describe, expect, it } from 'vitest'
import { BOSS_EVERY, BOSS_WARN_TURNS, spawnBoss, turnsUntilBoss } from './boss'
import { drainEvents, startNextTurn } from './run'
import { empty } from './testing'

describe('boss warning', () => {
  it('counts down 3, 2, 1 on the turns before a boss, and is silent otherwise', () => {
    const s = empty()
    const seen: Array<number | null> = []
    for (const turn of [25, 26, 27, 28, 29, 30, 31]) {
      s.turn = turn
      seen.push(turnsUntilBoss(s))
    }
    expect(BOSS_WARN_TURNS).toBe(3)
    expect(seen).toEqual([null, null, 3, 2, 1, null, null])
  })

  it('says nothing while a boss is already on the board', () => {
    const s = empty()
    s.turn = BOSS_EVERY
    spawnBoss(s, [], 'block')
    s.turn = BOSS_EVERY * 2 - 1
    expect(turnsUntilBoss(s)).toBeNull()
  })

  it('a new turn in the warning window raises a bossSoon event with the count', () => {
    const s = empty()
    s.turn = BOSS_EVERY - 4
    drainEvents(s)
    startNextTurn(s)
    expect(drainEvents(s).find((e) => e.type === 'bossSoon')).toEqual({ type: 'bossSoon', turns: 3 })
    startNextTurn(s)
    startNextTurn(s)
    expect(
      drainEvents(s)
        .filter((e) => e.type === 'bossSoon')
        .map((e) => (e as { turns: number }).turns),
    ).toEqual([2, 1])
  })
})
