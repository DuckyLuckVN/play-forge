import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyBackdropChoice,
  BACKDROP_CHOICES,
  BACKDROP_CSS,
  BACKDROP_PICK_JS,
  DEFAULT_BACKDROP,
  getBackdropChoice,
  saveBackdropChoice,
  THEMES,
  backdropCss,
  backdropMarkup,
  discRects,
  ridgeRects,
  spriteRects,
  svgUrl,
} from './backdrop.mjs'

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

describe('discRects', () => {
  it('is a symmetric circle inside the grid, one rect per row', () => {
    const rects = discRects(10, 4, '#c')
    expect(rects.length).toBe(new Set(rects.map((r) => r[1])).size)
    for (const [x, , w] of rects) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x + w).toBeLessThanOrEqual(10)
      expect(x).toBe(10 - (x + w)) // centred
    }
  })
})

describe('themes', () => {
  it('paints canyon with no choice, every other theme behind data-bd', () => {
    expect(BACKDROP_CSS).toBe(backdropCss(THEMES, 'canyon'))
    const base = BACKDROP_CSS.slice(0, BACKDROP_CSS.indexOf('\n'))
    expect(base).toContain(THEMES.canyon.sky[0][0])
    for (const key of Object.keys(THEMES).filter((k) => k !== 'canyon'))
      expect(BACKDROP_CSS).toContain(`.pf-bd[data-bd="${key}"]`)
    expect(BACKDROP_CSS).not.toContain('data-bd="canyon"')
  })

  it.each(Object.entries(THEMES))('%s: sky bands climb to 100%% and the CSS builds', (_, theme) => {
    const ends = theme.sky.map(([, to]) => to)
    expect(ends.at(-1)).toBe(100)
    expect([...ends].sort((a, b) => a - b)).toEqual(ends)
    expect(BACKDROP_CSS).toContain(theme.sky[0][0])
    const css = backdropCss({ only: theme }, 'only')
    expect(css).not.toContain('undefined')
  })
})

/** A minimal Storage double (vitest runs these in node, without a DOM). */
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

describe("the player's choice", () => {
  const keys = Object.keys(THEMES)
  const el = () => {
    const attrs: Record<string, string> = {}
    return { attrs, setAttribute: (k: string, v: string) => (attrs[k] = v) } as unknown as Element & {
      attrs: Record<string, string>
    }
  }
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.stubGlobal('sessionStorage', memoryStorage())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows canyon until the player picks', () => {
    expect(DEFAULT_BACKDROP).toBe('canyon')
    expect(getBackdropChoice()).toBe('canyon')
    const e = el()
    expect(applyBackdropChoice(e, keys, DEFAULT_BACKDROP)).toBe('canyon')
    expect((e as unknown as { attrs: Record<string, string> }).attrs['data-bd']).toBe('canyon')
  })

  it('keeps a picked theme', () => {
    saveBackdropChoice('candy')
    expect(getBackdropChoice()).toBe('candy')
    expect(applyBackdropChoice(null, keys, DEFAULT_BACKDROP)).toBe('candy')
  })

  it('falls back to canyon for an unknown saved theme', () => {
    localStorage.setItem('play-forge:backdrop', 'gone')
    expect(getBackdropChoice()).toBe('canyon')
    expect(applyBackdropChoice(null, keys, DEFAULT_BACKDROP)).toBe('canyon')
  })

  it('random: one theme per visit, re-rolled when Random is picked again', () => {
    saveBackdropChoice('random')
    const first = applyBackdropChoice(null, keys, DEFAULT_BACKDROP, () => 0.99)
    expect(first).toBe(keys[keys.length - 1])
    // Same visit (e.g. the game's loading screen): the same theme.
    expect(applyBackdropChoice(null, keys, DEFAULT_BACKDROP, () => 0)).toBe(first)
    saveBackdropChoice('random')
    expect(applyBackdropChoice(null, keys, DEFAULT_BACKDROP, () => 0)).toBe(keys[0])
  })

  it('still paints when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    vi.stubGlobal('localStorage', blocked)
    vi.stubGlobal('sessionStorage', blocked)
    expect(applyBackdropChoice(null, keys, DEFAULT_BACKDROP)).toBe('canyon')
    expect(() => saveBackdropChoice('day')).not.toThrow()
  })

  it('the picker offers Random and every theme', () => {
    expect(BACKDROP_CHOICES).toEqual(['random', ...keys])
  })

  it('the splash script is self-contained and passes the default', () => {
    expect(BACKDROP_PICK_JS).toContain('"canyon"')
    expect(BACKDROP_PICK_JS).toContain('previousElementSibling')
    expect(() => new Function(BACKDROP_PICK_JS)).not.toThrow()
  })
})
