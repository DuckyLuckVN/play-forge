// In-match overlay over the 3D court: timing pops ("Perfect!" near the hitter) and the "Your serve"
// badge; the scoreboard (scoreboard.ts, with the match-point tag) sits on top of it. Pure helpers first
// (tested).
// DOM nodes are made once and reused; animations are CSS (time-based, so frame-rate independent).
import { h } from '@forge'
import { CooldownBadge } from './cooldown'
import { t } from './i18n'
import { STICK_RADIUS } from './joystick'
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

/**
 * What a view must do with its event/shot trackers before reading a new state:
 * 'seed' — skip the events already there (first state after attach, or a new match started while
 * hidden: ids restarted below what we saw); 'reset' — a rematch seen live (ticks went back), replay
 * from id 0; 'keep' — normal play.
 */
export function trackerAction(
  seeded: boolean,
  nextEventId: number,
  lastEventId: number,
  tick: number,
  lastTick: number,
): 'seed' | 'reset' | 'keep' {
  if (!seeded || nextEventId <= lastEventId) return 'seed'
  return tick < lastTick ? 'reset' : 'keep'
}

/** The newest hit/serve event id in `events` (0 = none). */
export function newestShotId(events: readonly SpEvent[]): number {
  let newest = 0
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if ((e.k === 'hit' || e.k === 'serve') && e.id > newest) newest = e.id
  }
  return newest
}

/** Moved to rules.ts (re-exported for existing imports). */
export { matchPoint } from './rules'

/** 'power' = a full-charge Perfect. */
export type PopKind = 'power' | 'perfect' | 'good' | 'late' | 'miss'

/** Pops on screen at once (a fast exchange shows a few). */
const POPS = 6
/** Keep pops this far inside the view's edges (px). */
const EDGE = { x: 70, top: 48, bottom: 36 }

function popText(kind: PopKind): string {
  switch (kind) {
    case 'power':
      return t('Power!')
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

  /** `top` = what sits at the top centre above the badges (the scoreboard). */
  constructor(top: HTMLElement) {
    this.serveEl = h('div', { class: 'sp-badge sp-serve' })
    this.serveEl.hidden = true
    this.root = h('div', { class: 'sp-hud' }, h('div', { class: 'sp-badges' }, top, this.serveEl))
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

  /** Clear every pop and badge (new match). */
  reset() {
    for (const el of this.pops) el.classList.remove('show')
    this.setServe(null)
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

const SVG_NS = 'http://www.w3.org/2000/svg'
/** Racket glyph for the swing button (drawn once). */
function racketIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 48 48')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML =
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="3.5">' +
    '<ellipse cx="29" cy="17" rx="11" ry="13" transform="rotate(40 29 17)"/>' +
    '<path d="M21 26 9 40"/></g>' +
    '<g stroke="currentColor" stroke-width="1.4" opacity=".55">' +
    '<path d="M22 12l14 12M25 8l13 11M20 17l12 11M27 6v24M32 7v21M22 10v18"/></g>'
  return svg
}

/** A low swoosh forward over a floor line: the Dive button's glyph (drawn once). */
function diveIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 48 48')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML =
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4">' +
    '<path d="M8 32c10 0 18-4 26-14"/><path d="M24 16h11v11"/><path d="M8 40h30" opacity=".6"/></g>'
  return svg
}

/** Up-chevron over two feet: the Jump button's glyph (drawn once). */
function actIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 48 48')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML =
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="4">' +
    '<path d="M14 18 24 8l10 10M14 30 24 20l10 10"/></g>' +
    '<g fill="currentColor"><ellipse cx="17" cy="41" rx="5" ry="3"/><ellipse cx="31" cy="41" rx="5" ry="3"/></g>'
  return svg
}

/**
 * Touch controls' visuals: a floating stick (rests dim in the bottom-left corner, jumps under the
 * thumb while held), the swing button bottom-right, Jump to its left and Dive above it (one shared
 * cooldown dims both). Hidden until the device has a coarse pointer
 * or the first touch lands. Input logic lives in input.ts; this only draws.
 */
export class TouchPad {
  readonly root: HTMLElement
  /** Touch presses on this swing. */
  readonly swingEl: HTMLElement
  /** Touch presses on this are the Jump button. */
  readonly actEl: HTMLElement
  /** Touch presses on this are the Dive button. */
  readonly diveEl: HTMLElement
  private stickEl: HTMLElement
  private knobEl: HTMLElement
  private badges: CooldownBadge[]

  constructor() {
    this.knobEl = h('div', { class: 'sp-knob' })
    this.stickEl = h('div', { class: 'sp-stick idle' }, this.knobEl)
    this.stickEl.style.setProperty('--sp-stick-r', `${STICK_RADIUS}px`)
    this.swingEl = h('div', { class: 'sp-swing' }, racketIcon())
    this.actEl = h('div', { class: 'sp-act' }, actIcon())
    this.diveEl = h('div', { class: 'sp-act sp-dive' }, diveIcon())
    this.root = h('div', { class: 'sp-touch' }, this.stickEl, this.actEl, this.diveEl, this.swingEl)
    this.root.setAttribute('aria-hidden', 'true')
    this.root.hidden = !globalThis.matchMedia?.('(pointer: coarse)').matches
    this.badges = [new CooldownBadge(this.actEl), new CooldownBadge(this.diveEl)]
  }

  /** Show the controls (first touch on a device that didn't report a coarse pointer). */
  enable() {
    this.root.hidden = false
  }

  /** Stick held at (x, y) px in the view. */
  showStick(x: number, y: number) {
    this.stickEl.classList.remove('idle')
    this.stickEl.style.left = `${x}px`
    this.stickEl.style.top = `${y}px`
    this.moveKnob(0, 0)
  }

  moveKnob(dx: number, dy: number) {
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`
  }

  /** Stick let go: back to its resting corner, knob centred. */
  hideStick() {
    this.stickEl.classList.add('idle')
    this.stickEl.style.left = ''
    this.stickEl.style.top = ''
    this.moveKnob(0, 0)
  }

  setPressed(on: boolean) {
    this.swingEl.classList.toggle('down', on)
  }

  /** The Jump button is held. */
  setAct(on: boolean) {
    this.actEl.classList.toggle('down', on)
  }

  /** The Dive button is held. */
  setDive(on: boolean) {
    this.diveEl.classList.toggle('down', on)
  }

  /**
   * Ability cooldown left 0..1 (0 = ready) and in seconds: the buttons dim clockwise, count down and
   * flash when ready (cooldown.ts). Called every frame.
   */
  setAbility(cooldown: number, seconds = 0) {
    for (const b of this.badges) b.set(cooldown, seconds)
  }
}

/**
 * Desktop: the Jump [Space] and Dive [Shift] chips at the bottom centre, with the shared cooldown's
 * sweep, seconds left and ready flash. Hidden while the touch controls show (CSS).
 */
export class AbilityChips {
  readonly root: HTMLElement
  private badges: CooldownBadge[]

  constructor() {
    const chip = (cls: string, svg: SVGSVGElement, key: string, label: string) =>
      h(
        'div',
        { class: `sp-chip ${cls}` },
        h('span', { class: 'sp-chip-icon' }, svg),
        h('span', { class: 'sp-chip-label', textContent: label }),
        h('kbd', { class: 'pf-key wide', textContent: key }),
      )
    const jump = chip('sp-chip-jump', actIcon(), 'Space', t('Jump'))
    const dive = chip('sp-chip-dive', diveIcon(), 'Shift', t('Dive'))
    this.root = h('div', { class: 'sp-abilities' }, jump, dive)
    this.root.setAttribute('aria-hidden', 'true')
    this.badges = [new CooldownBadge(jump), new CooldownBadge(dive)]
  }

  set(cooldown: number, seconds: number) {
    for (const b of this.badges) b.set(cooldown, seconds)
  }
}
