// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTooltips, setShortcut } from './tooltip'

let off: () => void
let btn: HTMLButtonElement

const pointer = (type: string, target: EventTarget, pointerType = 'mouse', related: EventTarget | null = null) => {
  const e = new Event(type, { bubbles: true })
  Object.assign(e, { pointerType, relatedTarget: related })
  target.dispatchEvent(e)
}
const tip = () => document.querySelector<HTMLElement>('.pf-tip')

beforeEach(() => {
  vi.useFakeTimers()
  document.body.replaceChildren()
  btn = document.createElement('button')
  btn.title = 'Mute microphone'
  document.body.append(btn)
  off = installTooltips()
})
afterEach(() => {
  off()
  vi.useRealTimers()
})

describe('tooltips', () => {
  it('a mouse hover shows the styled tip (after a short delay) instead of the browser one', () => {
    pointer('pointerover', btn)
    expect(btn.hasAttribute('title')).toBe(false) // no native tooltip on top
    expect(btn.getAttribute('aria-label') ?? btn.dataset.tip).toBeTruthy()
    expect(tip()?.hidden ?? true).toBe(true)
    vi.advanceTimersByTime(400)
    expect(tip()!.hidden).toBe(false)
    expect(tip()!.textContent).toBe('Mute microphone')
    expect(tip()!.getAttribute('role')).toBe('tooltip')
  })

  it('shows the shortcut as a key cap', () => {
    setShortcut(btn, 'M')
    expect(btn.getAttribute('aria-keyshortcuts')).toBe('M')
    pointer('pointerover', btn)
    vi.advanceTimersByTime(400)
    const kbd = tip()!.querySelector('kbd.pf-key')!
    expect(kbd.textContent).toBe('M')
    expect(kbd.classList.contains('sym')).toBe(false)
    setShortcut(btn, '`')
    expect(btn.getAttribute('aria-keyshortcuts')).toBe('`')
    pointer('pointerout', btn, 'mouse', document.body)
    pointer('pointerover', btn)
    vi.advanceTimersByTime(400)
    // The backtick alone is a speck: the cap shows the key's two printed marks.
    const sym = tip()!.querySelector('kbd.pf-key')!
    expect(sym.textContent).toBe('~ `')
    expect(sym.classList.contains('sym')).toBe(true)
    setShortcut(btn, 'M')
    expect(tip()!.querySelector('.pf-tip-text')!.textContent).toBe('Mute microphone')
  })

  it('a held key reads "hold V"', () => {
    setShortcut(btn, 'V', { hold: true })
    pointer('pointerover', btn)
    vi.advanceTimersByTime(400)
    expect(tip()!.querySelector('.pf-tip-keys')!.textContent).toBe('holdV')
  })

  it('a label changed later still shows the new text', () => {
    pointer('pointerover', btn)
    pointer('pointerout', btn, 'mouse', document.body)
    btn.title = 'Unmute microphone'
    pointer('pointerover', btn)
    vi.advanceTimersByTime(400)
    expect(tip()!.textContent).toBe('Unmute microphone')
  })

  it('hides when the pointer leaves or presses', () => {
    pointer('pointerover', btn)
    vi.advanceTimersByTime(400)
    pointer('pointerdown', btn)
    expect(tip()!.hidden).toBe(true)
    pointer('pointerover', btn)
    vi.advanceTimersByTime(400)
    pointer('pointerout', btn, 'mouse', document.body)
    expect(tip()!.hidden).toBe(true)
  })

  it('touch never shows one (phones)', () => {
    pointer('pointerover', btn, 'touch')
    vi.advanceTimersByTime(400)
    expect(tip()?.hidden ?? true).toBe(true)
  })

  it('setShortcut(null) clears it', () => {
    setShortcut(btn, 'M')
    setShortcut(btn, null)
    expect(btn.hasAttribute('aria-keyshortcuts')).toBe(false)
    expect(btn.dataset.key).toBeUndefined()
  })

  it('keyboard: a tip only when Tab moved focus there (not when a menu focuses its first item)', () => {
    const matches = vi.spyOn(btn, 'matches').mockReturnValue(true) // jsdom has no :focus-visible
    btn.focus()
    expect(tip()?.hidden ?? true).toBe(true)
    btn.blur()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    btn.focus()
    expect(tip()!.hidden).toBe(false)
    matches.mockRestore()
  })

  it('a group can ask for tips on the left (the floating fan: above would cover the next button)', () => {
    const group = document.createElement('div')
    group.dataset.tipSide = 'left'
    group.append(btn)
    document.body.append(group)
    btn.getBoundingClientRect = () => ({ top: 300, bottom: 348, left: 900, right: 948, width: 48, height: 48 }) as DOMRect
    pointer('pointerover', btn)
    vi.advanceTimersByTime(400)
    expect(tip()!.dataset.side).toBe('left')
    expect(parseFloat(tip()!.style.left)).toBeLessThan(900)
  })
})

