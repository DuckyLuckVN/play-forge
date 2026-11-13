// Tutorial card "Aim your shot": from the −45° court, the five shots a direction picks (W smash,
// S clear, no key drop, A / D left / right), one per beat, with the matching key lit below.
// On touch there are no keys: the badges show the stick's direction and nothing goes below.
import { h } from '@forge/ui/dom'
import type { ClipContext, TutorialCard } from '@forge/ui/tutorial'
import {
  arc,
  badge,
  finishClip,
  flyAlong,
  keyframes,
  animation,
  keyPad,
  landingRing,
  pathD,
  s,
  showDuring,
  uid,
  WASD,
  type Beat,
  type Clip,
} from '@forge/ui/tutorial/clip'
import { t } from '../i18n'
import { courtScene, PLAYER_AT } from './court'

interface Shot {
  /** Key id in WASD, or null = no key. */
  key: 'w' | 'a' | 's' | 'd' | null
  color: string
  name: string
  desc: string
  to: { x: number; z: number }
  h: { start: number; peak: number; end: number }
}

const shots = (): Shot[] => [
  {
    key: 'w',
    color: '#ff3d6e',
    name: t('Smash'),
    desc: t('fast & steep down'),
    to: { x: 0, z: 2.5 },
    h: { start: 3, peak: 2.2, end: 0 },
  },
  {
    key: 's',
    color: '#2f6bff',
    name: t('Clear'),
    desc: t('high & deep, buys time'),
    to: { x: 0, z: 6.1 },
    h: { start: 1.2, peak: 5.5, end: 0 },
  },
  {
    key: null,
    color: '#13a35f',
    name: t('Drop'),
    desc: t('soft, just over the net'),
    to: { x: 0, z: 1.2 },
    h: { start: 1.2, peak: 2.8, end: 0 },
  },
  {
    key: 'a',
    color: '#ff8a00',
    name: t('Left'),
    desc: t('send it to your left'),
    to: { x: -2.5, z: 4.5 },
    h: { start: 1.2, peak: 2.5, end: 0 },
  },
  {
    key: 'd',
    color: '#a020c0',
    name: t('Right'),
    desc: t('send it to your right'),
    to: { x: 2.5, z: 4.5 },
    h: { start: 1.2, peak: 2.5, end: 0 },
  },
]

const LOOP = 12
/** Each shot shows for most of its fifth of the loop, with a short gap before the next. */
const beatOf = (i: number, n: number): Beat => ({ at: (i * LOOP) / n, dur: (LOOP / n) * 0.92 })
/** The shot shown in the reduced-motion still frame (the smash). */
const STILL = 0
const BADGE_AT = { x: 220, y: 236 }
/** On touch, the stick direction for each key (the camera looks down the court, so up = forward). */
const STICK: Record<string, string> = { w: '↑', s: '↓', a: '←', d: '→' }
const KEY_ON = (color: string) => `background:${color};color:#fff;transform:translateY(3px)`

/** The "no key" chip beside the pad, lit during the drop's beat. */
function noKeyChip(c: Clip, color: string, beat: Beat): HTMLElement {
  const k = uid('kp')
  c.css.push(
    `.${k}{animation:${animation(k, LOOP)}}`,
    keyframes(k, LOOP, beat, KEY_ON(color), 'background:#fff;color:#222;transform:none'),
  )
  return h('span', { class: `pf-pad-key sp-tut-nokey ${k}`, textContent: t('no key') })
}

/** Builds the clip and the pad together: the pad's lit keys share the clip's timeline and style. */
function buildAim(ctx: ClipContext): { svg: SVGSVGElement; below: HTMLElement | null } {
  const list = shots()
  const { clip, p, ground, air } = courtScene(t('Aim your shot'))
  const lit: { id: string; beat: Beat; color: string; still?: boolean }[] = []
  let chip: HTMLElement | null = null
  list.forEach((shot, i) => {
    const beat = beatOf(i, list.length)
    const still = i === STILL
    const path = arc(p, PLAYER_AT, shot.to, shot.h)
    const air0 = pathD(path.air)
    const gnd = pathD(path.ground)
    const ring = landingRing(p(shot.to.x, shot.to.z), shot.color)
    ring.classList.add('sp-tut-ring')
    const under = s(
      'g',
      {},
      s('path', { d: gnd, fill: 'none', stroke: '#0007', 'stroke-width': 4, 'stroke-dasharray': '4 6' }),
      ring,
    )
    const over = s(
      'g',
      { class: 'sp-tut-shot' },
      s('path', {
        d: air0,
        fill: 'none',
        stroke: shot.color,
        'stroke-width': 6,
        'stroke-linecap': 'round',
        'stroke-dasharray': '2 10',
      }),
      badge({
        key: shot.key ? (ctx.touch ? STICK[shot.key] : shot.key.toUpperCase()) : '—',
        name: shot.name.toLocaleUpperCase(),
        desc: shot.desc,
        color: shot.color,
        ...BADGE_AT,
      }),
    )
    showDuring(clip, under, LOOP, beat, { still })
    showDuring(clip, over, LOOP, beat, { still })
    ground.append(under)
    air.append(over)
    flyAlong(clip, air0, LOOP, beat, { shadow: gnd, still })
    if (shot.key) lit.push({ id: shot.key, beat, color: shot.color, still })
    else chip = noKeyChip(clip, shot.color, beat)
  })
  if (ctx.touch) return { svg: finishClip(clip, ctx.reducedMotion), below: null }
  const pad = keyPad(clip, WASD, lit, LOOP, ctx.reducedMotion)
  const below = h('div', { class: 'sp-tut-keys' }, pad)
  if (chip) below.append(chip)
  if (ctx.reducedMotion) below.classList.add('pf-clip-still')
  return { svg: finishClip(clip, ctx.reducedMotion), below }
}

export function aimCard(): TutorialCard {
  // The deck calls clip() then below() for the same card render; both come from one build.
  let pending: ReturnType<typeof buildAim> | null = null
  return {
    id: 'aim',
    title: t('Aim your shot'),
    caption: t('Hold a direction while you swing'),
    hint: {
      pc: t('Hold W / A / S / D while you swing'),
      touch: t('Push the stick the same way while you swing'),
    },
    clip: (ctx) => {
      pending = buildAim(ctx)
      return pending.svg
    },
    below: (ctx) => {
      const built = pending ?? buildAim(ctx)
      pending = null
      return built.below
    },
  }
}
