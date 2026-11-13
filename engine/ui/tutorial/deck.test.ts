// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openGuide } from '../guide'
import { openTutorial, tutorialButton, type ClipContext, type TutorialCard } from './deck'

const cards = (n = 3, extra: Partial<TutorialCard> = {}): TutorialCard[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, title: `T${i}`, caption: `C${i}`, ...extra }))

const layer = () => document.querySelector<HTMLElement>('.pf-tut-layer')
const btn = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label)
const title = () => document.querySelector('.pf-tut-title')?.textContent
const key = (code: string) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }))

afterEach(() => document.body.replaceChildren())

describe('tutorial deck navigation', () => {
  it('opens on card 1 with one dot per card', () => {
    openTutorial(cards(3), { touch: false })
    expect(title()).toBe('T0')
    expect(document.querySelectorAll('.pf-tut-dots i')).toHaveLength(3)
  })

  it('Next advances; last card shows "Let\'s play!" which closes with done once', () => {
    const onClose = vi.fn()
    openTutorial(cards(2), { onClose })
    expect(btn("Let's play!")).toBeUndefined()
    btn('Next')!.click()
    expect(title()).toBe('T1')
    expect(btn('Next')).toBeUndefined()
    btn("Let's play!")!.click()
    expect(onClose).toHaveBeenCalledExactlyOnceWith('done')
    expect(layer()).toBeNull()
  })

  it('Skip is on every card and reports skipped', () => {
    const onClose = vi.fn()
    openTutorial(cards(2), { onClose })
    expect(btn('Skip')).toBeDefined()
    btn('Next')!.click()
    btn('Skip')!.click()
    expect(onClose).toHaveBeenCalledExactlyOnceWith('skipped')
  })

  it('close() reports dismissed; second call is a no-op', () => {
    const onClose = vi.fn()
    const close = openTutorial(cards(), { onClose })
    close()
    close()
    expect(onClose).toHaveBeenCalledExactlyOnceWith('dismissed')
    expect(layer()).toBeNull()
  })

  it('backdrop click does not close', () => {
    const onClose = vi.fn()
    openTutorial(cards(), { onClose })
    layer()!.click()
    expect(layer()).not.toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('tutorial deck keys', () => {
  it('arrows navigate, Escape skips', () => {
    const onClose = vi.fn()
    openTutorial(cards(3), { onClose })
    key('ArrowRight')
    expect(title()).toBe('T1')
    key('ArrowLeft')
    expect(title()).toBe('T0')
    key('ArrowLeft')
    expect(title()).toBe('T0')
    key('Escape')
    expect(onClose).toHaveBeenCalledExactlyOnceWith('skipped')
  })

  it('keydown does not reach window bubbling listeners; listener removed after close', () => {
    const spy = vi.fn()
    window.addEventListener('keydown', spy)
    const close = openTutorial(cards())
    key('ArrowRight')
    key('KeyW')
    expect(spy).not.toHaveBeenCalled()
    close()
    key('KeyW')
    expect(spy).toHaveBeenCalledOnce()
    window.removeEventListener('keydown', spy)
  })
})

describe('tutorial deck device and options', () => {
  const hinted = cards(1, { hint: { pc: 'PC hint', touch: 'Touch hint' } })
  it('shows only the touch hint on touch, only pc hint otherwise', () => {
    openTutorial(hinted, { touch: true })
    expect(document.querySelector('.pf-tut-hint')?.textContent).toBe('Touch hint')
    document.body.replaceChildren()
    openTutorial(hinted, { touch: false })
    expect(document.querySelector('.pf-tut-hint')?.textContent).toBe('PC hint')
  })

  it('passes reducedMotion and touch to clip, body and below', () => {
    const seen: ClipContext[] = []
    const mk = (ctx: ClipContext) => {
      seen.push(ctx)
      return document.createElement('div')
    }
    openTutorial(cards(1, { clip: mk, body: mk, below: mk }), { reducedMotion: true, touch: true })
    expect(seen).toHaveLength(3)
    for (const c of seen) expect(c).toEqual({ reducedMotion: true, touch: true })
  })

  it('below may return null for a device: nothing is added', () => {
    openTutorial(cards(1, { below: (ctx) => (ctx.touch ? null : document.createElement('i')) }), {
      touch: true,
    })
    const card = document.querySelector('.pf-tut-card')!
    expect(card.lastChild).toBe(card.querySelector('.pf-tut-caption'))
  })

  it('fullControls link shows only on last card and keeps deck open', () => {
    const fullControls = vi.fn()
    openTutorial(cards(2), { fullControls })
    expect(btn('Full controls ›')).toBeUndefined()
    btn('Next')!.click()
    btn('Full controls ›')!.click()
    expect(fullControls).toHaveBeenCalledOnce()
    expect(layer()).not.toBeNull()
  })

  it('guide opened from Full controls sits on top: Esc / arrows go to it, not the deck', () => {
    const onClose = vi.fn()
    openTutorial(cards(2), {
      onClose,
      fullControls: () => openGuide([{ action: 'Jump', keys: [['Space']] }]),
    })
    btn('Next')!.click()
    btn('Full controls ›')!.click()
    const guideLayer = () => document.querySelector('.pf-guide-layer:not(.pf-tut-layer)')
    expect(guideLayer()).not.toBeNull()
    // Opened later, so it's later in the DOM: same z-index, painted above the deck.
    expect(layer()!.compareDocumentPosition(guideLayer()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    key('ArrowLeft')
    expect(title()).toBe('T1')
    key('Escape')
    expect(guideLayer()).toBeNull()
    expect(layer()).not.toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    key('Escape')
    expect(onClose).toHaveBeenCalledExactlyOnceWith('skipped')
  })

  it('no fullControls link when option unset', () => {
    openTutorial(cards(1))
    expect(btn('Full controls ›')).toBeUndefined()
  })

  it('shows step counter text', () => {
    openTutorial(cards(3))
    expect(document.querySelector('.pf-tut-step')?.textContent).toBe('Step 1 of 3')
  })
})

describe('tutorial deck accessibility and swipe', () => {
  it('dialog roles; focus moves in and is restored', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const close = openTutorial(cards())
    const dlg = document.querySelector('[role="dialog"]')!
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.getAttribute('aria-label')).toBe('How to play')
    expect(dlg.contains(document.activeElement)).toBe(true)
    close()
    expect(document.activeElement).toBe(opener)
  })

  const pointer = (el: Element, type: string, x: number) =>
    el.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true }))

  it('swipe left = next, swipe right = back, tiny move ignored', () => {
    openTutorial(cards(3))
    const card = () => document.querySelector('.pf-tut-card')!
    pointer(card(), 'pointerdown', 200)
    pointer(card(), 'pointerup', 100)
    expect(title()).toBe('T1')
    pointer(card(), 'pointerdown', 100)
    pointer(card(), 'pointerup', 200)
    expect(title()).toBe('T0')
    pointer(card(), 'pointerdown', 100)
    pointer(card(), 'pointerup', 110)
    expect(title()).toBe('T0')
  })
})

describe('tutorialButton', () => {
  it('is a How to play button that calls open', () => {
    const open = vi.fn()
    const b = tutorialButton(open)
    expect(b.textContent).toBe('How to play')
    b.click()
    expect(open).toHaveBeenCalledOnce()
  })
})
