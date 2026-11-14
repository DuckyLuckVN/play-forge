// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { viewSettings } from './camera-menu'
import { settingsSheet, type SettingsSheet } from '../../engine/ui/settings-sheet'
import { prefs } from './prefs'
import { bindInput } from './input'
import { VI } from './i18n'

let view: HTMLElement
let sheet: SettingsSheet

// The view settings live in the shell's settings sheet (Game tab), opened here like a player would.
beforeEach(() => {
  document.body.innerHTML = ''
  view = document.createElement('div')
  document.body.append(view)
  sheet = settingsSheet([{ id: 'game', label: 'View', body: viewSettings }])
  sheet.open('game')
})
afterEach(() => sheet.close())

const panel = () => document.querySelector<HTMLElement>('.pf-sheet-body')!
const key = (type: string, init: KeyboardEventInit, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }))

describe('ring picker', () => {
  it('three choices, current one checked, click saves and re-checks', () => {
    prefs.set({ ring: 'always' })
    const segs = [...panel().querySelectorAll<HTMLButtonElement>('.sp-ring-row [role=radio]')]
    expect(segs.map((b) => b.textContent)).toEqual(['Hidden', 'Near drop', 'Always'])
    expect(segs.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    segs[1].click()
    expect(prefs.get().ring).toBe('near')
    expect(segs[1].getAttribute('aria-checked')).toBe('true')
    expect(segs[1].classList.contains('on')).toBe(true)
    expect(segs[2].classList.contains('on')).toBe(false)
    expect(panel().hidden).toBe(false)
  })

  it('flight path row: Off / Near drop / Always, off by default, click saves', () => {
    prefs.set({ path: 'hidden' })
    const segs = [...panel().querySelectorAll<HTMLButtonElement>('.sp-path-row [role=radio]')]
    expect(segs.map((b) => b.textContent)).toEqual(['Off', 'Near drop', 'Always'])
    expect(segs.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    segs[2].click()
    expect(prefs.get().path).toBe('always')
    expect(prefs.get().ring).not.toBe(undefined)
  })

  it('Reset camera leaves the ring alone', () => {
    prefs.set({ ring: 'hidden', camera: { height: 0.5, tilt: 0 } })
    panel().querySelector<HTMLButtonElement>('.wide')!.click()
    expect(prefs.get()).toMatchObject({ camera: { height: 0, tilt: 0 }, ring: 'hidden' })
  })

  it('auto swing: Off / On, Off by default, click saves', () => {
    prefs.set({ autoSwing: false })
    const segs = [...panel().querySelectorAll<HTMLButtonElement>('.sp-auto-row [role=radio]')]
    expect(segs.map((b) => b.textContent)).toEqual(['Off', 'On'])
    expect(segs.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    segs[1].click()
    expect(prefs.get().autoSwing).toBe(true)
    expect(segs[1].getAttribute('aria-checked')).toBe('true')
    prefs.set({ autoSwing: false })
  })

  it('graphics (5 looks): a dropdown, Auto by default; picking saves, a change elsewhere shows', () => {
    prefs.set({ graphics: 'auto' })
    const row = panel().querySelector<HTMLElement>('.sp-graphics-row')!
    expect(row.querySelector('[role=radio]')).toBe(null) // not a segmented row any more
    const open = row.querySelector<HTMLButtonElement>('.pf-dropdown-btn')!
    expect(open.textContent).toContain('Auto')
    open.click()
    const opts = [...row.querySelectorAll<HTMLElement>('[role=option]')]
    expect(opts.map((o) => o.textContent)).toEqual(['Auto', 'Low', 'Medium', 'High', 'Ultra'])
    opts[3].click()
    expect(prefs.get().graphics).toBe('high')
    expect(open.textContent).toContain('High')
    prefs.set({ graphics: 'ultra' })
    expect(open.textContent).toContain('Ultra')
    prefs.set({ graphics: 'auto' })
  })

  it('rows with 2–3 choices stay segmented (ring, path, auto swing, name tags)', () => {
    for (const cls of ['.sp-ring-row', '.sp-path-row', '.sp-auto-row', '.sp-tags-row'])
      expect(panel().querySelector(`${cls} [role=radiogroup]`), cls).not.toBe(null)
  })

  it('the ring group is labelled', () => {
    expect(panel().querySelector('[role=radiogroup]')!.getAttribute('aria-label')).toBe('Landing ring')
  })

  it('Space / arrows on a segment do not reach the game', () => {
    const sent = vi.fn()
    const input = bindInput(view, sent, () => 0)
    const seg = panel().querySelector<HTMLElement>('[role=radio]')!
    seg.focus()
    for (const code of ['Space', 'KeyJ', 'ArrowLeft', 'ArrowRight']) key('keydown', { code, key: code }, seg)
    expect(sent).not.toHaveBeenCalled()
    input.stop()
  })
})

describe('view settings live in the settings sheet', () => {
  it('main.ts hands them to the shell (settingsSections); no corner button on the stage or in the 3D view', () => {
    const main = readFileSync(join(process.cwd(), 'games/shuttle-pop/main.ts'), 'utf8')
    const r3d = readFileSync(join(process.cwd(), 'games/shuttle-pop/render3d.ts'), 'utf8')
    expect(main).toMatch(/settingsSections: \(\) => \(\{ label: t\('View'\), body: viewSettings \}\)/)
    expect(main).not.toContain('mountCameraButton')
    expect(main).not.toContain('stageExtras')
    expect(r3d).not.toContain('mountCameraButton')
  })

  it('is one panel, drawn once and reused (no new pref listeners per open)', () => {
    expect(viewSettings()).toBe(viewSettings())
    expect(viewSettings().querySelector('.sp-ring-row')).not.toBe(null)
  })
})

describe('camera strings', () => {
  it('have Vietnamese', () => {
    for (const k of [
      'View',
      'Height',
      'Tilt',
      'Camera height',
      'Camera tilt',
      'Reset camera',
      'Landing ring',
      'Hidden',
      'Near drop',
      'Always',
    ])
      expect(VI[k]).toBeTruthy()
    expect(VI['Only changes your own screen.']).toBeTruthy()
  })
})
