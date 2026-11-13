// Shared pieces for the move cards (tap, power shot, jump smash, dive): an animated player whose
// body, shadow and racket can each be moved with `track`, the rally (the opponent's shot in, your shot
// out from the racket), the swing swoosh, and the badge with the control that does the move: mouse /
// keycaps on PC, the on-screen button glyphs on touch. Moments are loop percentages, like @keyframes.
import type { ClipContext } from '@forge/ui/tutorial'
import {
  arc,
  flyAlong,
  OUTLINE,
  pathD,
  s,
  showDuring,
  track,
  unproject,
  type Beat,
  type Clip,
  type Projection,
  type Vec2,
} from '@forge/ui/tutorial/clip'
import { actIcon, diveIcon, racketIcon } from '../hud'
import { courtProjection, ME_HAIR, ME_TEAM, OPPONENT_AT, PLAYER_AT } from './court'

/** A window of the loop from `a`% to `b`%, as a toolkit Beat (seconds). */
export const pctBeat = (loop: number, a: number, b: number): Beat => ({
  at: (a / 100) * loop,
  dur: ((b - a) / 100) * loop,
})

/** Where the player figure stands on screen (its feet / group origin, as the court's chibi). */
export function playerOrigin(p: Projection = courtProjection()): Vec2 {
  const me = p(PLAYER_AT.x, PLAYER_AT.z)
  return { x: me.x, y: me.y + 6 }
}
/** The racket head, relative to the player origin. */
export const RACKET = { x: 18, y: -32 }
/** The racket's pivot (the hand), relative to the player origin: `transform-origin` for swings. */
export const HAND = 'transform-origin:6px -8px'

export interface Player {
  el: SVGGElement
  shadow: SVGEllipseElement
  /** Body, head and racket: moves for jumps and dives. */
  body: SVGGElement
  racket: SVGGElement
}

/** The player seen from behind, built in parts so each can be animated. `under` draws first (a ring). */
export function player(under?: SVGElement): Player {
  const o = playerOrigin()
  const line = { stroke: OUTLINE, 'stroke-width': 2 }
  const shadow = s('ellipse', { cy: 13, rx: 16, ry: 6, fill: '#0005' })
  const racket = s(
    'g',
    {},
    s('line', {
      x1: 8,
      y1: -12,
      x2: 14,
      y2: -23,
      stroke: OUTLINE,
      'stroke-width': 3,
      'stroke-linecap': 'round',
    }),
    s('ellipse', { cx: RACKET.x, cy: RACKET.y, rx: 8, ry: 10, fill: '#fff9', ...line }),
  )
  const body = s(
    'g',
    {},
    s('rect', { x: -12, y: -13, width: 24, height: 28, rx: 8, fill: ME_TEAM, ...line }),
    s('circle', { cy: -24, r: 14, fill: ME_HAIR, ...line }),
    racket,
  )
  const el = s('g', { transform: `translate(${o.x.toFixed(1)},${o.y.toFixed(1)})` }, under, shadow, body)
  return { el, shadow, body, racket }
}

/** A swing's racket path: rest, wind up, follow through, rest. Stops in loop %. */
export function swing(
  c: Clip,
  racket: Element,
  loop: number,
  m: { rest: number; back: [number, number]; backDeg: number; hit: number; hitDeg: number; done: number },
): void {
  const back = m.back[0] === m.back[1] ? m.back[0] : m.back
  track(
    c,
    racket,
    loop,
    [
      { at: [0, m.rest], css: 'transform:rotate(0)' },
      { at: back, css: `transform:rotate(${m.backDeg}deg)` },
      { at: m.hit, css: `transform:rotate(${m.hitDeg}deg)` },
      { at: [m.done, 100], css: 'transform:rotate(0)' },
    ],
    { base: HAND },
  )
}

/** The white arc of the racket's swing, briefly, from `a`%. `at` is the racket's hand height. */
export function swoosh(c: Clip, layer: Element, at: Vec2, loop: number, a: number): void {
  const d = `M${(at.x + 14).toFixed(1)},${(at.y + 18).toFixed(1)} Q${(at.x + 34).toFixed(1)},${(at.y - 6).toFixed(1)} ${(at.x + 16).toFixed(1)},${(at.y - 30).toFixed(1)}`
  const el = s('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': 5, 'stroke-linecap': 'round' })
  showDuring(c, el, loop, pctBeat(loop, a, a + 5), { still: false })
  layer.append(el)
}

type Heights = { start: number; peak: number; end: number }

export interface Rally {
  /** Where the racket meets the shuttle, in the world and on screen. */
  hit: { x: number; z: number; y: number; at: Vec2 }
  out: { air: string; ground: string }
}

/**
 * The opponent's shot flying in to the racket (hidden in the still frame) and the player's shot
 * flying out to `to` (the still frame's shuttle, resting where it lands), with its trail shown from
 * the hit to `trailEnd`%. `hitAt` is the racket head on screen, `hitY` its height in the world.
 */
export function rally(
  c: Clip,
  layers: { ground: Element; air: Element },
  p: Projection,
  loop: number,
  o: {
    hitAt: Vec2
    hitY: number
    inH: Heights
    inSpan: [number, number]
    to: { x: number; z: number }
    outH: Heights
    outEnd: number
    trailEnd: number
    ease?: string
    color: string
    /** Air trail: dotted (a placement) or solid (a hard hit). */
    solid?: boolean
  },
): Rally {
  const w = unproject(p, o.hitAt, o.hitY)
  const inArc = arc(p, OPPONENT_AT, w, o.inH)
  const outArc = arc(p, w, o.to, o.outH)
  const out = { air: pathD(outArc.air), ground: pathD(outArc.ground) }
  const [a, hit] = o.inSpan
  flyAlong(c, pathD(inArc.air), loop, pctBeat(loop, a, hit), {
    shadow: pathD(inArc.ground),
    flight: 1,
    still: false,
  })
  flyAlong(c, out.air, loop, pctBeat(loop, hit, o.outEnd), { shadow: out.ground, flight: 1, ease: o.ease })
  const ground = s('path', {
    class: 'sp-tut-trail',
    d: out.ground,
    fill: 'none',
    stroke: '#0007',
    'stroke-width': 4,
    'stroke-dasharray': '4 6',
  })
  const air = s('path', {
    class: 'sp-tut-trail',
    d: out.air,
    fill: 'none',
    stroke: o.color,
    'stroke-width': o.solid ? 7 : 6,
    'stroke-linecap': 'round',
    'stroke-dasharray': o.solid ? undefined : '2 10',
  })
  const trail = pctBeat(loop, hit, o.trailEnd)
  showDuring(c, ground, loop, trail)
  showDuring(c, air, loop, trail)
  layers.ground.append(ground)
  layers.air.append(air)
  return { hit: { ...w, y: o.hitY, at: o.hitAt }, out }
}

// ---------- Badge: the control that does the move ----------

export type Glyph = 'swing' | 'jump' | 'dive'
/** One control on the badge. On touch, `glyph` replaces the mouse / keycap. */
export type Control = { mouse: true; glyph: Glyph } | { key: string; width: number; glyph: Glyph }

export interface Press {
  control: Control
  color: string
  /** Loop % while it is held down. */
  span: [number, number]
}

const GLYPHS: Record<Glyph, () => SVGSVGElement> = { swing: racketIcon, jump: actIcon, dive: diveIcon }
const BADGE = { x: 220, y: 236, w: 170, h: 54 }
const CHIP = { y: 248, h: 32, w: 32, gap: 6 }

/** A chip that presses down in `color` during its span. */
function chip(c: Clip, loop: number, x: number, w: number, press: Press, inside: SVGElement[]): SVGGElement {
  const [a, b] = press.span
  const g = s(
    'g',
    {},
    s('rect', { x, y: CHIP.y, width: w, height: CHIP.h, rx: 6, stroke: OUTLINE, 'stroke-width': 2 }),
    ...inside,
  )
  const up = 'fill:#fff;transform:none'
  track(
    c,
    g,
    loop,
    [
      { at: [0, Math.max(a - 0.01, 0)], css: up },
      { at: [a, b], css: `fill:${press.color};transform:translateY(3px)` },
      { at: [b + 0.3, 100], css: up },
    ],
    { base: 'fill:#fff' },
  )
  return g
}

/** Mouse with its left button lighting up in `color` during the span. */
function mouse(c: Clip, loop: number, at: Vec2, press: Press): SVGGElement {
  const [a, b] = press.span
  const edge = { stroke: OUTLINE, 'stroke-width': 1.5 }
  const button = s('path', { d: 'M-8,-1 L-8,-3 A8,8 0 0 1 0,-11 L0,-1 Z', fill: '#fff', ...edge })
  track(c, button, loop, [
    { at: [0, Math.max(a - 0.01, 0)], css: 'fill:#fff' },
    { at: [a, b], css: `fill:${press.color}` },
    { at: [b + 0.3, 100], css: 'fill:#fff' },
  ])
  return s(
    'g',
    { class: 'sp-tut-mouse', transform: `translate(${at.x},${at.y})` },
    s('rect', {
      x: -8,
      y: -11,
      width: 16,
      height: 22,
      rx: 8,
      fill: '#fff',
      stroke: OUTLINE,
      'stroke-width': 2,
    }),
    button,
    s('line', { x1: 0, y1: -11, x2: 0, y2: -1, ...edge }),
    s('line', { x1: -8, y1: -1, x2: 8, y2: -1, ...edge }),
  )
}

/** The touch button's own glyph (the same drawing as on the in-game button). */
function glyph(kind: Glyph, x: number): SVGSVGElement {
  const g = GLYPHS[kind]()
  g.setAttribute('class', 'sp-tut-glyph')
  g.setAttribute('data-glyph', kind)
  for (const [k, v] of Object.entries({ x: x + 3, y: CHIP.y + 3, width: 26, height: 26, color: OUTLINE }))
    g.setAttribute(k, String(v))
  return g
}

/** Rough bold-text width per character per px of font size (no layout to measure in a clip). */
const BOLD_EM = 0.68
const PLAIN_EM = 0.55
/** Font size that keeps `text` within `room` px (never above `size`, never below 10). */
export const fitSize = (text: string, size: number, room: number, em: number) =>
  Math.max(10, Math.min(size, Math.floor(room / (Math.max(text.length, 1) * em))))

/**
 * Dark panel (bottom right, like the aim card's): the controls, pressed in time, then the move's name
 * and a short description. Returns where the text starts, for a card that adds its own lines.
 */
export function moveBadge(
  c: Clip,
  loop: number,
  ctx: ClipContext,
  presses: Press[],
  text: { name: string; desc?: string },
): { el: SVGGElement; textX: number; room: number } {
  const el = s(
    'g',
    {},
    s('rect', { x: BADGE.x, y: BADGE.y, width: BADGE.w, height: BADGE.h, rx: 10, fill: '#000b' }),
  )
  let x = BADGE.x + 8
  for (const press of presses) {
    const ctl = press.control
    const w = ctx.touch || 'mouse' in ctl ? CHIP.w : ctl.width
    const inside: SVGElement[] = []
    if (ctx.touch) inside.push(glyph(ctl.glyph, x))
    else if (!('mouse' in ctl))
      inside.push(
        s(
          'text',
          {
            x: x + w / 2,
            y: 269,
            'text-anchor': 'middle',
            'font-weight': 900,
            'font-size': 12,
            fill: OUTLINE,
          },
          ctl.key,
        ),
      )
    const g = chip(c, loop, x, w, press, inside)
    if (!ctx.touch && !('mouse' in ctl)) g.classList.add('sp-tut-cap')
    el.append(g)
    if (!ctx.touch && 'mouse' in ctl) el.append(mouse(c, loop, { x: x + 16, y: 264 }, press))
    x += w + CHIP.gap
  }
  const textX = x + 2
  const room = BADGE.x + BADGE.w - 6 - textX
  const bold = { 'font-weight': 900, fill: '#fff' }
  if (text.desc === undefined) {
    // Name only: centred on the chips' line.
    el.append(
      s('text', { x: textX, y: 269, 'font-size': fitSize(text.name, 15, room, BOLD_EM), ...bold }, text.name),
    )
  } else {
    el.append(
      s('text', { x: textX, y: 262, 'font-size': fitSize(text.name, 16, room, BOLD_EM), ...bold }, text.name),
    )
    if (text.desc)
      el.append(
        s(
          'text',
          { x: textX, y: 279, 'font-size': fitSize(text.desc, 11, room, PLAIN_EM), fill: '#fff' },
          text.desc,
        ),
      )
  }
  return { el, textX, room }
}

/** Swing on PC is the left mouse button, on touch the 🏸 button. */
export const SWING: Control = { mouse: true, glyph: 'swing' }
