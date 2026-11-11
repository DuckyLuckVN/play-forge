import { describe, expect, it } from 'vitest'
import { BACKDROP_CSS, backdropMarkup, ridgeRects, spriteRects, svgUrl } from './backdrop.mjs'

describe('spriteRects', () => {
  it('turns ASCII rows into merged runs, skipping empty pixels', () => {
    expect(spriteRects(['.AA', 'B.A'], { A: '#a', B: '#b' })).toEqual([
      [1, 0, 2, 1, '#a'],
      [0, 1, 1, 1, '#b'],
      [2, 1, 1, 1, '#a'],
    ])
  })
})

describe('ridgeRects', () => {
  const rects = ridgeRects(
    160,
    56,
    30,
    [
      [12, 2, 0],
      [7, 5, 1],
    ],
    '#body',
    '#edge',
  )
  const bodies = rects.filter((r) => r[4] === '#body')

  it('covers every column exactly once, inside the tile', () => {
    expect(bodies.reduce((n, r) => n + r[2], 0)).toBe(160)
    for (const [, y, , h] of bodies) {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y + h).toBe(56)
    }
  })

  it('tiles seamlessly: the last column meets the first', () => {
    const first = bodies[0][3]
    const last = bodies[bodies.length - 1][3]
    expect(Math.abs(first - last)).toBeLessThanOrEqual(2)
  })
})

describe('backdrop', () => {
  it('is decorative: hidden from screen readers, no text to translate', () => {
    const html = backdropMarkup()
    expect(html).toContain('aria-hidden="true"')
    expect(html.replace(/<[^>]*>/g, '').trim()).toBe('')
  })

  it('stops moving with reduced motion and makes no clicks', () => {
    expect(BACKDROP_CSS).toContain('prefers-reduced-motion')
    expect(BACKDROP_CSS).toContain('pointer-events:none')
  })

  it('builds valid inline SVG urls', () => {
    const url = svgUrl(2, 1, [[0, 0, 1, 1, '#fff']])
    expect(url.startsWith('url("data:image/svg+xml,')).toBe(true)
    expect(decodeURIComponent(url)).toContain("viewBox='0 0 2 1'")
  })
})
