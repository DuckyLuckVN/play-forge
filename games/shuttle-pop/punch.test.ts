import { describe, expect, it } from 'vitest'
import { SpringPunch } from './punch'

function offsetAfter(fps: number, secs: number) {
  const p = new SpringPunch(380, 0.42, 1 / 240)
  p.kick(10)
  const dt = 1 / fps
  for (let i = 0; i < Math.round(secs * fps); i++) p.update(dt)
  return p.offset
}

describe('SpringPunch', () => {
  it('same motion at 30, 60 and 144 fps', () => {
    expect(offsetAfter(60, 0.1)).toBeGreaterThan(0.2)
    expect(offsetAfter(30, 0.1)).toBeCloseTo(offsetAfter(60, 0.1), 6)
    // 1/3 s is a whole number of frames at all three rates.
    const at60 = offsetAfter(60, 1 / 3)
    expect(Math.abs(at60)).toBeGreaterThan(0.001) // still moving
    expect(offsetAfter(30, 1 / 3)).toBeCloseTo(at60, 6)
    expect(offsetAfter(144, 1 / 3)).toBeCloseTo(at60, 6)
  })

  it('settles back to rest (exactly 0) within a second', () => {
    expect(offsetAfter(60, 1)).toBe(0)
  })

  it('at rest it stays at 0; reset stops a punch', () => {
    const p = new SpringPunch(380, 0.42, 1 / 240)
    expect(p.update(1 / 60)).toBe(0)
    p.kick(5)
    p.update(1 / 60)
    p.reset()
    expect(p.update(1 / 60)).toBe(0)
  })
})
