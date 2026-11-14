// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settingsSheet, type SettingsSheet, type SettingsTab } from './settings-sheet'

const tab = (id: string): SettingsTab => ({
  id,
  label: id.toUpperCase(),
  body: () => Object.assign(document.createElement('p'), { textContent: `${id} body` }),
})
const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('.pf-sheet-tab')]
const shown = () => q('.pf-sheet-body')?.textContent
const key = (k: string, code = k) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true }))

let sheet: SettingsSheet
beforeEach(() => localStorage.clear())
afterEach(() => {
  sheet?.close()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('settingsSheet', () => {
  it('opens on the first tab with a button per tab', () => {
    sheet = settingsSheet([tab('sound'), tab('lang')])
    sheet.open()
    expect(sheet.isOpen).toBe(true)
    expect(q('.pf-sheet')?.getAttribute('role')).toBe('dialog')
    expect(tabs().map((b) => b.textContent)).toEqual(['SOUND', 'LANG'])
    expect(shown()).toBe('sound body')
  })

  it('switches tabs and reopens on the last one used', () => {
    sheet = settingsSheet([tab('sound'), tab('lang')])
    sheet.open()
    tabs()[1].click()
    expect(shown()).toBe('lang body')
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true')
    sheet.close()
    const again = settingsSheet([tab('sound'), tab('lang')])
    again.open()
    expect(shown()).toBe('lang body')
    again.close()
  })

  it('opens on a requested tab', () => {
    sheet = settingsSheet([tab('sound'), tab('game')])
    sheet.open('game')
    expect(shown()).toBe('game body')
  })

  it('closes on Esc, on the backdrop and on ✕, not on a click inside', () => {
    sheet = settingsSheet([tab('sound')])
    sheet.open()
    q('.pf-sheet-body')!.click()
    expect(sheet.isOpen).toBe(true)
    key('Escape')
    expect(sheet.isOpen).toBe(false)
    expect(q('.pf-sheet-backdrop')).toBeNull()
    sheet.open()
    q('.pf-sheet-backdrop')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(sheet.isOpen).toBe(false)
    sheet.open()
    q('.pf-sheet-close')!.click()
    expect(sheet.isOpen).toBe(false)
  })

  it('keeps Esc away from the game (it does not also toggle the pause menu)', () => {
    const game = vi.fn()
    window.addEventListener('keydown', game)
    sheet = settingsSheet([tab('sound')])
    sheet.open()
    key('Escape')
    expect(game).not.toHaveBeenCalled()
    window.removeEventListener('keydown', game)
  })

  it('blocks game keys while open and releases them on close; push-to-talk still passes', () => {
    const game = vi.fn()
    window.addEventListener('keydown', game)
    sheet = settingsSheet([tab('sound')])
    sheet.open()
    key(' ', 'Space')
    expect(game).not.toHaveBeenCalled()
    key('v', 'KeyV')
    expect(game).toHaveBeenCalledTimes(1)
    sheet.close()
    key(' ', 'Space')
    expect(game).toHaveBeenCalledTimes(2)
    window.removeEventListener('keydown', game)
  })

  it('the ⚙ button opens it', () => {
    sheet = settingsSheet([tab('sound')])
    document.body.append(sheet.button)
    sheet.button.click()
    expect(sheet.isOpen).toBe(true)
  })

  it('setTabs falls back to the first tab when the current one is gone', () => {
    sheet = settingsSheet([tab('sound'), tab('voice')])
    sheet.open('voice')
    sheet.setTabs([tab('sound')])
    expect(shown()).toBe('sound body')
    expect(tabs()).toHaveLength(1)
  })

  it('works when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    sheet = settingsSheet([tab('sound'), tab('lang')])
    sheet.open()
    tabs()[1].click()
    expect(shown()).toBe('lang body')
  })
})
