// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FullscreenChrome, HIDE_AFTER_MS } from './fullscreen-chrome'

let live: FullscreenChrome | null = null

function setup() {
  live?.dispose()
  document.body.innerHTML = ''
  document.documentElement.className = ''
  const shell = document.createElement('div')
  const bar = document.createElement('header')
  const inBar = document.createElement('button')
  bar.append(inBar)
  const game = document.createElement('canvas')
  shell.append(bar, game)
  document.body.append(shell)
  const chrome = (live = new FullscreenChrome(bar))
  const root = document.documentElement
  const handle = shell.querySelector<HTMLButtonElement>('.pf-fs-handle')!
  return { chrome, root, bar, inBar, game, handle }
}

const down = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }))

describe('FullscreenChrome', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('adds one handle next to the bar, and marks the page while fullscreen', () => {
    const { chrome, root, handle } = setup()
    expect(handle).toBeTruthy()
    expect(document.querySelectorAll('.pf-fs-handle')).toHaveLength(1)
    chrome.set(true)
    expect(root.classList.contains('pf-fullscreen')).toBe(true)
    expect(root.classList.contains('pf-bar-shown')).toBe(false)
    chrome.set(false)
    expect(root.classList.contains('pf-fullscreen')).toBe(false)
  })

  it('the handle shows the bar; it tucks away again after a while', () => {
    const { chrome, root, handle } = setup()
    chrome.set(true)
    handle.click()
    expect(root.classList.contains('pf-bar-shown')).toBe(true)
    vi.advanceTimersByTime(HIDE_AFTER_MS + 10)
    expect(root.classList.contains('pf-bar-shown')).toBe(false)
  })

  it('using the bar keeps it up; a tap on the game hides it; the handle toggles', () => {
    const { chrome, root, handle, inBar, game } = setup()
    chrome.set(true)
    handle.click()
    vi.advanceTimersByTime(HIDE_AFTER_MS - 100)
    down(inBar)
    vi.advanceTimersByTime(HIDE_AFTER_MS - 100)
    expect(root.classList.contains('pf-bar-shown')).toBe(true)
    down(game)
    expect(root.classList.contains('pf-bar-shown')).toBe(false)
    handle.click()
    handle.click()
    expect(root.classList.contains('pf-bar-shown')).toBe(false)
  })

  it('leaving fullscreen clears the shown bar; the handle does nothing outside fullscreen', () => {
    const { chrome, root, handle } = setup()
    chrome.set(true)
    handle.click()
    chrome.set(false)
    expect(root.classList.contains('pf-bar-shown')).toBe(false)
    handle.click()
    expect(root.classList.contains('pf-bar-shown')).toBe(false)
  })
})
