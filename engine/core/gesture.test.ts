import { describe, expect, it } from 'vitest'
import { GestureClassifier } from './gesture'

describe('GestureClassifier', () => {
  it('a short press without movement is a tap', () => {
    const g = new GestureClassifier()
    expect(g.down(100, 100, 0)).toEqual([])
    expect(g.move(110, 105, 20)).toEqual([])
    expect(g.up(112, 106, 40)).toEqual([
      { type: 'tap', x: 112, y: 106 },
      { type: 'release', x: 112, y: 106 },
    ])
  })

  it('fires exactly one swipe per gesture once past the threshold', () => {
    const g = new GestureClassifier()
    g.down(0, 0, 0)
    expect(g.move(23, 0, 10)).toEqual([])
    expect(g.move(24, 0, 20)).toEqual([{ type: 'swipe', dir: 'right' }])
    // Keeps dragging (even far, even reversing): no chained steps.
    expect(g.move(80, 0, 30)).toEqual([])
    expect(g.move(-80, 0, 40)).toEqual([])
    expect(g.up(-80, 0, 50)).toEqual([{ type: 'release', x: -80, y: 0 }])
  })

  it('honours a custom threshold', () => {
    const g = new GestureClassifier({ threshold: 28 })
    g.down(0, 0, 0)
    expect(g.move(0, -27, 10)).toEqual([])
    expect(g.move(0, -28, 20)).toEqual([{ type: 'swipe', dir: 'up' }])
  })

  it('resolves diagonals by the dominant axis (ties go vertical)', () => {
    const dir = (dx: number, dy: number) => {
      const g = new GestureClassifier()
      g.down(0, 0, 0)
      return g.move(dx, dy, 10)
    }
    expect(dir(30, 20)).toEqual([{ type: 'swipe', dir: 'right' }])
    expect(dir(-30, 20)).toEqual([{ type: 'swipe', dir: 'left' }])
    expect(dir(-20, -30)).toEqual([{ type: 'swipe', dir: 'up' }])
    expect(dir(20, 30)).toEqual([{ type: 'swipe', dir: 'down' }])
    expect(dir(25, 25)).toEqual([{ type: 'swipe', dir: 'down' }])
  })

  it('a still finger becomes a hold after the delay, then follows moves', () => {
    const g = new GestureClassifier({ holdDelay: 150 })
    g.down(50, 60, 1000)
    expect(g.wait(1149)).toEqual([])
    expect(g.wait(1150)).toEqual([{ type: 'hold', x: 50, y: 60 }])
    expect(g.wait(1300)).toEqual([])
    // Once holding, any movement follows (no threshold, no swipe).
    expect(g.move(52, 60, 1310)).toEqual([{ type: 'holdMove', x: 52, y: 60 }])
    expect(g.move(200, 60, 1320)).toEqual([{ type: 'holdMove', x: 200, y: 60 }])
    expect(g.up(200, 60, 1400)).toEqual([{ type: 'release', x: 200, y: 60 }])
  })

  it('a move after the delay without a wait still resolves as hold first', () => {
    const g = new GestureClassifier({ holdDelay: 150 })
    g.down(0, 0, 0)
    expect(g.move(40, 0, 200)).toEqual([
      { type: 'hold', x: 0, y: 0 },
      { type: 'holdMove', x: 40, y: 0 },
    ])
  })

  it('a release after the delay is a hold, not a tap', () => {
    const g = new GestureClassifier({ holdDelay: 150 })
    g.down(10, 10, 0)
    expect(g.up(11, 10, 200)).toEqual([
      { type: 'hold', x: 10, y: 10 },
      { type: 'release', x: 11, y: 10 },
    ])
  })

  it('a quick swipe never turns into a hold', () => {
    const g = new GestureClassifier({ holdDelay: 150 })
    g.down(0, 0, 0)
    expect(g.move(-30, 0, 60)).toEqual([{ type: 'swipe', dir: 'left' }])
    expect(g.wait(500)).toEqual([])
    expect(g.move(-31, 0, 510)).toEqual([])
  })

  it('without a hold delay, long presses stay taps', () => {
    const g = new GestureClassifier()
    g.down(0, 0, 0)
    expect(g.wait(5000)).toEqual([])
    expect(g.up(3, 3, 5000)).toEqual([
      { type: 'tap', x: 3, y: 3 },
      { type: 'release', x: 3, y: 3 },
    ])
  })

  it('cancel drops the gesture silently', () => {
    const g = new GestureClassifier({ holdDelay: 150 })
    g.down(0, 0, 0)
    expect(g.active).toBe(true)
    g.cancel()
    expect(g.active).toBe(false)
    expect(g.move(50, 0, 10)).toEqual([])
    expect(g.wait(500)).toEqual([])
    expect(g.up(50, 0, 20)).toEqual([])
  })

  it('ignores moves and releases with no press', () => {
    const g = new GestureClassifier()
    expect(g.move(100, 0, 0)).toEqual([])
    expect(g.up(100, 0, 0)).toEqual([])
    expect(g.active).toBe(false)
  })

  it('a new press starts a fresh gesture', () => {
    const g = new GestureClassifier()
    g.down(0, 0, 0)
    g.move(30, 0, 10)
    g.up(30, 0, 20)
    expect(g.active).toBe(false)
    g.down(0, 0, 100)
    expect(g.move(0, 30, 110)).toEqual([{ type: 'swipe', dir: 'down' }])
  })
})
