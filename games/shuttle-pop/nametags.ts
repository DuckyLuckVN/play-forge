// Player name tags over the chibis: one pooled DOM pill per player (name in the team's colour, "You" on the
// local player), drawn in the 3D view's overlay and placed each frame like the reaction bubbles (bubbles.ts).
// Full size between points; small and faint during a rally so they never distract from the shuttle; dimmer
// still while one covers the shuttle. Cosmetic only.
import type { ScreenPoint } from './bubbles'
import { t } from './i18n'
import type { SpState } from './sim'

/**
 * Opacity in a rally (faint), while covering the shuttle (× this), and the least a fading chibi takes its tag
 * to (it stays readable); tag box half-width / height (px) for the cover test.
 */
export const TAG = { faint: 0.55, cover: 0.35, fadeFloor: 0.6, halfW: 48, h: 26 } as const

export type TagMode = 'full' | 'faint'

/** Full while serving / between points / after the match; faint during a rally. */
export const tagMode = (phase: SpState['phase']): TagMode => (phase === 'rally' ? 'faint' : 'full')

/** A tag's opacity: faint in a rally, dimmer over the shuttle, fading with its chibi (`fade` 0..1, floored). */
export function tagOpacity(mode: TagMode, fade: number, coversShuttle: boolean): number {
  return (mode === 'faint' ? TAG.faint : 1) * Math.max(fade, TAG.fadeFloor) * (coversShuttle ? TAG.cover : 1)
}

interface Slot {
  el: HTMLElement
  name: HTMLElement
  /** Last values written (rewrite the DOM only on change). */
  text: string
  tint: string
  you: boolean
  mode: TagMode | ''
}

export class NameTags {
  readonly root: HTMLElement
  private slots: Slot[] = []

  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'sp-tags'
    this.root.setAttribute('aria-hidden', 'true')
  }

  private slot(i: number): Slot {
    while (this.slots.length <= i) {
      const el = document.createElement('div')
      el.className = 'sp-tag'
      el.hidden = true
      const name = document.createElement('span')
      name.className = 'sp-tag-name'
      el.appendChild(name)
      this.root.appendChild(el)
      this.slots.push({ el, name, text: '', tint: '', you: false, mode: '' })
    }
    return this.slots[i]
  }

  /** The tag's name, colour (CSS) and whether it is the local player's ("You"). Cheap when unchanged. */
  set(i: number, text: string, tint: string, you: boolean) {
    const s = this.slot(i)
    if (s.text !== text) {
      s.text = text
      s.name.textContent = text
    }
    if (s.tint !== tint) {
      s.tint = tint
      s.el.style.setProperty('--sp-tag', tint)
    }
    if (s.you !== you) {
      s.you = you
      s.el.classList.toggle('you', you)
      const mark = s.el.querySelector('.sp-tag-you')
      if (you && !mark) {
        const b = document.createElement('span')
        b.className = 'sp-tag-you'
        b.textContent = t('You')
        s.el.prepend(b)
      } else if (!you) mark?.remove()
    }
  }

  /**
   * Per frame: the tag's bottom-centre at `at` (px; null / off screen hides it), in `mode`, faded with its
   * chibi (`fade`), dimmed while it covers the shuttle (`shuttle` px, null = not drawn). No layout reads.
   */
  place(
    i: number,
    at: ScreenPoint | null,
    mode: TagMode,
    fade: number,
    shuttle: { x: number; y: number } | null,
  ) {
    const s = this.slots[i]
    if (!s) return
    if (!at || !at.on || fade <= 0) {
      s.el.hidden = true
      return
    }
    if (s.mode !== mode) {
      s.mode = mode
      s.el.classList.toggle('faint', mode === 'faint')
    }
    const covers =
      shuttle !== null &&
      Math.abs(shuttle.x - at.x) <= TAG.halfW &&
      shuttle.y >= at.y - TAG.h &&
      shuttle.y <= at.y
    s.el.hidden = false
    s.el.style.opacity = tagOpacity(mode, fade, covers).toFixed(2)
    s.el.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translate(-50%, -100%)`
  }

  /** Hide tags from slot `i` on (players not in this match, or a bubble showing). */
  hideFrom(i: number) {
    for (let k = i; k < this.slots.length; k++) this.slots[k].el.hidden = true
  }

  /** Hide one tag (its reaction bubble is up). */
  hide(i: number) {
    const s = this.slots[i]
    if (s) s.el.hidden = true
  }
}
