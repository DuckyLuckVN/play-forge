// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { chibi } from './figures'
import { isoProjection } from './projection'
import { arc, pathD } from './projection'
import {
  WASD,
  badge,
  chargeRing,
  clipRoot,
  finishClip,
  flyAlong,
  keyPad,
  landingRing,
  popText,
  showDuring,
  track,
} from './widgets'
import { s } from './svg'

const noNaN = (el: Element) => expect(el.outerHTML).not.toContain('NaN')

describe('finishClip', () => {
  const build = (reduced: boolean) => {
    const c = clipRoot({ w: 400, h: 300 }, { label: 'demo' })
    const p = isoProjection({ yawDeg: -45, scale: 22, origin: { x: 200, y: 168 } })
    const { air, ground } = arc(p, { x: 0, z: -4 }, { x: 0, z: 3 }, { start: 2, peak: 2, end: 0 })
    flyAlong(c, pathD(air), 12, { at: 1, dur: 3 }, { shadow: pathD(ground) })
    const g = s('g')
    showDuring(c, g, 12, { at: 5, dur: 2 })
    c.el.append(g)
    return { c, svg: finishClip(c, reduced), g }
  }
  it('appends exactly one style', () => {
    const { svg } = build(false)
    expect(svg.querySelectorAll('style')).toHaveLength(1)
    expect(svg.classList.contains('pf-clip-still')).toBe(false)
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toBe('demo')
  })
  it('reduced motion adds still class', () => {
    expect(build(true).svg.classList.contains('pf-clip-still')).toBe(true)
  })
  it('style contains every registered keyframe name', () => {
    const { c, svg } = build(false)
    const text = svg.querySelector('style')!.textContent!
    const names = c.css.flatMap((x) => [...x.matchAll(/@keyframes (\S+?)\{/g)].map((m) => m[1]))
    expect(names.length).toBeGreaterThanOrEqual(2)
    for (const n of names) expect(text).toContain(`@keyframes ${n}{`)
  })
  it('no NaN', () => noNaN(build(false).svg))
  it('showDuring marks still frame element', () => {
    expect(build(false).g.hasAttribute('data-still')).toBe(true)
  })
})

describe('keyPad', () => {
  it('renders WASD in a grid and registers lit keys', () => {
    const c = clipRoot({ w: 10, h: 10 })
    const pad = keyPad(c, WASD, [{ id: 'w', beat: { at: 1, dur: 2 }, color: '#f36' }], 12)
    const keys = [...pad.querySelectorAll('.pf-pad-key')]
    expect(keys.map((k) => k.textContent)).toEqual(['W', 'A', 'S', 'D'])
    expect(keys).toHaveLength(4)
    expect(c.css.join('')).toContain('@keyframes kp')
  })
})

describe('keyPad reduced motion', () => {
  it('is static when reducedMotion', () => {
    const c = clipRoot({ w: 10, h: 10 })
    const lit = [{ id: 'w', beat: { at: 1, dur: 2 }, color: '#f36' }]
    expect(keyPad(c, WASD, lit, 12, true).classList.contains('pf-clip-still')).toBe(true)
    expect(keyPad(c, WASD, lit, 12).classList.contains('pf-clip-still')).toBe(false)
  })
})

describe('short and edge beats', () => {
  const stops = (css: string) =>
    [...css.replace(/^@keyframes \S+?\{/, '').matchAll(/([\d.,%]+)\{[^}]*\}/g)].flatMap((m) =>
      m[1].split(',').map((x) => parseFloat(x)),
    )
  const mono = (css: string) => {
    const p = stops(css)
    expect(p.length).toBeGreaterThan(0)
    expect(p.every((n) => n >= 0 && n <= 100)).toBe(true)
    expect([...p].sort((x, y) => x - y)).toEqual(p)
  }
  it.each([
    { at: 5, dur: 0.01 },
    { at: 2, dur: 8 },
    { at: 0, dur: 0 },
  ])('keyframes of every widget are monotonic in 0-100: %o', (beat) => {
    const c = clipRoot({ w: 10, h: 10 })
    flyAlong(c, 'M0,0 L1,1', 10, beat, { shadow: 'M0,0 L1,1' })
    chargeRing(c, { x: 1, y: 1 }, 10, beat)
    popText(c, 'x', { x: 1, y: 1 }, 10, beat)
    showDuring(c, s('g'), 10, beat)
    keyPad(c, WASD, [{ id: 'w', beat, color: '#f36' }], 10)
    const blocks = c.css.filter((x) => x.startsWith('@keyframes'))
    expect(blocks).toHaveLength(5)
    blocks.forEach(mono)
  })
  it('throws on bad loop or negative dur', () => {
    const c = clipRoot({ w: 10, h: 10 })
    expect(() => showDuring(c, s('g'), 0, { at: 1, dur: 1 })).toThrow(RangeError)
    expect(() => showDuring(c, s('g'), 10, { at: 1, dur: -1 })).toThrow(RangeError)
  })
})

describe('badge', () => {
  it('contains key, name, desc', () => {
    const b = badge({ key: 'W', name: 'SMASH', desc: 'fast', color: '#f36', x: 220, y: 236 })
    expect(b.textContent).toContain('W')
    expect(b.textContent).toContain('SMASH')
    expect(b.textContent).toContain('fast')
    noNaN(b)
  })
})

describe('chibi', () => {
  it('is a g translated to at', () => {
    const g = chibi({ at: { x: 10, y: 20 }, team: '#f36', facing: 'left', racket: true })
    expect(g.tagName).toBe('g')
    expect(g.getAttribute('transform')).toBe('translate(10,20)')
    noNaN(g)
  })
})

describe('rings and text', () => {
  it('have no NaN', () => {
    const c = clipRoot({ w: 10, h: 10 })
    const at = { x: 5, y: 6 }
    noNaN(landingRing(at, '#fff'))
    noNaN(chargeRing(c, at, 10, { at: 1, dur: 2 }))
    expect(popText(c, 'SMASH!', at, 10, { at: 1, dur: 2 }).textContent).toBe('SMASH!')
    expect(c.css.join('')).not.toContain('NaN')
  })
})

describe('still frame choice', () => {
  it('showDuring / flyAlong can opt out of the still frame', () => {
    const c = clipRoot({ w: 10, h: 10 })
    const g = s('g')
    showDuring(c, g, 10, { at: 1, dur: 2 }, { still: false })
    expect(g.hasAttribute('data-still')).toBe(false)
    flyAlong(c, 'M0,0 L1,1', 10, { at: 1, dur: 2 }, { shadow: 'M0,0 L1,1', still: false })
    expect(c.el.querySelectorAll('[data-still]')).toHaveLength(0)
  })
  it('flyAlong still frame rests the ball at the end of its path', () => {
    const c = clipRoot({ w: 10, h: 10 })
    flyAlong(c, 'M0,0 L1,1', 10, { at: 1, dur: 2 }, { shadow: 'M0,0 L1,1' })
    expect(c.el.querySelectorAll('[data-still]')).toHaveLength(2)
    expect(c.css.join('')).toMatch(/\.pf-clip-still \.fl\d+b[^{]*\{offset-distance:100%/)
  })
  it('keyPad: a still lit key stays lit in the still frame', () => {
    const c = clipRoot({ w: 10, h: 10 })
    keyPad(c, WASD, [{ id: 'w', beat: { at: 1, dur: 2 }, color: '#f36', still: true }], 10, true)
    expect(c.css.join('')).toMatch(/\.pf-clip-still \.kp\d+\{background:#f36/)
  })
})

describe('track', () => {
  it('animates an element through percent stops; a pair holds a style over a span', () => {
    const c = clipRoot({ w: 10, h: 10 })
    const g = s('g')
    track(c, g, 4, [
      { at: [0, 30], css: 'transform:rotate(0)' },
      { at: 42, css: 'transform:rotate(35deg)' },
      { at: [52, 100], css: 'transform:rotate(0)' },
    ])
    const k = [...g.classList].find((x) => /^tk\d+$/.test(x))!
    expect(k).toBeDefined()
    const css = c.css.join('\n')
    expect(css).toContain(`.${k}{animation:${k} 4s infinite}`)
    expect(css).toContain(
      `@keyframes ${k}{0%,30%{transform:rotate(0)}42%{transform:rotate(35deg)}52%,100%{transform:rotate(0)}}`,
    )
    expect(g.hasAttribute('data-still')).toBe(false)
  })

  it('base style, timing and a still-frame style', () => {
    const c = clipRoot({ w: 10, h: 10 })
    const g = s('g')
    track(c, g, 3.8, [{ at: [0, 100], css: 'opacity:1' }], {
      base: 'transform-origin:6px -8px',
      timing: 'linear',
      still: 'transform:translateY(-40px)',
    })
    const k = g.getAttribute('class')!
    const css = c.css.join('\n')
    expect(css).toContain(`.${k}{transform-origin:6px -8px;animation:${k} 3.8s infinite linear}`)
    expect(css).toContain(`.pf-clip-still .${k}{transform:translateY(-40px)}`)
  })

  it('clamps and rounds stops; rejects a bad loop', () => {
    const c = clipRoot({ w: 10, h: 10 })
    track(c, s('g'), 3, [
      { at: [-5, 33.33333], css: 'opacity:0' },
      { at: 120, css: 'opacity:1' },
    ])
    expect(c.css.join('')).toMatch(/\{0%,33\.33%\{opacity:0\}100%\{opacity:1\}\}/)
    expect(() => track(c, s('g'), 0, [])).toThrow(RangeError)
  })
})

describe('flyAlong flight and easing', () => {
  it('flight: 1 flies the whole beat (no rest), with an easing', () => {
    const c = clipRoot({ w: 10, h: 10 })
    flyAlong(c, 'M0,0 L1,1', 10, { at: 2, dur: 4 }, { flight: 1, ease: 'ease-out' })
    const css = c.css.join('\n')
    expect(css).toMatch(/60%\{offset-distance:100%;opacity:1\}/)
    expect(css).not.toMatch(/42%/)
    expect(css).toMatch(/animation:fl\d+ 10s infinite ease-out/)
  })
  it('defaults stay: 55% flight, no easing', () => {
    const c = clipRoot({ w: 10, h: 10 })
    flyAlong(c, 'M0,0 L1,1', 10, { at: 2, dur: 4 })
    const css = c.css.join('\n')
    expect(css).toMatch(/42%,60%\{offset-distance:100%;opacity:1\}/)
    expect(css).toMatch(/animation:fl\d+ 10s infinite\}/)
  })
})

describe('popText burst', () => {
  it('colour, size and a scale-up pop; default stays the drifting yellow word', () => {
    const c = clipRoot({ w: 10, h: 10 })
    const t = popText(
      c,
      'POWER!',
      { x: 5, y: 6 },
      4,
      { at: 2, dur: 1 },
      { fill: '#ff8a00', size: 26, burst: true },
    )
    expect(t.getAttribute('fill')).toBe('#ff8a00')
    expect(t.getAttribute('font-size')).toBe('26')
    expect(t.getAttribute('font-style')).toBe('italic')
    expect(t.hasAttribute('data-still')).toBe(true)
    const css = c.css.join('\n')
    expect(css).toContain('scale(1.25)')
    expect(css).toContain('transform-box:fill-box')
    noNaN(t)
    const d = popText(c, 'x', { x: 1, y: 1 }, 4, { at: 1, dur: 1 })
    expect(d.getAttribute('fill')).toBe('#ffd24a')
    expect(d.getAttribute('font-size')).toBe('16')
    expect(d.hasAttribute('font-style')).toBe(false)
  })
})
