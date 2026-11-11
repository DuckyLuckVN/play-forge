// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { guideList, openGuide, type GuideStep } from './guide'

const STEPS: GuideStep[] = [
  { action: 'Swing', mouse: 'click' },
  { action: 'Charge', hold: true, mouse: 'hold' },
  { action: 'Dive', mouse: 'right' },
  { action: 'Aim', mouse: 'drag' },
]

afterEach(() => document.body.replaceChildren())

describe('guide card (dialog)', () => {
  it('a click inside the card keeps it open; a click on the backdrop closes it', () => {
    const onClose = vi.fn()
    openGuide(STEPS, { touch: false, onClose })
    const layer = document.querySelector<HTMLElement>('.pf-guide-layer')!
    const card = layer.querySelector<HTMLElement>('.pf-guide-panel')!
    card.click()
    card.querySelector<HTMLElement>('.pf-guide-row')!.click()
    expect(document.querySelector('.pf-guide-layer')).not.toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    layer.click()
    expect(document.querySelector('.pf-guide-layer')).toBeNull()
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('mouse icons', () => {
  it('name the button: Left click / Right click / Left drag, the pressed half marked', () => {
    const list = guideList(STEPS, false)
    const labels = [...list.querySelectorAll('.pf-guide-mouse')].map((e) => e.textContent)
    expect(labels).toEqual(['Left click', 'Left click', 'Right click', 'Left drag'])
    const marked = [...list.querySelectorAll('.pf-guide-icon svg')].map(
      (s) => s.querySelectorAll('.pf-mouse-on').length,
    )
    expect(marked).toEqual([1, 1, 1, 1])
  })
})
