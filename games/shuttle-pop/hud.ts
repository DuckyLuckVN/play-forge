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

/**
 * The smoothing pair's `prev` if it belongs to the same match and seats as `curr`, else `curr`.
 * A rematch restarts ticks at 0 while `prev` still holds the old match's last state (the host sends
 * nothing during the countdown): fed to a guest's render clock it would lock it on the old ticks, and
 * blending players by index across a seat change (1v1 → 2v2, team swap) mixes people up or reads past
 * the end. No allocation: runs every frame.
 */
export function sameMatchPrev<S extends { tick: number; players: readonly { id: string }[] }>(
  prev: S,
  curr: S,
): S {
  if (prev.tick > curr.tick || prev.players.length !== curr.players.length) return curr
  for (let i = 0; i < curr.players.length; i++) if (prev.players[i].id !== curr.players[i].id) return curr
  return prev
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
export function racketIcon(): SVGSVGElement {
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

const STROKE = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"'

/**
 * A player diving forward (body tipped, racket arm reaching out, legs trailing) over the floor, speed lines
 * behind: the Dive button's glyph (drawn once).
 */
export function diveIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 48 48')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML =
    '<circle cx="25" cy="15" r="4.6" fill="currentColor"/>' +
    `<g ${STROKE} stroke-width="4.4"><path d="M20 22 8 30M19 23l11 2M8 30 2 25M8 30 3 37"/></g>` +
    `<g ${STROKE} stroke-width="3"><path d="M30 25l4 .5"/>` +
    '<ellipse cx="39.5" cy="25.5" rx="5.6" ry="4.2" transform="rotate(-15 39.5 25.5)" fill="currentColor" fill-opacity=".25"/></g>' +
    `<g ${STROKE} stroke-width="2.6" opacity=".6"><path d="M3 12h6M5 17h4M8 44h32"/></g>`
  return svg
}

/**
 * A player in mid-air (racket raised for a smash, knees tucked) with rising motion lines under it, over its
 * shadow: the Jump button's glyph (drawn once).
 */
export function actIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 48 48')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML =
    '<circle cx="18" cy="13" r="4.6" fill="currentColor"/>' +
    `<g ${STROKE} stroke-width="4.4"><path d="M18 20v11M18 23l-8-6M18 23l9-7M18 31l-6 5 2 7M18 31l7 4 3 6"/></g>` +
    `<g ${STROKE} stroke-width="3"><path d="M27 16l3.5-4"/>` +
    '<ellipse cx="35" cy="8" rx="4.4" ry="5.8" transform="rotate(40 35 8)" fill="currentColor" fill-opacity=".25"/></g>' +
    `<g ${STROKE} stroke-width="2.8" opacity=".85"><path d="M6 27v7M9 35v5M31 35v6"/></g>` +
    '<ellipse cx="19" cy="46" rx="8" ry="1.8" fill="currentColor" opacity=".55"/>'
  return svg
}

/** A media-query matcher (globalThis.matchMedia by default; tests pass their own). */
export type MediaMatch = (query: string) => boolean

const browserMatch: MediaMatch = (q) => {
  try {
    return globalThis.matchMedia?.(q).matches ?? false
  } catch {
    return false
  }
}

/**
 * Touch-first device: the touch controls show from the start and the keyboard chips never do. A coarse
 * primary pointer, or a touch screen with no pointer that can hover (some phones / tablets report a
 * fine primary pointer). A touch laptop has a mouse / trackpad that hovers, so it keeps the key chips
 * (its first touch still turns the pad on).
 */
export function touchFirst(
  match: MediaMatch = browserMatch,
  touchPoints: number = globalThis.navigator?.maxTouchPoints ?? 0,
): boolean {
  if (match('(pointer: coarse)')) return true
  return (touchPoints > 0 || match('(any-pointer: coarse)')) && !match('(any-hover: hover)')
}

/**
 * Touch controls' visuals: a floating stick (rests dim in the bottom-left corner, jumps under the
 * thumb while held), the swing button bottom-right (in from the corner), Jump above it and Dive to its left (one shared
 * cooldown dims both). Hidden until the device is touch-first (touchFirst)
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

  constructor(touch: boolean = touchFirst()) {
    this.knobEl = h('div', { class: 'sp-knob' })
    this.stickEl = h('div', { class: 'sp-stick idle' }, this.knobEl)
    this.stickEl.style.setProperty('--sp-stick-r', `${STICK_RADIUS}px`)
    this.swingEl = h('div', { class: 'sp-swing' }, racketIcon())
    this.actEl = h('div', { class: 'sp-act' }, actIcon())
    this.diveEl = h('div', { class: 'sp-act sp-dive' }, diveIcon())
    this.root = h('div', { class: 'sp-touch' }, this.stickEl, this.actEl, this.diveEl, this.swingEl)
    this.root.setAttribute('aria-hidden', 'true')
    this.root.hidden = !touch
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
