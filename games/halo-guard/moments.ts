// Big "moment" banners: perfect-parry streaks, max combo, every minute
// survived, a new best. Pure logic over sim state.

import type { Params } from '@forge/core/i18n'
import type { Banner } from '@forge/reflex/hud2d'
import { C } from './palette'
import { MAX_MULT, TICK_RATE, type GuardState } from './sim'

type T = (en: string, params?: Params) => string

/** Names for perfect-parry streaks (literal t() calls so translations are checked). */
function streakName(n: number, t: T): string | null {
  if (n === 5) return t('FLAWLESS!')
  if (n === 10) return t('UNBREAKABLE!')
  if (n === 20) return t('HALO LEGEND!')
  return null
}

export class Moments {
  private minutes = 0
  private beatBest = false
  private streak = 0
  private lastTick = -1

  constructor(
    private best: number,
    private t: T,
  ) {}

  update(s: GuardState): Banner[] {
    if (s.tick <= this.lastTick) this.reset()
    this.lastTick = s.tick
    if (s.diedAt !== null) return []
    const t = this.t
    const out: Banner[] = []
    for (const e of s.events) {
      switch (e.type) {
        case 'hit':
          this.streak = 0
          break
        case 'block': {
          if (!e.perfect) {
            this.streak = 0
            break
          }
          this.streak++
          const name = streakName(this.streak, t)
          if (name) out.push({ text: name, color: C.gold, big: true })
          break
        }
        case 'multiplier':
          if (e.mult === MAX_MULT) out.push({ text: t('MAX COMBO ×5!'), color: C.gold, big: true })
          break
        case 'tier':
          out.push({ text: t('FASTER!'), color: '#7fe9ff' })
          break
        case 'nova':
          out.push({ text: t('NOVA!'), color: C.nova })
          break
      }
    }
    const minutes = Math.floor(s.tick / (60 * TICK_RATE))
    if (minutes > this.minutes) {
      this.minutes = minutes
      out.push({ text: t('{n} MIN!', { n: minutes }), color: '#ffffff', big: true })
    }
    if (!this.beatBest && this.best > 0 && s.score > this.best) {
      this.beatBest = true
      out.push({ text: t('NEW BEST!'), color: C.gold, big: true })
    }
    return out
  }

  private reset() {
    this.minutes = 0
    this.beatBest = false
    this.streak = 0
  }

  setBest(best: number): void {
    this.best = best
  }
}
