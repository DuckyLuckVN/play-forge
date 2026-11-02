// Special bricks announce what they do, so the game can show and play it.
import { describe, expect, it } from 'vitest'
import { damageBrick } from './damage'
import { drainEvents, fire } from './run'
import { brick, empty, runVolley } from './testing'
import type { BrickKind, SimEvent } from './types'

const specials = (events: SimEvent[]) =>
  events.filter((e): e is Extract<SimEvent, { type: 'special' }> => e.type === 'special')

describe('special brick events', () => {
  it('a ball hitting a special brick raises a "hit" special event with its kind', () => {
    const s = empty()
    const b = brick(s, 3, 3, 1e6)
    b.kind = 'armored'
    fire(s, Math.PI / 2)
    runVolley(s)
    const hits = specials(drainEvents(s))
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((e) => e.kind === 'armored' && !e.trigger)).toBe(true)
  })

  it('normal bricks raise none', () => {
    const s = empty()
    brick(s, 3, 3, 1e6)
    fire(s, Math.PI / 2)
    runVolley(s)
    expect(specials(drainEvents(s))).toHaveLength(0)
  })

  for (const kind of ['bomb', 'lightning', 'splitter'] as BrickKind[])
    it(`${kind} raises a "trigger" event when it goes off`, () => {
      const s = empty()
      const b = brick(s, 3, 3, 10)
      b.kind = kind
      drainEvents(s)
      damageBrick(s, b, 100, 'ball')
      expect(specials(drainEvents(s)).filter((e) => e.trigger && e.kind === kind)).toHaveLength(1)
    })
})
