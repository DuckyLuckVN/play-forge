// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { langPanel } from './lang-menu'

describe('langPanel', () => {
  it('is one segmented choice (like the other settings), the current language checked', () => {
    const el = langPanel()
    const group = el.querySelector('[role=radiogroup]')!
    expect(group.getAttribute('aria-label')).toBe('Language')
    const segs = [...group.querySelectorAll<HTMLButtonElement>('[role=radio]')]
    expect(segs.map((b) => b.textContent)).toEqual(['English', 'Tiếng Việt'])
    expect(segs.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect(el.querySelector('.pf-btn.primary')).toBeNull()
  })
})
