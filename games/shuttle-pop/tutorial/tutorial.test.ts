// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClipContext, TutorialCard } from '@forge/ui/tutorial'
import { SETTING_LABELS, viewPanel } from '../camera-menu'
import { shuttleTutorial } from './index'

const ctx: ClipContext = { reducedMotion: false, touch: false }
const card = (cards: TutorialCard[], id: string) => cards.find((c) => c.id === id)!

describe('shuttleTutorial deck', () => {
  it('has the six cards in order, ending on settings', () => {
    expect(shuttleTutorial().map((c) => c.id)).toEqual(['tap', 'charge', 'aim', 'smash', 'dive', 'settings'])
  })
})

const touch: ClipContext = { reducedMotion: false, touch: true }
const still: ClipContext = { reducedMotion: true, touch: false }
const MOVES = ['tap', 'charge', 'smash', 'dive'] as const
/** flyAlong balls (class flNb) shown in the still frame. */
const stillBalls = (svg: Element) =>
  [...svg.querySelectorAll('[data-still]')].filter((e) => [...e.classList].some((k) => /^fl\d+b$/.test(k)))

describe('move clips (tap, charge, smash, dive)', () => {
  const clip = (id: string, c: ClipContext = ctx) => card(shuttleTutorial(), id).clip!(c) as SVGSVGElement

  it.each(MOVES)('%s: a 400x300 court clip, no NaN, on every device', (id) => {
    for (const c of [ctx, touch, still]) {
      const svg = clip(id, c)
      expect(svg.getAttribute('viewBox')).toBe('0 0 400 300')
      expect(svg.outerHTML).not.toContain('NaN')
      expect(svg.querySelectorAll('style')).toHaveLength(1)
      expect(svg.textContent).toContain('OPPONENT')
      expect(svg.textContent).toContain('YOU')
    }
  })

  it.each(MOVES)('%s: one coherent still frame: still class, the return shot only', (id) => {
    const svg = clip(id, still)
    expect(svg.classList.contains('pf-clip-still')).toBe(true)
    expect(stillBalls(svg)).toHaveLength(1)
    expect(svg.querySelectorAll('.sp-tut-trail[data-still]').length).toBeGreaterThan(0)
    expect(svg.querySelector('style')!.textContent).toContain('.pf-clip-still')
  })

  it('badges and pops', () => {
    expect(clip('tap').textContent).toContain('TAP')
    expect(clip('tap').textContent).toContain('quick swing')
    const charge = clip('charge').textContent!
    for (const w of ['POWER', 'hold… charging', 'release!', 'POWER!']) expect(charge).toContain(w)
    expect(clip('smash').textContent).toContain('SMASH!')
    expect(clip('dive').textContent).toContain('DIVE')
    expect(clip('dive').textContent).toContain('reach far shuttles')
    expect(clip('dive').textContent).toContain('SAVE!')
  })

  it('the charge clip has a charge ring; reduced motion shows it full, with "release!"', () => {
    expect(clip('charge').querySelectorAll('.sp-tut-charge')).toHaveLength(1)
    for (const id of ['tap', 'smash', 'dive']) expect(clip(id).querySelector('.sp-tut-charge')).toBeNull()
    const svg = clip('charge', still)
    expect(svg.querySelector('.sp-tut-charge[data-still]')).not.toBeNull()
    const release = [...svg.querySelectorAll('text')].find((t) => t.textContent === 'release!')!
    const hold = [...svg.querySelectorAll('text')].find((t) => t.textContent === 'hold… charging')!
    expect(release.hasAttribute('data-still')).toBe(true)
    const style = svg.querySelector('style')!.textContent!
    const holdK = [...hold.classList].find((k) => /^tk\d+$/.test(k))!
    expect(style).toContain(`.pf-clip-still .${holdK}{opacity:0}`)
  })

  it('PC badges show the mouse and keycaps; touch badges show the touch buttons instead', () => {
    const keys = (svg: Element) => [...svg.querySelectorAll('.sp-tut-cap text')].map((t) => t.textContent)
    expect(clip('tap').querySelectorAll('.sp-tut-mouse')).toHaveLength(1)
    expect(clip('charge').querySelectorAll('.sp-tut-mouse')).toHaveLength(1)
    expect(keys(clip('smash'))).toEqual(['SPACE'])
    expect(clip('smash').querySelectorAll('.sp-tut-mouse')).toHaveLength(1)
    expect(keys(clip('dive'))).toEqual(['SHIFT'])
    const glyphs = (id: string) =>
      [...clip(id, touch).querySelectorAll('.sp-tut-glyph')].map((g) => g.getAttribute('data-glyph'))
    expect(glyphs('tap')).toEqual(['swing'])
    expect(glyphs('charge')).toEqual(['swing'])
    expect(glyphs('smash')).toEqual(['jump', 'swing'])
    expect(glyphs('dive')).toEqual(['dive'])
    for (const id of MOVES) {
      const svg = clip(id, touch)
      expect(svg.querySelector('.sp-tut-mouse')).toBeNull()
      expect(keys(svg)).toEqual([])
      expect(clip(id).querySelector('.sp-tut-glyph')).toBeNull()
    }
  })

  it('copy: captions and hints', () => {
    const cards = shuttleTutorial()
    expect(MOVES.map((id) => [card(cards, id).title, card(cards, id).caption, card(cards, id).hint])).toEqual(
      [
        ['Tap to swing', 'Tap for a quick swing', { pc: 'Click', touch: 'Tap 🏸' }],
        [
          'Power shot',
          'Hold to charge… release!',
          { pc: 'Hold left click, then release', touch: 'Hold 🏸, then release' },
        ],
        [
          'Jump smash',
          'Jump, then swing on a high shuttle',
          { pc: 'Space, then click', touch: 'Jump button, then 🏸' },
        ],
        ['Dive', 'Dive to reach a far shuttle', { pc: 'Shift or right click', touch: 'Dive button' }],
      ],
    )
  })

  it('dive: a small cooldown note under the clip, on every device', () => {
    for (const c of [ctx, touch]) {
      const note = card(shuttleTutorial(), 'dive').below!(c) as HTMLElement
      expect(note.className).toBe('sp-tut-note')
      expect(note.textContent).toContain('Jump and dive share a cooldown')
    }
  })
})

describe('aim clip', () => {
  const aim = () => card(shuttleTutorial(), 'aim')
  const build = (c: ClipContext = ctx) => {
    const a = aim()
    const svg = a.clip!(c) as SVGSVGElement
    const below = a.below!(c) as HTMLElement
    return { svg, below }
  }

  it('is a 400x300 SVG with 5 shots and 5 landing rings, no direction arrows', () => {
    const { svg } = build()
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 300')
    expect(svg.querySelectorAll('.sp-tut-shot')).toHaveLength(5)
    expect(svg.querySelectorAll('.sp-tut-ring')).toHaveLength(5)
    expect(svg.querySelectorAll('marker, [class*="arrow"], [data-arrow]')).toHaveLength(0)
    expect(svg.outerHTML).not.toContain('NaN')
  })

  it('names every shot in its badge', () => {
    const text = build().svg.textContent!
    for (const n of ['SMASH', 'CLEAR', 'DROP', 'LEFT', 'RIGHT']) expect(text).toContain(n)
  })

  it('below: WASD pad + a no-key chip, lit in sync (keyframes in the clip style)', () => {
    const { svg, below } = build()
    expect([...below.querySelectorAll('.pf-pad-key')].map((k) => k.textContent)).toEqual([
      'W',
      'A',
      'S',
      'D',
      'no key',
    ])
    const style = svg.querySelector('style')!.textContent!
    const lit = [...below.querySelectorAll('.pf-pad-key')].map((k) =>
      [...k.classList].find((x) => /^kp\d+$/.test(x)),
    )
    expect(lit.every(Boolean)).toBe(true)
    for (const k of lit) expect(style).toContain(`@keyframes ${k}{`)
  })

  it('reduced motion: still clip and still pad, one shot in the still frame', () => {
    const { svg, below } = build({ reducedMotion: true, touch: false })
    expect(svg.classList.contains('pf-clip-still')).toBe(true)
    expect(below.querySelector('.pf-pad')!.classList.contains('pf-clip-still')).toBe(true)
    const still = svg.querySelectorAll('.sp-tut-shot[data-still]')
    expect(still).toHaveLength(1)
    expect(still[0].textContent).toContain('SMASH')
    expect(svg.querySelectorAll('.sp-tut-ring')[0].closest('[data-still]')).not.toBeNull()
    expect(svg.querySelectorAll('.sp-tut-ring')[1].closest('[data-still]')).toBeNull()
  })

  it('touch: no key pad or "no key" chip, badges show stick directions instead of keys', () => {
    const a = aim()
    const svg = a.clip!(touch) as SVGSVGElement
    expect(a.below!(touch)).toBeNull()
    const caps = [...svg.querySelectorAll('.sp-tut-shot')].map((g) => g.querySelector('text')!.textContent)
    expect(caps).toEqual(['↑', '↓', '—', '←', '→'])
    expect(svg.outerHTML).not.toContain('NaN')
  })

  it('pc and touch hints', () => {
    expect(aim().hint).toEqual({
      pc: 'Hold W / A / S / D while you swing',
      touch: 'Push the stick the same way while you swing',
    })
    expect(aim().caption).toBe('Hold a direction while you swing')
  })
})

describe('settings card', () => {
  const body = () => card(shuttleTutorial(), 'settings').body!(ctx) as HTMLElement

  it('names the settings exactly as the view-settings menu does', () => {
    const names = [...body().querySelectorAll('.sp-tut-name')].map((b) => b.textContent)
    expect(names.slice(0, 3)).toEqual([
      SETTING_LABELS.ring,
      SETTING_LABELS.autoSwing,
      SETTING_LABELS.graphics,
    ])
    const menu = viewPanel()
      .nodes.flatMap((n) => [...n.querySelectorAll('.pf-option-label')])
      .map((l) => l.textContent)
    for (const n of names.slice(0, 3)) expect(menu).toContain(n)
  })

  it('points every setting at the ⚙ Settings sheet (no corner button, no More menu any more)', () => {
    const places = [...body().querySelectorAll('.sp-tut-place')].map((p) => p.textContent)
    expect(places).toEqual(['Settings › View', 'Settings › View', 'Settings › View', 'Settings'])
  })

  it('lists match options and how to replay', () => {
    const text = body().textContent!
    for (const s of ['1 vs 1', '2 vs 2', 'Computer level', 'Court size', 'How to play', 'Sound', 'Language'])
      expect(text).toContain(s)
  })
})

describe('Vietnamese', () => {
  afterEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('translates every title, caption, hint and shot badge', async () => {
    const en = shuttleTutorial()
    localStorage.setItem('pf.lang', 'vi')
    vi.resetModules()
    const { shuttleTutorial: viTutorial } = await import('./index')
    const vn = viTutorial()
    expect(vn.map((c) => c.id)).toEqual(en.map((c) => c.id))
    vn.forEach((c, i) => {
      expect(c.title).not.toBe(en[i].title)
      expect(c.caption).not.toBe(en[i].caption)
      if (en[i].hint?.pc) expect(c.hint?.pc).not.toBe(en[i].hint!.pc)
      if (en[i].hint?.touch) expect(c.hint?.touch).not.toBe(en[i].hint!.touch)
    })
    const svg = card(vn, 'aim').clip!(ctx)
    for (const n of ['SMASH', 'CLEAR', 'DROP', 'LEFT', 'RIGHT', 'OPPONENT', 'YOU'])
      expect(svg.textContent).not.toContain(n)
    const moves = MOVES.map((id) => card(vn, id).clip!(ctx).textContent!).join(' ')
    for (const n of [
      'TAP',
      'quick swing',
      'POWER',
      'hold… charging',
      'release!',
      'SMASH',
      'DIVE',
      'reach far shuttles',
      'SAVE!',
    ])
      expect(moves).not.toContain(n)
    expect(card(vn, 'dive').below!(ctx)!.textContent).not.toContain('cooldown')
    const body = card(vn, 'settings').body!(ctx).textContent!
    expect(body).not.toContain('Before a match')
    expect(body).not.toContain('How to play')
  })
})
