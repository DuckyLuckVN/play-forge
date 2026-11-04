import { describe, expect, it } from 'vitest'
import { Moments } from './moments'
import { createState, type StrideEvent, type StrideState } from './sim'

const player = (i: number) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true })
const t = (en: string, p?: Record<string, unknown>) => en.replace(/\{(\w+)\}/g, (_, k) => String(p?.[k]))
const at = (s: StrideState, tick: number, events: StrideEvent[]) => {
  s.tick = tick
  s.events = events
  return s
}

describe('Synthstride moments', () => {
  it('announces others going out by name, and your own exit while others dance on', () => {
    const s = createState([player(0), player(1), player(2)], 1)
    const m = new Moments(0, t, 'p0', (id) => id.toUpperCase())
    s.dancers[1].diedAt = 5
    expect(m.update(at(s, 5, [{ type: 'die', p: 'p1' }])).map((b) => b.text)).toContain('P1 IS OUT!')
    s.dancers[0].diedAt = 6
    expect(m.update(at(s, 6, [{ type: 'die', p: 'p0' }])).map((b) => b.text)).toContain("YOU'RE OUT!")
  })

  it('cheers taking the lead and being the last one dancing', () => {
    const s = createState([player(0), player(1)], 1)
    const m = new Moments(0, t, 'p0')
    s.dancers[0].score = 50
    expect(m.update(at(s, 1, [])).map((b) => b.text)).toContain('YOU TAKE THE LEAD!')
    expect(m.update(at(s, 2, [])).map((b) => b.text)).not.toContain('YOU TAKE THE LEAD!')
    s.dancers[1].diedAt = 3
    expect(m.update(at(s, 3, [])).map((b) => b.text)).toContain('LAST ONE DANCING!')
  })

  it("ignores other players' streaks; NEW BEST is solo only", () => {
    const duo = createState([player(0), player(1)], 1)
    const m = new Moments(10, t, 'p0')
    expect(m.update(at(duo, 1, [{ type: 'overdrive', p: 'p1' }]))).toEqual([])
    const solo = createState([player(0)], 1)
    const m2 = new Moments(10, t, 'p0')
    solo.dancers[0].score = 11
    expect(m2.update(at(solo, 1, [])).map((b) => b.text)).toContain('NEW BEST!')
  })
})
