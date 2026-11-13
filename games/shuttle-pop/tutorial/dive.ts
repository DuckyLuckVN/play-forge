// Tutorial card "Dive": a shuttle drops far to the player's left (a dashed ring warns where); the
// player dives, stretched out with speed lines behind, and gets the racket under it ("SAVE!"). The
// badge presses dive (Shift / the dive button). A small note under the clip: the shared cooldown.
import { h } from '@forge/ui/dom'
import type { ClipContext, TutorialCard } from '@forge/ui/tutorial'
import { finishClip, popText, s, showDuring, track } from '@forge/ui/tutorial/clip'
import { t } from '../i18n'
import { courtScene, PLAYER_AT } from './court'
import { moveBadge, pctBeat, player, playerOrigin, RACKET, rally, swing } from './moves'

const LOOP = 3.8
const COLOR = '#13a35f'
const WARN = '#ff8a00'
/** The dive: how far (world units, to the player's left) and how far the body tips. */
const DIVE_X = -2.1
const TILT = -58
/** Loop %: dive out, reach the shuttle, hold the stretch, get back up. */
const GO = 30
const HIT = 50
const FEET = { x: 0, y: 13 }

/** Where a point of the figure (relative to its origin) ends up once tipped by TILT about the feet. */
function tipped(q: { x: number; y: number }): { x: number; y: number } {
  const th = (TILT * Math.PI) / 180
  const vx = q.x - FEET.x
  const vy = q.y - FEET.y
  return {
    x: FEET.x + vx * Math.cos(th) - vy * Math.sin(th),
    y: FEET.y + vx * Math.sin(th) + vy * Math.cos(th),
  }
}

function diveClip(ctx: ClipContext): SVGSVGElement {
  const { clip, p, ground, actor, air } = courtScene(t('Dive'), { player: false })
  const o = playerOrigin(p)
  const me0 = p(PLAYER_AT.x, PLAYER_AT.z)
  const end = p(PLAYER_AT.x + DIVE_X, PLAYER_AT.z)
  const dv = { x: end.x - me0.x, y: end.y - me0.y }
  const head = tipped(RACKET)
  const hitAt = { x: o.x + head.x + dv.x, y: o.y + head.y + dv.y }
  const me = player()
  actor.append(me.el)
  const { hit } = rally(clip, { ground, air }, p, LOOP, {
    hitAt,
    hitY: 0.45,
    inH: { start: 1.4, peak: 4.0, end: 0.45 },
    inSpan: [4, HIT],
    to: { x: -1.0, z: 4.2 },
    outH: { start: 0.45, peak: 4.2, end: 0 },
    outEnd: 82,
    trailEnd: 84,
    color: COLOR,
  })
  // Where it would land: a dashed warning ring while it comes in.
  const spot = p(hit.x, hit.z)
  const warn = s('ellipse', {
    cx: spot.x.toFixed(1),
    cy: spot.y.toFixed(1),
    rx: 16,
    ry: 8,
    fill: 'none',
    stroke: WARN,
    'stroke-width': 3.5,
    'stroke-dasharray': '5 4',
  })
  showDuring(clip, warn, LOOP, pctBeat(LOOP, 6, HIT), { still: false })
  ground.append(warn)
  // Speed lines behind the diving player.
  const lines = s('g')
  for (let i = 0; i < 3; i++)
    lines.append(
      s('line', {
        x1: (o.x + dv.x * 0.35 + 12 + i * 4).toFixed(1),
        y1: (o.y + dv.y * 0.35 - 14 + i * 12).toFixed(1),
        x2: (o.x + 18 + i * 4).toFixed(1),
        y2: (o.y - 4 + i * 12).toFixed(1),
        stroke: '#fff',
        'stroke-width': 3,
        'stroke-linecap': 'round',
      }),
    )
  showDuring(clip, lines, LOOP, pctBeat(LOOP, 36, 56))
  air.append(lines)
  const mv = `translate(${dv.x.toFixed(1)}px,${dv.y.toFixed(1)}px)`
  const home = 'translate(0,0) rotate(0)'
  track(
    clip,
    me.body,
    LOOP,
    [
      { at: [0, GO], css: `transform:${home};animation-timing-function:ease-out` },
      { at: [46, 66], css: `transform:${mv} rotate(${TILT}deg);animation-timing-function:ease-in-out` },
      { at: 76, css: `transform:${mv} rotate(0)` },
      { at: [92, 100], css: `transform:${home}` },
    ],
    { base: `transform-origin:${FEET.x}px ${FEET.y}px`, still: `transform:${mv} rotate(${TILT}deg)` },
  )
  track(
    clip,
    me.shadow,
    LOOP,
    [
      { at: [0, GO], css: 'transform:translate(0,0) scaleX(1)' },
      { at: [46, 66], css: `transform:${mv} scaleX(1.6)` },
      { at: 76, css: `transform:${mv}` },
      { at: [92, 100], css: 'transform:translate(0,0)' },
    ],
    { base: 'transform-box:fill-box;transform-origin:center', still: `transform:${mv} scaleX(1.6)` },
  )
  swing(clip, me.racket, LOOP, { rest: 46, back: [48, 48], backDeg: 30, hit: 51, hitDeg: -40, done: 58 })
  air.append(
    popText(
      clip,
      t('Save!').toLocaleUpperCase(),
      { x: hitAt.x + 8, y: hitAt.y - 28 },
      LOOP,
      pctBeat(LOOP, 51, 86),
      {
        fill: COLOR,
        size: 26,
        burst: true,
      },
    ),
  )
  const badge = moveBadge(
    clip,
    LOOP,
    ctx,
    [{ control: { key: 'SHIFT', width: 50, glyph: 'dive' }, color: COLOR, span: [28, 48] }],
    { name: t('Dive').toLocaleUpperCase(), desc: t('reach far shuttles') },
  )
  air.append(badge.el)
  return finishClip(clip, ctx.reducedMotion)
}

export function diveCard(): TutorialCard {
  return {
    id: 'dive',
    title: t('Dive'),
    caption: t('Dive to reach a far shuttle'),
    hint: { pc: t('Shift or right click'), touch: t('Dive button') },
    clip: diveClip,
    below: () => h('p', { class: 'sp-tut-note', textContent: `⏱ ${t('Jump and dive share a cooldown')}` }),
  }
}
