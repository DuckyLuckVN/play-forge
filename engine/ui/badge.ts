import { h } from './dom'

export interface CountBadge {
  /** 0 hides the badge; a higher number than before pops it. */
  set(n: number): void
}

/**
 * A small number in the corner of a button (people in voice, unread
 * messages). Decorative: put the number in the button's label too.
 */
export function countBadge(button: HTMLElement): CountBadge {
  const el = h('span', { class: 'pf-count', hidden: true })
  el.setAttribute('aria-hidden', 'true')
  button.append(el)
  let last = 0
  return {
    set(n) {
      el.hidden = n === 0
      el.textContent = n > 99 ? '99+' : String(n)
      if (n > last) {
        el.classList.remove('pop')
        void el.offsetWidth // restart the animation
        el.classList.add('pop')
      }
      last = n
    },
  }
}
