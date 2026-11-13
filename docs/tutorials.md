# Adding a tutorial to a game

A "How to play" deck of step cards (title, looping clip, caption, hint), shown with Skip / Back / Next,
arrow keys and swipe. Games pass already-translated text; the shell supplies the chrome strings
(Skip, Back, Next, Let's play!, Step n of N).

## Three layers

| Layer        | Where                                                   | What it does                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deck         | `engine/ui/tutorial/deck.ts`                            | `TutorialCard`, `openTutorial(cards, opts)`, `tutorialButton(open)`, `DeckEnd` (`'done' \| 'skipped' \| 'dismissed'`). Modal over the game; its keys never reach the game or shell (Esc skips). |
| Clip toolkit | `engine/ui/tutorial/clip/*` (`@forge/ui/tutorial/clip`) | Game-agnostic SVG + CSS-animation helpers, below.                                                                                                                                               |
| App wiring   | `createGameApp({ tutorial })` in `engine/app.ts`        | Opens the deck from the "How to play" buttons and on first play.                                                                                                                                |

Card fields: `id`, `title`, `caption`, `clip?`, `hint?` (`pc` / `touch`), `body?` (e.g. a settings list, under the clip), `below?` (e.g. a key pad).

Game side: a `tutorial/` folder with one file per card plus an `index.ts` returning `TutorialCard[]`
(see `games/shuttle-pop/tutorial/`).

## Wiring

```ts
createGameApp({
  guide: [...],               // optional: the last card shows "Full controls ›" when set
  tutorial: myTutorial(),     // TutorialCard[]
})
```

`tutorial` replaces the guide card for "How to play" and the first play; `guide` stays as the
full controls list. Games with only `guide` or `controls` are unchanged.

## Seen rules (`engine/ui/tutorial/first-play.ts`)

- Shares the guide's flag `play-forge:guide-seen:<id>` (in-memory fallback when storage is blocked).
- Auto-opens once, before a solo match; the countdown starts after it closes.
- Finished or skipped = seen (`shouldMarkSeen`). Closed by code (`'dismissed'`, e.g. an online
  countdown starting) = not seen, so the player gets it again.
- Online: opens over the room and is closed when the countdown starts, so it never holds up a match.

## Clip toolkit

All SVG, no canvas, no JS per frame: loops are CSS keyframes, so a clip costs nothing at rest.

- `isoProjection({ yawDeg: 45 | -45, scale, origin })` world (x right, z forward, y up) to screen `p(x, z, y?)`.
- `arc(p, from, to, { start, peak, end })` returns `{ air, ground }` point lists; `pathD(points)` makes path data.
- `clipRoot(viewBox, { label })` an `SVGSVGElement` plus `css[]` collector; `finishClip(clip, reducedMotion)` writes the CSS.
- Timeline: `Beat { at, dur }` (seconds in a loop), `beatPct`, `keyframes`, `animation`, `uid`.
- `showDuring(clip, el, loop, beat, { still })` visible only during a beat.
- `flyAlong(clip, pathD, loop, beat, { shadow, still })` ball (and ground shadow) along a path.
- `keyPad(clip, WASD, lit, loop, reducedMotion)` HTML key pad; lit keys press down in their colour during their beat.
- `badge`, `landingRing`, `chargeRing`, `popText`, `chibi` smaller pieces.

Reduced motion: pass `ctx.reducedMotion` to `finishClip` / `keyPad`; the clip shows a still frame.
Elements marked `still` (default for `showDuring` / `flyAlong`) are the frame; set `still: false` on
the rest.

## Minimal two-card example

```ts
import { h } from '@forge/ui/dom'
import type { TutorialCard } from '@forge/ui/tutorial'
import {
  arc,
  clipRoot,
  finishClip,
  flyAlong,
  isoProjection,
  keyPad,
  pathD,
  WASD,
  type Beat,
} from '@forge/ui/tutorial/clip'
import { t } from '../i18n'

const LOOP = 4
const beat: Beat = { at: 0.5, dur: 3 }

const moveCard = (): TutorialCard => ({
  id: 'move',
  title: t('Move'),
  caption: t('Run to where the ball lands'),
  hint: { pc: t('W A S D'), touch: t('Use the stick') },
  clip: (ctx) => {
    const clip = clipRoot({ w: 400, h: 300 }, { label: t('Move') })
    const p = isoProjection({ yawDeg: -45, scale: 22, origin: { x: 200, y: 168 } })
    const { air, ground } = arc(p, { x: 0, z: -4 }, { x: 0, z: 3 }, { start: 1, peak: 3, end: 0 })
    flyAlong(clip, pathD(air), LOOP, beat, { shadow: pathD(ground) })
    return finishClip(clip, ctx.reducedMotion)
  },
  below: (ctx) => {
    // keyPad adds its CSS to a clip; a card with no clip of its own makes a scratch one
    const clip = clipRoot({ w: 1, h: 1 })
    const pad = keyPad(clip, WASD, [{ id: 'w', beat, color: '#2f6bff' }], LOOP, ctx.reducedMotion)
    pad.append(h('style', {}, clip.css.join('\n')))
    return pad
  },
})
```

When the pad should share the clip's timeline and style (Shuttle Pop's aim card), build both in one
call and hand them out from `clip()` and `below()`; the deck calls `clip()` then `below()` per render.

Add a card per skill. Order: the most common action first, settings last. Every string goes through
the game's `t()`: add Vietnamese for each (a missing key falls back to English).

## Testing

jsdom unit tests, see `games/shuttle-pop/tutorial/tutorial.test.ts` and `engine/ui/tutorial/*.test.ts`.
Clip timing/projection helpers are pure; test them directly. No e2e needed.
