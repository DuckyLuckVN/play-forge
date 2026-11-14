// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from './dom'

afterEach(() => {
  vi.useRealTimers()
  document.querySelectorAll('.pf-toast').forEach((e) => e.remove())
})

describe('toast', () => {
  it('plain text with a colour dot, as before', () => {
    toast('Bao joined', '#5ab8ff')
    const el = document.querySelector<HTMLElement>('.pf-toast:last-child')!
    expect(el.textContent).toBe('Bao joined')
    expect(el.style.getPropertyValue('--pf-toast-dot')).toBe('#5ab8ff')
    expect(el.querySelector('.pf-toast-name')).toBeNull()
  })

  it('a chat message highlights the sender: their name in a pill of their colour, then the text', () => {
    toast('see you at the net!', '#ff6fb5', { name: 'Bao' })
    const el = document.querySelector<HTMLElement>('.pf-toast:last-child')!
    const name = el.querySelector<HTMLElement>('.pf-toast-name')!
    expect(name.textContent).toBe('Bao')
    expect(el.style.getPropertyValue('--pf-toast-dot')).toBe('#ff6fb5')
    expect(el.classList.contains('named')).toBe(true)
    expect(el.querySelector('.pf-toast-text')!.textContent).toBe('see you at the net!')
  })

  it('names and messages are text, never HTML', () => {
    toast('<img src=x onerror=alert(1)>', undefined, { name: '<b>x</b>' })
    const el = document.querySelector<HTMLElement>('.pf-toast:last-child')!
    expect(el.querySelector('img, b')).toBeNull()
  })

  it('stays longer when asked (a chat line takes a moment to read)', () => {
    vi.useFakeTimers()
    toast('hello there', undefined, { name: 'Bao', ms: 5000 })
    const el = document.querySelector<HTMLElement>('.pf-toast:last-child')!
    vi.advanceTimersByTime(3000)
    expect(el.isConnected).toBe(true)
    vi.advanceTimersByTime(2500)
    expect(el.isConnected).toBe(false)
  })
})
