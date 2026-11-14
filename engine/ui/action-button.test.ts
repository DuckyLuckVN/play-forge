// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { actionButton } from './components'

describe('actionButton', () => {
  it('a big start-screen choice: icon, title and a line under it; its name is the title', () => {
    let clicked = 0
    const b = actionButton({
      title: 'Play solo',
      sub: 'Jump in on your own',
      icon: '<svg></svg>',
      onclick: () => clicked++,
      primary: true,
    })
    expect(b.classList.contains('pf-action')).toBe(true)
    expect(b.classList.contains('primary')).toBe(true)
    expect(b.querySelector('.pf-action-title')!.textContent).toBe('Play solo')
    expect(b.querySelector('.pf-action-sub')!.textContent).toBe('Jump in on your own')
    expect(b.querySelector('.pf-action-icon svg')).not.toBeNull()
    b.click()
    expect(clicked).toBe(1)
  })
})
