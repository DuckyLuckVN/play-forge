import { describe, expect, it } from 'vitest'
import { TrailSampler } from './trail'

/** A shuttle flying +x at 12 m/s for `secs`, sampled at `fps`; returns the head-to-tail span (m). */
function span(fps: number, secs = 0.5) {
  const s = new TrailSampler(7, 1 / 60)
  const dt = 1 / fps
  const frames = Math.round(secs * fps)
  for (let i = 0; i <= frames; i++) s.update(i === 0 ? 0 : dt, 12 * i * dt, 2, 0)
  return s.pts[0] - s.pts[(s.len - 1) * 3]
}

describe('TrailSampler', () => {
  it('spans the same length of flight at 30, 60 and 144 fps', () => {
    const at60 = span(60)
    expect(at60).toBeCloseTo(12 * (6 / 60), 3)
    expect(span(30)).toBeCloseTo(at60, 3)
    expect(span(144)).toBeCloseTo(at60, 1)
  })

  it('a long frame fills skipped samples along the path (evenly spaced, not bunched)', () => {
    const s = new TrailSampler(7, 1 / 60)
    s.update(0, 0, 0, 0)
    s.update(0.1, 1.2, 0, 0) // one 100 ms hitch: 6 samples due
    expect(s.len).toBe(7)
    for (let i = 0; i < s.len - 1; i++) expect(s.pts[i * 3] - s.pts[(i + 1) * 3]).toBeCloseTo(0.2, 5)
  })

  it('the head always tracks the current position; reset forgets the path', () => {
    const s = new TrailSampler(7, 1 / 60)
    s.update(0, 0, 0, 0)
    s.update(0.005, 0.5, 1, 2)
    expect([s.pts[0], s.pts[1], s.pts[2]]).toEqual([0.5, 1, 2])
    s.reset()
    expect(s.len).toBe(0)
  })
})
