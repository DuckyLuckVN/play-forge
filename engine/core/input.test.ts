// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { bindInput } from './input'

const press = (target: EventTarget, code: string) => {
  const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true })
  target.dispatchEvent(e)
  return e
}

describe('bindInput keys', () => {
  let off: (() => void) | null = null
  afterEach(() => {
    off?.()
    off = null
    document.body.replaceChildren()
  })

  it('maps a key on the page to its action and takes the key', () => {
    const got: string[] = []
    off = bindInput({ keys: { Space: 'boost' } }, (a) => got.push(a))
    const e = press(document.body, 'Space')
    expect(got).toEqual(['boost'])
    expect(e.defaultPrevented).toBe(true)
  })

  it('leaves keys on UI alone: fields, and anything over a menu overlay (not play, not preventDefault)', () => {
    const got: string[] = []
    off = bindInput({ keys: { Space: 'boost' } }, (a) => got.push(a))
    const overlay = document.createElement('div')
    overlay.className = 'pf-overlay'
    const btn = document.createElement('button')
    const panel = document.createElement('div')
    overlay.append(btn, panel)
    const input = document.createElement('input')
    document.body.append(overlay, input)
    for (const t of [btn, panel, input]) expect(press(t, 'Space').defaultPrevented).toBe(false)
    expect(got).toEqual([])
  })

  it('still plays keys on a focused button outside the overlay (e.g. a top-bar button)', () => {
    const got: string[] = []
    off = bindInput({ keys: { ArrowUp: 'up' } }, (a) => got.push(a))
    const bar = document.createElement('button')
    document.body.append(bar)
    expect(press(bar, 'ArrowUp').defaultPrevented).toBe(true)
    expect(got).toEqual(['up'])
  })
})
