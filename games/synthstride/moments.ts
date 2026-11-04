// Big "moment" banners: groove streaks, max groove, tempo ups, the song's
// drops, Overdrive, finished chains, a bigger floor, every minute survived and
// a new best; with friends: who is out, taking the lead, last one dancing.
// Pure logic over sim state, from one player's point of view.

import type { Params } from '@forge/core/i18n'
import type { Banner } from '@forge/reflex/hud2d'
import { C } from './palette'
import { alive, dancerOf, MAX_GROOVE, ranking, TICK_RATE, type StrideState } from './sim'

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
  private leading = false
  private lastOne = false
  private lastTick = -1

  constructor(
    private best: number,
    private t: T,
    private selfId: string,
    private nameOf: (id: string) => string = (id) => id,
  ) {}

  update(s: StrideState): Banner[] {
    if (s.tick <= this.lastTick) this.reset()
    this.lastTick = s.tick
    const me = dancerOf(s, this.selfId)
    if (!me || s.endAt !== null) return []
    const t = this.t
    const many = s.dancers.length > 1
    const out: Banner[] = []
    for (const e of s.events) {
      if (e.type === 'die' && many) {
        // Others going out matter to everyone; your own only while others dance on.
        if (e.p === me.id) out.push({ text: t("YOU'RE OUT!"), color: C.warn, big: true })
        else out.push({ text: t('{name} IS OUT!', { name: this.nameOf(e.p) }), color: '#ffffff' })
        continue
      }
      if (!alive(me)) continue
      if ('p' in e && e.p !== me.id) continue
      switch (e.type) {
        case 'move': {
          const name = e.rating && e.rating !== 'off' ? grooveName(me.vitals.combo, t) : null
          if (name) out.push({ text: name, color: C.gold, big: true })
          break
        }
        case 'multiplier':
          if (e.mult === MAX_GROOVE) out.push({ text: t('MAX GROOVE ×4!'), color: C.gold, big: true })
          break
        case 'tier':
          out.push({ text: t('TEMPO UP! {bpm} BPM', { bpm: e.bpm }), color: '#7fe9ff' })
          break
        case 'section':
          if (e.section === 'drop') out.push({ text: t('DROP!'), color: C.warn, big: true })
          break
        case 'overdrive':
          out.push({ text: t('OVERDRIVE!'), color: C.drop, big: true })
          break
        case 'chain':
          if (e.length >= 3) out.push({ text: t('CHAIN ×{n}!', { n: e.length }), color: C.note })
          break
        case 'grow':
          if (e.b === me.board) out.push({ text: t('THE FLOOR EXPANDS!'), color: '#7fe9ff' })
          break
      }
    }
    if (!alive(me)) return out
    const minutes = Math.floor(s.tick / (60 * TICK_RATE))
    if (minutes > this.minutes) {
      this.minutes = minutes
      out.push({ text: t('{n} MIN!', { n: minutes }), color: '#ffffff', big: true })
    }
    if (many) {
      // Taking the lead (once you've scored), and being the last one dancing.
      const leading = ranking(s)[0] === me && me.score > 0
      if (leading && !this.leading) out.push({ text: t('YOU TAKE THE LEAD!'), color: C.gold, big: true })
      this.leading = leading
      if (!this.lastOne && s.dancers.filter(alive).length === 1) {
        this.lastOne = true
        out.push({ text: t('LAST ONE DANCING!'), color: C.gold, big: true })
      }
    } else if (!this.beatBest && this.best > 0 && me.score > this.best) {
      this.beatBest = true
      out.push({ text: t('NEW BEST!'), color: C.gold, big: true })
    }
    return out
  }

  private reset() {
    this.minutes = 0
    this.beatBest = false
    this.leading = false
    this.lastOne = false
  }

  setBest(best: number): void {
    this.best = best
  }
}
