// Ability cooldown badge: the sweep (--sp-cd 0..1), the seconds left and a short "ready" flash, on any
// element (the touch Jump / Dive buttons, the desktop chips). Called every frame: the DOM is touched
// only when the shown step or text changes.
import { h } from '@forge/ui/dom'

/** Seconds left as shown: blank when ready, rounded up (never "0.0" while cooling). */
export function cooldownText(sec: number): string {
  if (!(sec > 0)) return ''
  if (sec >= 10) return String(Math.ceil(sec))
  return (Math.ceil(sec * 10) / 10).toFixed(1)
}

export class CooldownBadge {
  private num = h('span', { class: 'sp-cd-num' })
  private step = -1
  private text = ''

  constructor(readonly el: HTMLElement) {
    el.append(this.num)
    // The flash is one CSS animation; it ends on its own.
    el.addEventListener('animationend', (e) => {
      if (e.animationName === 'sp-cd-ready') el.classList.remove('ready')
    })
  }

  /** `share` 0..1 of the cooldown left (0 = ready), `sec` seconds left. */
  set(share: number, sec: number): void {
    const step = Math.round(Math.min(1, Math.max(0, share || 0)) * 100)
    const text = step > 0 ? cooldownText(sec) : ''
    if (step === this.step && text === this.text) return
    const was = this.step > 0
    if (step !== this.step) {
      this.el.style.setProperty('--sp-cd', (step / 100).toFixed(2))
      this.el.classList.toggle('cooling', step > 0)
      if (was && step === 0) this.el.classList.add('ready')
      else if (step > 0) this.el.classList.remove('ready')
    }
    this.step = step
    if (text !== this.text) this.num.textContent = this.text = text
  }
}
