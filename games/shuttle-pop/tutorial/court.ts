// The −45° court backdrop for Shuttle Pop's tutorial clips: sky, court, own-half tint, centre line,
// net, opponent and the player ("you"). Forward (z) points up-right, toward the opponent.
// Shots draw into two layers: `ground` (under the net: shadow paths, landing rings) and `air`
// (over the net and opponent: flight paths, badges); balls from `flyAlong` go on top of everything.
// Move cards animate their own player in `actor` (just under `air`) and pass `{ player: false }`.
import {
  chibi,
  clipRoot,
  COURT,
  isoProjection,
  pathD,
  s,
  type Clip,
  type Projection,
  type Vec2,
} from '@forge/ui/tutorial/clip'
import { t } from '../i18n'

/** Court half-width / half-length and net height, in clip world units. */
export const COURT_W = 3.05
export const COURT_L = 6.7
export const NET_H = 1.55
/** Where the player stands (own half, slightly right of centre). */
export const PLAYER_AT = { x: 0.4, z: -4.5 }
export const VIEW = { w: 400, h: 300 }
/** The player's shirt and hair (seen from behind). */
export const ME_TEAM = '#ff5a7a'
export const ME_HAIR = '#5a3a2a'

export const OPPONENT_AT = { x: 0, z: 5.2 }
const LABEL = { 'font-weight': 900, 'font-size': 12, fill: '#fff' }

export const courtProjection = (): Projection =>
  isoProjection({ yawDeg: -45, scale: 22, origin: { x: 200, y: 168 } })

const points = (pts: Vec2[]) => pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')

export interface CourtScene {
  clip: Clip
  p: Projection
  ground: SVGGElement
  /** Empty layer for an animated player, over the net and opponent, under `air`. */
  actor: SVGGElement
  air: SVGGElement
}

/** A fresh clip with the court drawn and empty shot layers. `player: false` leaves "you" out. */
export function courtScene(label: string, o: { player?: boolean } = {}): CourtScene {
  const clip = clipRoot(VIEW, { label })
  const p = courtProjection()
  const W = COURT_W
  const L = COURT_L
  const ground = s('g')
  const actor = s('g')
  const air = s('g')
  const opp = p(OPPONENT_AT.x, OPPONENT_AT.z)
  const oppTag = p(1.2, 8.2)
  const me = p(PLAYER_AT.x, PLAYER_AT.z)
  clip.el.append(
    s('polygon', {
      points: points([p(-W, -L), p(W, -L), p(W, L), p(-W, L)]),
      fill: COURT,
      stroke: '#fff',
      'stroke-width': 3,
    }),
    // Own half, lighter.
    s('polygon', { points: points([p(-W, -L), p(W, -L), p(W, 0), p(-W, 0)]), fill: '#ffffff18' }),
    s('path', {
      d: pathD([p(0, -L), p(0, L)]),
      stroke: '#ffffff66',
      'stroke-width': 2,
    }),
    ground,
    s('polygon', {
      points: points([p(-W, 0), p(W, 0), p(W, 0, NET_H), p(-W, 0, NET_H)]),
      fill: '#ffffff45',
      stroke: '#fff',
      'stroke-width': 2.5,
    }),
    s(
      'g',
      { transform: `translate(${opp.x.toFixed(1)},${opp.y.toFixed(1)}) scale(0.8)` },
      chibi({ at: { x: 0, y: 0 }, team: '#4b7bff', facing: 'left' }),
    ),
    s(
      'text',
      { x: oppTag.x.toFixed(1), y: oppTag.y.toFixed(1), 'text-anchor': 'end', ...LABEL },
      t('Opponent').toLocaleUpperCase(),
    ),
    actor,
    air,
    // Seen from behind: the head is all hair.
    o.player === false
      ? ''
      : chibi({ at: { x: me.x, y: me.y + 6 }, team: ME_TEAM, skin: ME_HAIR, facing: 'right', racket: true }),
    s(
      'text',
      { x: (me.x + 22).toFixed(1), y: (me.y + 28).toFixed(1), ...LABEL },
      t('You').toLocaleUpperCase(),
    ),
  )
  return { clip, p, ground, actor, air }
}
