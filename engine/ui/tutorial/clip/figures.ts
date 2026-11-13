// Figures for tutorial clips: little hand-drawn players.

import { s } from './svg'
import { OUTLINE } from './widgets'
import type { Vec2 } from './projection'

/** Little player: shadow, body, head and optional racket. `team` is the body colour. */
export function chibi(o: {
  at: Vec2
  team: string
  facing: 'left' | 'right'
  racket?: boolean
  skin?: string
}): SVGGElement {
  const line = { stroke: OUTLINE, 'stroke-width': 2 }
  const inner = s(
    'g',
    { transform: o.facing === 'left' ? 'scale(-1,1)' : undefined },
    s('ellipse', { cy: 13, rx: 16, ry: 6, fill: '#0005' }),
    s('rect', { x: -12, y: -13, width: 24, height: 28, rx: 8, fill: o.team, ...line }),
    s('circle', { cy: -24, r: 14, fill: o.skin ?? '#ffd7b0', ...line }),
    o.racket && s('ellipse', { cx: 18, cy: -32, rx: 8, ry: 10, fill: '#fff9', ...line }),
  )
  return s('g', { transform: `translate(${o.at.x},${o.at.y})` }, inner)
}
