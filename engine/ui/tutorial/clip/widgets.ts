// Building blocks for looping tutorial clips: clip root, timed visibility, ball flight, key pad,
// badges and rings. Game-agnostic: games pass colours, text and geometry.

import { h } from '../../dom'
import { s } from './svg'
import { animation, beatPct, keyframes, pct, uid, type Beat } from './timeline'
import type { Vec2 } from './projection'

export interface Clip {
  el: SVGSVGElement
  /** Keyframe blocks + rules, written into one <style> by `finishClip`. */
  css: string[]
}

export const SKY_TOP = '#1d2b4f'
export const SKY_BOTTOM = '#3b4f86'
export const COURT = '#2e7d32'
export const OUTLINE = '#222'
export const BALL_R = 9

/** Standard W/A/S/D layout for `keyPad`. */
export const WASD = [
  { id: 'w', label: 'W', col: 2, row: 1 },
  { id: 'a', label: 'A', col: 1, row: 2 },
  { id: 's', label: 'S', col: 2, row: 2 },
  { id: 'd', label: 'D', col: 3, row: 2 },
]

/** An empty clip: an SVG with the shared sky background. `css` is filled by the helpers below. */
export function clipRoot(viewBox: { w: number; h: number }, o: { label?: string } = {}): Clip {
  const gid = uid('sky')
  const el = s(
    'svg',
    {
      class: 'pf-clip',
      viewBox: `0 0 ${viewBox.w} ${viewBox.h}`,
      role: 'img',
      'aria-label': o.label,
      style: `aspect-ratio:${viewBox.w}/${viewBox.h}`,
    },
    s(
      'defs',
      {},
      s(
        'linearGradient',
        { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
        s('stop', { offset: 0, 'stop-color': SKY_TOP }),
        s('stop', { offset: 1, 'stop-color': SKY_BOTTOM }),
      ),
    ),
    s('rect', { width: viewBox.w, height: viewBox.h, fill: `url(#${gid})` }),
  )
  return { el, css: [] }
}

/** Writes the collected CSS into the clip. Reduced motion: static key frame (see tutorial.css). */
export function finishClip(c: Clip, reducedMotion: boolean): SVGSVGElement {
  c.el.append(s('style', {}, c.css.join('\n')))
  if (reducedMotion) c.el.classList.add('pf-clip-still')
  return c.el
}

/**
 * Hidden except during `beat`. Also shown in the reduced-motion still frame unless `still: false`
 * (a clip with several shots keeps one of them as its still frame).
 */
export function showDuring(
  c: Clip,
  el: Element,
  loop: number,
  beat: Beat,
  o: { still?: boolean } = {},
): void {
  const k = uid('sh')
  el.classList.add(k)
  if (o.still !== false) el.setAttribute('data-still', '')
  c.css.push(
    `.${k}{opacity:0;animation:${animation(k, loop)}}`,
    keyframes(k, loop, beat, 'opacity:1', 'opacity:0'),
  )
}

/**
 * A ball (and optional ground shadow) that travels along path `d` during the beat: appears at the
 * start, flies over the first 55% of the beat, rests at the end, then fades. In the reduced-motion
 * still frame it rests at the end of its path, unless `still: false` (then it is hidden).
 */
export function flyAlong(
  c: Clip,
  d: string,
  loop: number,
  beat: Beat,
  o: { shadow?: string; r?: number; still?: boolean } = {},
): void {
  const still = o.still !== false
  const k = uid('fl')
  const { a, on, b, off: bOff } = beatPct(beat, loop)
  const fly = a + (b - a) * 0.55
  const aOn = Math.min(on, fly)
  const st = (dist: number, op: number) => `offset-distance:${dist}%;opacity:${op}`
  c.css.push(
    `@keyframes ${k}{0%,${pct(a)}%{${st(0, 0)}}${pct(aOn)}%{${st(0, 1)}}${pct(fly)}%,${pct(b)}%{${st(100, 1)}}${pct(bOff)}%,100%{${st(100, 0)}}}`,
  )
  const rule = (path: string) =>
    `offset-path:path("${path}");offset-rotate:0deg;opacity:0;animation:${animation(k, loop)}`
  if (o.shadow) {
    const sh = s('ellipse', { class: `${k}s`, rx: 7, ry: 3.5, fill: '#0008', 'data-still': still && '' })
    c.el.append(sh)
    c.css.push(`.${k}s{${rule(o.shadow)}}`)
  }
  const ball = s(
    'g',
    { class: `${k}b`, 'data-still': still && '' },
    s('circle', { r: o.r ?? BALL_R, fill: '#fff', stroke: OUTLINE, 'stroke-width': 2.5 }),
  )
  c.el.append(ball)
  c.css.push(`.${k}b{${rule(d)}}`)
  if (still) c.css.push(`.pf-clip-still .${k}b,.pf-clip-still .${k}s{offset-distance:100%}`)
}

/**
 * Key pad as HTML (rendered under the clip). Lit keys press down in their colour during their beat;
 * a lit entry with `still` stays pressed in the reduced-motion still frame.
 */
export function keyPad(
  c: Clip,
  keys: { id: string; label: string; col: number; row: number }[],
  lit: { id: string; beat: Beat; color: string; still?: boolean }[],
  loop: number,
  reducedMotion = false,
): HTMLElement {
  const pad = h('div', { class: reducedMotion ? 'pf-pad pf-clip-still' : 'pf-pad' })
  for (const key of keys) {
    const el = h(
      'span',
      { class: 'pf-pad-key', style: `grid-column:${key.col};grid-row:${key.row}` },
      key.label,
    )
    for (const l of lit.filter((x) => x.id === key.id)) {
      const k = uid('kp')
      el.classList.add(k)
      const on = `background:${l.color};color:#fff;transform:translateY(3px)`
      c.css.push(
        `.${k}{animation:${animation(k, loop)}}`,
        keyframes(k, loop, l.beat, on, 'background:#fff;color:#222;transform:none'),
      )
      if (l.still) c.css.push(`.pf-clip-still .${k}{${on}}`)
    }
    pad.append(el)
  }
  return pad
}

/** Dark info panel (top-left at x,y; 170x54): key cap, name, one-line description. */
export function badge(o: {
  key: string
  name: string
  desc: string
  color: string
  x: number
  y: number
}): SVGGElement {
  const txt = { fill: '#fff', 'font-weight': 900 }
  return s(
    'g',
    { transform: `translate(${o.x},${o.y})` },
    s('rect', { width: 170, height: 54, rx: 10, fill: '#000b' }),
    s('rect', { x: 8, y: 12, width: 32, height: 32, rx: 6, fill: o.color }),
    s('text', { x: 24, y: 34, 'text-anchor': 'middle', 'font-size': 17, ...txt }, o.key),
    s('text', { x: 48, y: 26, 'font-size': 17, ...txt }, o.name),
    s('text', { x: 48, y: 43, 'font-size': 11, fill: '#fff' }, o.desc),
  )
}

/** Target ring where a ball lands. */
export function landingRing(at: Vec2, color: string): SVGEllipseElement {
  return s('ellipse', { cx: at.x, cy: at.y, rx: 16, ry: 8, fill: 'none', stroke: color, 'stroke-width': 3.5 })
}

/** A ring that grows while the shot charges, during the beat. */
export function chargeRing(c: Clip, at: Vec2, loop: number, beat: Beat): SVGGElement {
  const k = uid('cr')
  const { a, on, b } = beatPct(beat, loop)
  c.css.push(
    `.${k}{transform-box:fill-box;transform-origin:center;opacity:0;animation:${animation(k, loop)}}`,
    `@keyframes ${k}{0%,${pct(a)}%{transform:scale(0.3);opacity:0}${pct(on)}%{transform:scale(0.3);opacity:1}${pct(b)}%{transform:scale(1.3);opacity:0}100%{transform:scale(1.3);opacity:0}}`,
  )
  const ring = s('ellipse', {
    class: k,
    'data-still': '',
    rx: 22,
    ry: 11,
    fill: 'none',
    stroke: '#fff',
    'stroke-width': 3,
  })
  return s('g', { transform: `translate(${at.x},${at.y})` }, ring)
}

/** A short word that pops up and drifts during the beat (e.g. "SMASH!"). */
export function popText(c: Clip, text: string, at: Vec2, loop: number, beat: Beat): SVGTextElement {
  const k = uid('pt')
  const { a, on, b, off } = beatPct(beat, loop)
  c.css.push(
    `.${k}{opacity:0;animation:${animation(k, loop)}}`,
    `@keyframes ${k}{0%,${pct(a)}%{opacity:0;transform:translateY(6px)}${pct(on)}%{opacity:1;transform:translateY(0)}${pct(b)}%{opacity:1;transform:translateY(-8px)}${pct(off)}%,100%{opacity:0;transform:translateY(-8px)}}`,
  )
  return s(
    'text',
    {
      class: k,
      'data-still': '',
      x: at.x,
      y: at.y,
      'text-anchor': 'middle',
      'font-weight': 900,
      'font-size': 16,
      fill: '#ffd24a',
      stroke: OUTLINE,
      'stroke-width': 3,
      'paint-order': 'stroke',
    },
    text,
  )
}
