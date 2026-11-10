// The in-match scoreboard over the court (top centre): each side's colour dot, name and big score, a
// little shuttle on the server, the match-point tag and the deuce / "next point wins" line. The local
// player is always on the left (spectators: side 0).
//
// `boardView` maps the state to what the board shows (pure, tested); `Scoreboard` draws it, touching the
// DOM only for what changed. The point pop is a CSS animation (time-based, frame-rate independent).

import { h } from '@forge'
import { t } from './i18n'
import { PRESETS } from './presets'
import { CAP, TARGET, winner } from './rules'
import { shownName, type SpState } from './sim'
import { matchPoint } from './hud'

export type BoardNote = 'deuce' | 'cap' | null
export type MatchWho = 'mine' | 'theirs' | 'both' | null

export interface BoardSide {
  name: string
  score: number
  /** The character's signature colour (#rrggbb). */
  tint: string
  serving: boolean
  matchPoint: boolean
}

export interface BoardView {
  left: BoardSide
  right: BoardSide
  /** Whose match point, from the left player's view (null = none / not live). */
  match: MatchWho
  note: BoardNote
}

export const tintCss = (n: number) => `#${n.toString(16).padStart(6, '0')}`

/** Level at 10-all or more: deuce (win by 2); 14-all: next point wins (the cap). */
export function boardNote(score: readonly [number, number]): BoardNote {
  const [a, b] = score
  if (a !== b || winner([a, b]) !== null) return null
  if (a >= CAP - 1) return 'cap'
  return a >= TARGET - 1 ? 'deuce' : null
}

/** The board for `s`, `leftSide` on the left. Allocates: call when the score / server / phase changes. */
export function boardView(s: SpState, leftSide: 0 | 1): BoardView {
  const live = s.phase === 'serve' || s.phase === 'rally'
  const sideOf = (side: 0 | 1): BoardSide => {
    const p = s.players[0].side === side ? s.players[0] : s.players[1]
    return {
      name: shownName(p),
      score: s.score[side],
      tint: tintCss(PRESETS[p.preset]?.tint ?? PRESETS[side].tint),
      serving: s.phase !== 'over' && s.server === side,
      matchPoint: live && matchPoint(s.score, side),
    }
  }
  const left = sideOf(leftSide)
  const right = sideOf(leftSide === 0 ? 1 : 0)
  const match: MatchWho =
    left.matchPoint && right.matchPoint
      ? 'both'
      : left.matchPoint
        ? 'mine'
        : right.matchPoint
          ? 'theirs'
          : null
  return { left, right, match, note: boardNote(s.score) }
}

const SVG_NS = 'http://www.w3.org/2000/svg'
/** Shuttlecock glyph for the server (drawn once per side). */
function shuttleIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('class', 'sp-team-serve')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML =
    '<path d="M6 3h12l-3.2 11H9.2z" fill="currentColor" opacity=".9"/>' +
    '<path d="M9 3.5 10.6 14M15 3.5 13.4 14M12 3v11" stroke="rgb(0 0 0 / .25)" stroke-width="1.1"/>' +
    '<circle cx="12" cy="17.6" r="4" fill="#f4a52c"/>'
  return svg
}

/** One side of the board. */
class Team {
  readonly el: HTMLElement
  private nameEl: HTMLElement
  private numEl: HTMLElement
  private last: BoardSide = { name: '', score: -1, tint: '', serving: false, matchPoint: false }

  constructor(side: 'left' | 'right') {
    this.nameEl = h('span', { class: 'sp-team-name' })
    this.numEl = h('b', { class: 'sp-team-score' })
    this.numEl.addEventListener('animationend', () => this.el.classList.remove('scored'))
    this.el = h(
      'div',
      { class: `sp-team ${side}` },
      h('i', { class: 'sp-team-dot' }),
      this.nameEl,
      shuttleIcon(),
      this.numEl,
    )
  }

  update(v: BoardSide) {
    const was = this.last
    if (v.name !== was.name) {
      this.nameEl.textContent = v.name
      this.el.title = v.name
    }
    if (v.tint !== was.tint) this.el.style.setProperty('--sp-team', v.tint)
    if (v.serving !== was.serving) this.el.classList.toggle('serving', v.serving)
    if (v.matchPoint !== was.matchPoint) this.el.classList.toggle('hot', v.matchPoint)
    if (v.score !== was.score) {
      this.numEl.textContent = String(v.score)
      // A point won (not the first draw, not a rematch's 0): pop the number.
      if (was.score >= 0 && v.score > was.score) {
        this.el.classList.remove('scored')
        void this.el.offsetWidth
        this.el.classList.add('scored')
      }
    }
    this.last = v
  }

  reset() {
    this.el.classList.remove('scored')
    this.last = { ...this.last, score: -1 }
  }
}

export class Scoreboard {
  readonly root: HTMLElement
  private left = new Team('left')
  private right = new Team('right')
  private tagEl: HTMLElement
  private noteEl: HTMLElement
  private match: MatchWho = null
  private note: BoardNote = null

  constructor() {
    this.tagEl = h('div', { class: 'sp-board-tag' })
    this.noteEl = h('div', { class: 'sp-board-note' })
    this.tagEl.hidden = this.noteEl.hidden = true
    this.root = h(
      'div',
      { class: 'sp-board' },
      h('div', { class: 'sp-board-row' }, this.left.el, h('span', { class: 'sp-board-dash' }), this.right.el),
      this.tagEl,
      this.noteEl,
    )
  }

  update(v: BoardView) {
    this.left.update(v.left)
    this.right.update(v.right)
    if (v.match !== this.match) {
      this.match = v.match
      this.tagEl.dataset.who = v.match ?? ''
      this.tagEl.textContent = v.match ? t('Match point') : ''
      this.tagEl.hidden = !v.match
    }
    if (v.note !== this.note) {
      this.note = v.note
      this.noteEl.textContent =
        v.note === 'cap' ? t('Next point wins') : v.note === 'deuce' ? t('Deuce: win by 2') : ''
      this.noteEl.hidden = !v.note
    }
  }

  /** New match: the next draw sets the numbers without a pop. */
  reset() {
    this.left.reset()
    this.right.reset()
  }
}
