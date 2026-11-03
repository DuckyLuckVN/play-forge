// Big "moment" banners: milestones and streaks worth celebrating. Pure logic
// over sim state; the HUD shows them, main.ts plays a fanfare for the big ones.

import type { Params } from '@forge/core/i18n'
import { C } from './palette'
import type { DriftState } from './sim'
import { kmh } from './stats'

export interface Moment {
  text: string
  color: string
  /** The biggest ones get a fanfare. */
  big?: boolean
}

type T = (en: string, params?: Params) => string

/** Names for near-miss streaks (literal t() calls so translations are checked). */
function streakName(n: number, t: T): string | null {
  if (n === 5) return t('DAREDEVIL!')
  if (n === 10) return t('UNTOUCHABLE!')
  if (n === 20) return t('GHOST LEGEND!')
  return null
}

export class Moments {
  private km = 0
  private beatBest = false
  private streak = 0
  private lastTick = -1

  /** `best`: the stored best when the run started (0 = none yet). */
  constructor(
    private best: number,
    private t: T,
  ) {}

  /** Call with each new state; returns what to celebrate this tick. */
  update(s: DriftState): Moment[] {
    if (s.tick <= this.lastTick) this.reset()
    this.lastTick = s.tick
    if (s.diedAt !== null) return []
    const t = this.t
    const out: Moment[] = []
    for (const e of s.events) {
      switch (e.type) {
        case 'hit':
          this.streak = 0
          break
        case 'nearMiss': {
          this.streak++
          const name = streakName(this.streak, t)
          if (name) out.push({ text: name, color: C.gold, big: true })
          break
        }
        case 'multiplier':
          if (e.mult === 5) out.push({ text: t('MAX COMBO ×5!'), color: C.gold, big: true })
          break
        case 'tier':
          out.push({ text: t('SPEED UP! {kmh} km/h', { kmh: kmh(s.speed) }), color: '#7fe9ff' })
          break
        case 'lanes':
          out.push({ text: t('THE RIFT WIDENS!'), color: '#b9a4ff' })
          break
        case 'phantom':
          out.push({ text: t('PHANTOM!'), color: C.phantom })
          break
      }
    }
    const km = Math.floor(s.dist / 1000)
    if (km > this.km) {
      this.km = km
      out.push({ text: t('{n} KM!', { n: km }), color: '#ffffff', big: true })
    }
    if (!this.beatBest && this.best > 0 && s.score > this.best) {
      this.beatBest = true
      out.push({ text: t('NEW BEST!'), color: C.gold, big: true })
    }
    return out
  }

  /** New run: forget progress (the stored best is updated by `setBest`). */
  private reset() {
    this.km = 0
    this.beatBest = false
    this.streak = 0
  }

  setBest(best: number): void {
    this.best = best
  }
}
