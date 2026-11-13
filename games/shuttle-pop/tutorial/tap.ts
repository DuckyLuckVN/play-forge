// Tutorial card "Tap to swing": the opponent's shot comes in, a quick swing sends it back. The badge
// presses the swing control (left click / the 🏸 button) as the racket meets the shuttle.
import type { ClipContext, TutorialCard } from '@forge/ui/tutorial'
import { finishClip } from '@forge/ui/tutorial/clip'
import { t } from '../i18n'
import { courtScene } from './court'
import { moveBadge, player, playerOrigin, RACKET, rally, swing, swoosh, SWING } from './moves'

const LOOP = 3.2
const COLOR = '#13a35f'
/** Loop %: the shuttle reaches the racket. */
const HIT = 45

function tapClip(ctx: ClipContext): SVGSVGElement {
  const title = t('Tap to swing')
  const { clip, p, ground, actor, air } = courtScene(title, { player: false })
  const o = playerOrigin(p)
  const me = player()
  actor.append(me.el)
  rally(clip, { ground, air }, p, LOOP, {
    hitAt: { x: o.x + RACKET.x, y: o.y + RACKET.y },
    hitY: 1.2,
    inH: { start: 1.4, peak: 4.2, end: 1.2 },
    inSpan: [8, HIT],
    to: { x: -0.8, z: 4.6 },
    outH: { start: 1.2, peak: 3.6, end: 0 },
    outEnd: 82,
    trailEnd: 86,
    color: COLOR,
  })
  swing(clip, me.racket, LOOP, { rest: 36, back: [42, 42], backDeg: 35, hit: 46, hitDeg: -55, done: 52 })
  swoosh(clip, air, { x: o.x, y: o.y - 32 }, LOOP, HIT - 1)
  const badge = moveBadge(clip, LOOP, ctx, [{ control: SWING, color: COLOR, span: [43, 50] }], {
    name: t('Tap').toLocaleUpperCase(),
    desc: t('quick swing'),
  })
  air.append(badge.el)
  return finishClip(clip, ctx.reducedMotion)
}

export function tapCard(): TutorialCard {
  return {
    id: 'tap',
    title: t('Tap to swing'),
    caption: t('Tap for a quick swing'),
    hint: { pc: t('Click'), touch: t('Tap 🏸') },
    clip: tapClip,
  }
}
