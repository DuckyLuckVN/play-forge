// In-match overlay over the 3D court: timing pops ("Perfect!" near the hitter), the serve badge and the
// match-point badge. The score itself is the shell's top-bar chips. Pure helpers first (tested).
// DOM nodes are made once and reused; animations are CSS (time-based, so frame-rate independent).
import { h } from '@forge'
import { t } from './i18n'
import { winner } from './rules'
import type { SpEvent } from './sim'

/**
 * The events after `lastSeen` (by id), in order, written into `out` (render loops reuse one array).
 * Ids only grow, so a dropped snapshot loses nothing: the next one still holds those events.
 */
export function newEvents(events: readonly SpEvent[], lastSeen: number, out: SpEvent[] = []): SpEvent[] {
  out.length = 0
  for (let i = 0; i < events.length; i++) if (events[i].id > lastSeen) out.push(events[i])
  return out
}

/** `side` wins the match with the next point. */
export function matchPoint(score: readonly [number, number], side: 0 | 1): boolean {
  if (winner([score[0], score[1]]) !== null) return false
  const next: [number, number] = side === 0 ? [score[0] + 1, score[1]] : [score[0], score[1] + 1]
  return winner(next) === side
}

export type PopKind = 'perfect' | 'good' | 'late' | 'miss'

/** Pops on screen at once (a fast exchange shows a few). */
const POPS = 6
/** Keep pops this far inside the view's edges (px). */
const EDGE = { x: 70, top: 48, bottom: 36 }

function popText(kind: PopKind): string {
  switch (kind) {
    case 'perfect':
      return t('Perfect!')
    case 'good':
      return t('Good')
    case 'late':
      return t('Late')
    case 'miss':
      return t('Miss')
  }
}

export class Hud {
  readonly root: HTMLElement
  private pops: HTMLElement[] = []
  private next = 0
  private serveEl: HTMLElement
  private matchEl: HTMLElement

  constructor() {
    this.serveEl = h('div', { class: 'sp-badge sp-serve' })
    this.matchEl = h('div', { class: 'sp-badge sp-match' })
    this.serveEl.hidden = true
    this.matchEl.hidden = true
    this.root = h('div', { class: 'sp-hud' }, h('div', { class: 'sp-badges' }, this.matchEl, this.serveEl))
    for (let i = 0; i < POPS; i++) {
      const el = h('div', { class: 'sp-pop' })
      el.setAttribute('aria-hidden', 'true')
      el.addEventListener('animationend', () => el.classList.remove('show'))
      this.pops.push(el)
      this.root.append(el)
    }
  }

  /**
   * A timing pop centred at (x, y) px in the view. `mine` = the local player's (big, bright); the
   * opponent's is smaller and dimmer. `smash` tilts it and adds a hot outline.
   */
  pop(kind: PopKind, x: number, y: number, w: number, hgt: number, mine: boolean, smash: boolean) {
    const el = this.pops[this.next]
    this.next = (this.next + 1) % POPS
    el.textContent = popText(kind)
    el.className = `sp-pop sp-pop-${kind}${mine ? '' : ' theirs'}${smash ? ' smash' : ''}`
    const cx = Math.min(Math.max(x, EDGE.x), Math.max(EDGE.x, w - EDGE.x))
    const cy = Math.min(Math.max(y, EDGE.top), Math.max(EDGE.top, hgt - EDGE.bottom))
    el.style.left = `${cx}px`
    el.style.top = `${cy}px`
    // Restart the animation on a reused node.
    void el.offsetWidth
    el.classList.add('show')
  }

  /** Serve badge text (null hides it). Call on change only. */
  setServe(text: string | null) {
    showBadge(this.serveEl, text)
  }

  /** Match-point badge: whose (null hides it). Call on change only. */
  setMatchPoint(who: 'mine' | 'theirs' | 'both' | null) {
    this.matchEl.dataset.who = who ?? ''
    showBadge(this.matchEl, who && t('Match point'))
  }

  /** Clear every pop and badge (new match). */
  reset() {
    for (const el of this.pops) el.classList.remove('show')
    this.setServe(null)
    this.setMatchPoint(null)
  }
}

function showBadge(el: HTMLElement, text: string | null) {
  if (!text) {
    el.hidden = true
    return
  }
  el.textContent = text
  if (el.hidden) {
    el.hidden = false
    el.classList.remove('in')
    void el.offsetWidth
    el.classList.add('in')
  }
}
