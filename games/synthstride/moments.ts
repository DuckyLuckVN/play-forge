// Big "moment" banners: groove streaks, max multiplier, tempo ups, the Drop,
// every minute survived, a new best. Pure logic over sim state.

import type { Params } from '@forge/core/i18n'
import type { Banner } from '@forge/reflex/hud2d'
import { C } from './palette'
import { MAX_MULT, TICK_RATE, type StrideState } from './sim'

type T = (en: string, params?: Params) => string

/** Names for groove streaks (literal t() calls so translations are checked). */
function grooveName(n: number, t: T): string | null {
  if (n === 16) return t('IN THE GROOVE!')
  if (n === 32) return t('ON FIRE!')
  if (n === 64) return t('RHYTHM GOD!')
  return null
}

export class Moments {
  private minutes = 0
  private beatBest = false
  private lastTick = -1

  constructor(
    private best: number,
    private t: T,
  ) {}

  update(s: StrideState): Banner[] {
    if (s.tick <= this.lastTick) this.reset()
    this.lastTick = s.tick
    if (s.diedAt !== null) return []
    const t = this.t
    const out: Banner[] = []
    for (const e of s.events) {
      switch (e.type) {
        case 'move': {
          const name = e.rating && e.rating !== 'off' ? grooveName(s.vitals.combo, t) : null
          if (name) out.push({ text: name, color: C.gold, big: true })
          break
        }
        case 'multiplier':
          if (e.mult === MAX_MULT) out.push({ text: t('MAX GROOVE ×4!'), color: C.gold, big: true })
          break
        case 'tier':
          out.push({ text: t('TEMPO UP! {bpm} BPM', { bpm: e.bpm }), color: '#7fe9ff' })
          break
        case 'drop':
          out.push({ text: t('DROP!'), color: C.drop, big: true })
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
  }

  setBest(best: number): void {
    this.best = best
  }
}
