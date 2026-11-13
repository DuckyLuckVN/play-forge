// Tutorial card "Jump smash": a high shuttle comes in, the player jumps (the shadow shrinks under
// them), smashes it at the top and it drives steeply into the court ("SMASH!", a burst where it
// lands). The badge presses jump (Space / the jump button), then swing (click / 🏸).
import type { ClipContext, TutorialCard } from '@forge/ui/tutorial'
import { finishClip, landingRing, popText, s, showDuring, track } from '@forge/ui/tutorial/clip'
import { t } from '../i18n'
import { courtScene } from './court'
import { moveBadge, pctBeat, player, playerOrigin, RACKET, rally, swing, swoosh, SWING } from './moves'

const LOOP = 3.8
const COLOR = '#ff3d6e'
const JUMP_COLOR = '#ffeb3b'
/** How high the jump lifts the player, in px. */
const JUMP = 58
/** Loop %: smash at the top of the jump, shuttle lands. */
const HIT = 46
const LAND = 54
const TO = { x: 0.2, z: 2.0 }

/** Yellow lines bursting out of the landing spot. */
function burst(at: { x: number; y: number }): SVGGElement {
  const g = s('g')
  for (let k = 0; k < 8; k++) {
    const c = Math.cos((k * Math.PI) / 4)
    const sn = Math.sin((k * Math.PI) / 4)
    g.append(
      s('line', {
        x1: (at.x + c * 14).toFixed(1),
        y1: (at.y + sn * 7).toFixed(1),
        x2: (at.x + c * 26).toFixed(1),
        y2: (at.y + sn * 13).toFixed(1),
        stroke: JUMP_COLOR,
        'stroke-width': 3,
        'stroke-linecap': 'round',
      }),
    )
  }
  return g
}

function smashClip(ctx: ClipContext): SVGSVGElement {
  const { clip, p, ground, actor, air } = courtScene(t('Jump smash'), { player: false })
  const o = playerOrigin(p)
  const me = player()
  actor.append(me.el)
  rally(clip, { ground, air }, p, LOOP, {
    hitAt: { x: o.x + RACKET.x, y: o.y + RACKET.y - JUMP },
    hitY: 3.6,
    inH: { start: 1.4, peak: 6.0, end: 3.6 },
    inSpan: [4, HIT],
    to: TO,
    outH: { start: 3.6, peak: 2.4, end: 0 },
    outEnd: LAND,
    trailEnd: 84,
    ease: 'ease-in',
    color: COLOR,
    solid: true,
  })
  const land = p(TO.x, TO.z)
  const ring = landingRing(land, COLOR)
  ring.classList.add('sp-tut-ring')
  showDuring(clip, ring, LOOP, pctBeat(LOOP, HIT, 84))
  ground.append(ring)
  // Jump: up fast, hang at the top for the smash, drop, squash on landing.
  track(
    clip,
    me.body,
    LOOP,
    [
      { at: [0, 24], css: 'transform:translateY(0);animation-timing-function:ease-out' },
      { at: 33, css: 'transform:translateY(-44px)' },
      { at: [44, 48], css: `transform:translateY(-${JUMP}px);animation-timing-function:ease-in` },
      { at: 62, css: 'transform:translateY(0)' },
      { at: 65, css: 'transform:translateY(2px) scaleY(.94)' },
      { at: [69, 100], css: 'transform:translateY(0)' },
    ],
    { still: 'transform:translateY(-44px)' },
  )
  track(
    clip,
    me.shadow,
    LOOP,
    [
      { at: [0, 24], css: 'transform:scale(1);opacity:1' },
      { at: [40, 50], css: 'transform:scale(.6);opacity:.6' },
      { at: [62, 100], css: 'transform:scale(1);opacity:1' },
    ],
    { base: 'transform-box:fill-box;transform-origin:center', still: 'transform:scale(.7);opacity:.7' },
  )
  swing(clip, me.racket, LOOP, { rest: 30, back: [42, 42], backDeg: 40, hit: 47, hitDeg: -80, done: 56 })
  swoosh(clip, air, { x: o.x, y: o.y - 32 - JUMP }, LOOP, HIT - 1)
  const lines = burst(land)
  showDuring(clip, lines, LOOP, pctBeat(LOOP, LAND, 68))
  air.append(lines)
  air.append(
    popText(
      clip,
      t('Smash!').toLocaleUpperCase(),
      { x: land.x - 6, y: land.y + 36 },
      LOOP,
      pctBeat(LOOP, LAND, 86),
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
    [
      { control: { key: 'SPACE', width: 54, glyph: 'jump' }, color: JUMP_COLOR, span: [22, 30] },
      { control: SWING, color: COLOR, span: [44, 50] },
    ],
    { name: t('Smash').toLocaleUpperCase() },
  )
  air.append(badge.el)
  return finishClip(clip, ctx.reducedMotion)
}

export function smashCard(): TutorialCard {
  return {
    id: 'smash',
    title: t('Jump smash'),
    caption: t('Jump, then swing on a high shuttle'),
    hint: { pc: t('Space, then click'), touch: t('Jump button, then 🏸') },
    clip: smashClip,
  }
}
