// The score splash after each point: the score shows big in the middle of the court, the number that
// just changed glows gold and bounces, then it all shrinks up into the top scoreboard (CSS, time-based).
// Shown and hidden by a timer (not animationend: reduced motion turns the animation into a fade).
import { h } from '@forge'
import type { BoardSide } from './scoreboard'

/** How long the splash shows (ms): inside the point pause (sim POINT_TICKS = 1.2 s). */
export const SPLASH_MS = 1100

export class ScoreSplash {
  readonly root: HTMLElement
  private nums: HTMLElement[]
  private dots: HTMLElement[]
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    const half = () => {
      const dot = h('i', { class: 'sp-splash-dot' })
      const num = h('b', { class: 'sp-splash-num' })
      return { dot, num, el: h('span', { class: 'sp-splash-side' }, dot, num) }
    }
    const l = half()
    const r = half()
    this.nums = [l.num, r.num]
    this.dots = [l.dot, r.dot]
    this.root = h('div', { class: 'sp-splash' }, l.el, h('span', { class: 'sp-splash-dash' }), r.el)
    this.root.setAttribute('aria-hidden', 'true')
  }

  /** A point was won: the left / right score (left = the local player's), `scored` = the side that won it. */
  show(left: BoardSide, right: BoardSide, scored: 'left' | 'right'): void {
    ;[left, right].forEach((s, i) => {
      this.nums[i].textContent = String(s.score)
      this.nums[i].classList.toggle('changed', (i === 0) === (scored === 'left'))
      this.dots[i].style.setProperty('--sp-team', s.tint)
    })
    this.hide()
    // Restart the animation on the reused node.
    void this.root.offsetWidth
    this.root.classList.add('show')
    this.timer = setTimeout(() => this.hide(), SPLASH_MS)
  }

  hide(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.root.classList.remove('show')
  }
}
