// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../audio/sound', () => ({ playSound: vi.fn() }))

import { reactionPicker } from './reaction-ui'

const press = (code: string, target: EventTarget = window) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { code, key: '`', bubbles: true, cancelable: true }))
const panel = (root: HTMLElement) => root.querySelector<HTMLElement>('.pf-popover')!

afterEach(() => document.body.replaceChildren())

describe('emoji tray shortcut', () => {
  it('` opens and closes the tray; its button shows [`]', () => {
    const root = reactionPicker(() => true)
    document.body.append(root)
    expect(root.querySelector('button')!.dataset.key).toBe('`')
    expect(panel(root).hidden).toBe(true)
    press('Backquote')
    expect(panel(root).hidden).toBe(false)
    press('Backquote')
    expect(panel(root).hidden).toBe(true)
  })

  it('ignored while typing, and when the tray is not on screen (solo, no room)', () => {
    const root = reactionPicker(() => true)
    const hiddenWrap = document.createElement('div')
    hiddenWrap.hidden = true
    hiddenWrap.append(root)
    document.body.append(hiddenWrap)
    press('Backquote')
    expect(panel(root).hidden).toBe(true)

    hiddenWrap.hidden = false
    const input = document.createElement('input')
    document.body.append(input)
    press('Backquote', input)
    expect(panel(root).hidden).toBe(true)
  })

  it('opens from inside the folded fan (a closed popover panel), which then unfolds via CSS', () => {
    const root = reactionPicker(() => true)
    const fanPanel = document.createElement('div')
    fanPanel.className = 'pf-popover pf-fan'
    fanPanel.hidden = true
    fanPanel.append(root)
    document.body.append(fanPanel)
    press('Backquote')
    expect(panel(root).hidden).toBe(false)
  })
})
