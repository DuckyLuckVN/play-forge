// Tutorial card "Power shot": hold the swing while the shuttle comes in; a ring around the player
// fills, flashes when full, and the release sends a fast, flat shot ("POWER!"). The badge's mouse
// button / 🏸 stays down the whole charge and its line turns from "hold… charging" to "release!".
import type { ClipContext, TutorialCard } from '@forge/ui/tutorial'
import { finishClip, popText, s, showDuring, track, type Clip } from '@forge/ui/tutorial/clip'
import { t } from '../i18n'
import { courtScene } from './court'
import { moveBadge, pctBeat, player, playerOrigin, RACKET, rally, swing, swoosh, SWING } from './moves'

const LOOP = 3.8
const COLOR = '#ff8a00'
const FULL = '#ffeb3b'
/** Loop %: start charging, then release as the shuttle reaches the racket. */
const CHARGE = 12
const HIT = 60
const RING_R = 30
const RING_LEN = 2 * Math.PI * RING_R

/** The charge ring around the player: fills from the top while held, flashes, bursts on release. */
function powerRing(clip: Clip): SVGGElement {
  const len = RING_LEN.toFixed(1)
  const fill = s('circle', {
    cy: -6,
    r: RING_R,
    fill: 'none',
    stroke: FULL,
    'stroke-width': 7,
    'stroke-linecap': 'round',
    'stroke-dasharray': len,
    transform: `rotate(-90 0 -6)`,
  })
  const ring = s(
    'g',
    { class: 'sp-tut-charge' },
    s('circle', { cy: -6, r: RING_R, fill: 'none', stroke: '#0006', 'stroke-width': 7 }),
    fill,
  )
  track(
    clip,
    ring,
    LOOP,
    [
      { at: [0, CHARGE - 1], css: 'opacity:0' },
      { at: [CHARGE, HIT], css: 'opacity:1' },
      { at: [66, 100], css: 'opacity:0' },
    ],
    { base: 'opacity:0' },
  )
  ring.setAttribute('data-still', '')
  track(
    clip,
    fill,
    LOOP,
    [
      { at: [0, CHARGE], css: `stroke-dashoffset:${len};stroke:${FULL}` },
      { at: 54, css: `stroke-dashoffset:0;stroke:${FULL}` },
      { at: 56, css: `stroke-dashoffset:0;stroke:${COLOR}` },
      { at: 58, css: `stroke-dashoffset:0;stroke:${FULL}` },
      { at: HIT, css: `stroke-dashoffset:0;stroke:${COLOR};stroke-width:7` },
      { at: 64, css: 'stroke-dashoffset:0;stroke:#fff;stroke-width:14' },
      { at: 100, css: 'stroke-dashoffset:0' },
    ],
    { base: `stroke-dashoffset:${len}`, timing: 'linear', still: `stroke-dashoffset:0;stroke:${COLOR}` },
  )
  return ring
}

function chargeClip(ctx: ClipContext): SVGSVGElement {
  const { clip, p, ground, actor, air } = courtScene(t('Power shot'), { player: false })
  const o = playerOrigin(p)
  const me = player(powerRing(clip))
  actor.append(me.el)
  rally(clip, { ground, air }, p, LOOP, {
    hitAt: { x: o.x + RACKET.x, y: o.y + RACKET.y },
    hitY: 1.2,
    inH: { start: 1.4, peak: 4.6, end: 1.2 },
    inSpan: [14, HIT],
    to: { x: 0.6, z: 5.6 },
    outH: { start: 1.2, peak: 1.9, end: 0.1 },
    outEnd: 68,
    trailEnd: 84,
    ease: 'ease-out',
    color: COLOR,
    solid: true,
  })
  swing(clip, me.racket, LOOP, {
    rest: CHARGE,
    back: [22, HIT - 1],
    backDeg: 45,
    hit: 63,
    hitDeg: -65,
    done: 72,
  })
  swoosh(clip, air, { x: o.x, y: o.y - 32 }, LOOP, HIT - 1)
  air.append(
    popText(
      clip,
      t('Power!').toLocaleUpperCase(),
      { x: o.x + 70, y: o.y - 70 },
      LOOP,
      pctBeat(LOOP, HIT, 86),
      {
        fill: COLOR,
        size: 26,
        burst: true,
      },
    ),
  )
  const badge = moveBadge(clip, LOOP, ctx, [{ control: SWING, color: COLOR, span: [CHARGE, HIT - 0.3] }], {
    name: t('Power').toLocaleUpperCase(),
    desc: '',
  })
  // The second line: "hold… charging" while held, "release!" from the hit (the still frame's line).
  const line = { x: badge.textX, y: 279, 'font-size': 11 }
  const hold = s('text', { ...line, fill: '#fff' }, t('hold… charging'))
  const release = s('text', { ...line, fill: FULL, 'font-weight': 900 }, t('release!'))
  track(
    clip,
    hold,
    LOOP,
    [
      { at: [0, HIT - 0.3], css: 'opacity:1' },
      { at: [HIT, 100], css: 'opacity:0' },
    ],
    { still: 'opacity:0' },
  )
  showDuring(clip, release, LOOP, pctBeat(LOOP, HIT, 90))
  badge.el.append(hold, release)
  air.append(badge.el)
  return finishClip(clip, ctx.reducedMotion)
}

export function chargeCard(): TutorialCard {
  return {
    id: 'charge',
    title: t('Power shot'),
    caption: t('Hold to charge… release!'),
    hint: { pc: t('Hold left click, then release'), touch: t('Hold 🏸, then release') },
    clip: chargeClip,
  }
}
