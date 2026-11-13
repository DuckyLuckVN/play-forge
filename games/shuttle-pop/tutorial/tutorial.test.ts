// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClipContext, TutorialCard } from '@forge/ui/tutorial'
import { SETTING_LABELS, viewPanel } from '../camera-menu'
import { shuttleTutorial } from './index'

const ctx: ClipContext = { reducedMotion: false, touch: false }
const card = (cards: TutorialCard[], id: string) => cards.find((c) => c.id === id)!

describe('shuttleTutorial deck', () => {
  it('has unique ids and ends on settings', () => {
    const cards = shuttleTutorial()
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length)
    expect(cards.map((c) => c.id)).toContain('aim')
    expect(cards[cards.length - 1].id).toBe('settings')
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
    const body = card(vn, 'settings').body!(ctx).textContent!
    expect(body).not.toContain('Before a match')
    expect(body).not.toContain('How to play')
  })
})
