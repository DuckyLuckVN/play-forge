// Phones in fullscreen: the top bar tucks away so the game gets the whole screen. A small floating
// handle brings it back (over the game); it hides again after a while or on a tap on the game.
// Classes on <html>: `pf-fullscreen` while fullscreen, `pf-bar-shown` while the bar is out. The
// layout lives in CSS (shell.css), under (pointer: coarse): desktops keep their bar.
import { iconButton } from './dom'
import { t } from './i18n'
import { icons } from './icons'

/** The bar hides again this long after it was last used. */
export const HIDE_AFTER_MS = 4000

export class FullscreenChrome {
  private on = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly root = document.documentElement
  readonly handle: HTMLButtonElement

  constructor(private readonly bar: HTMLElement) {
    this.handle = iconButton(icons.more, t('Show menu'), () => {
      this.show(!this.root.classList.contains('pf-bar-shown'))
      this.handle.blur()
    })
    this.handle.classList.add('pf-fs-handle')
    bar.after(this.handle)
    document.addEventListener('pointerdown', this.onDown, true)
  }

  /** Using the bar keeps it up; a press anywhere else (the game) puts it away. */
  private readonly onDown = (e: Event) => {
    if (!this.on) return
    const target = e.target as Node | null
    if (target && this.bar.contains(target)) this.armHide()
    else if (target && !this.handle.contains(target)) this.show(false)
  }

  dispose(): void {
    this.set(false)
    document.removeEventListener('pointerdown', this.onDown, true)
    this.handle.remove()
  }

  /** Fullscreen started (true) or ended. */
  set(on: boolean): void {
    this.on = on
    this.root.classList.toggle('pf-fullscreen', on)
    this.show(false)
  }

  private show(shown: boolean): void {
    clearTimeout(this.timer)
    this.root.classList.toggle('pf-bar-shown', shown && this.on)
    if (shown && this.on) this.armHide()
  }

  private armHide(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.root.classList.remove('pf-bar-shown'), HIDE_AFTER_MS)
  }
}
