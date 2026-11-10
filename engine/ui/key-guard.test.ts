// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { guardGameKeys, isTyping } from './key-guard'

describe('key guard', () => {
  it('blocks game key presses, keeps Esc/Tab and passed codes', () => {
    const seen: string[] = []
    const rec = (e: KeyboardEvent) => seen.push(e.code)
    window.addEventListener('keydown', rec)
    const off = guardGameKeys({ pass: ['KeyV'] })
    for (const [code, key] of [
      ['KeyW', 'w'],
      ['Space', ' '],
      ['KeyV', 'v'],
      ['Escape', 'Escape'],
      ['Tab', 'Tab'],
    ])
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key }))
    expect(seen).toEqual(['KeyV', 'Escape', 'Tab'])
    off()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }))
    expect(seen.at(-1)).toBe('KeyW')
    window.removeEventListener('keydown', rec)
  })
  it('never swallows a release', () => {
    const ups: string[] = []
    const rec = (e: KeyboardEvent) => ups.push(e.code)
    window.addEventListener('keyup', rec)
    const off = guardGameKeys()
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))
    expect(ups).toEqual(['Space'])
    off()
    window.removeEventListener('keyup', rec)
  })
  it('does not preventDefault (native control keys keep working)', () => {
    const off = guardGameKeys()
    const e = new KeyboardEvent('keydown', { code: 'ArrowLeft', cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
    off()
  })
  it('isTyping', () => {
    expect(isTyping(document.createElement('input'))).toBe(true)
    expect(isTyping(document.createElement('textarea'))).toBe(true)
    expect(isTyping(document.createElement('button'))).toBe(false)
    expect(isTyping(null)).toBe(false)
  })
})
