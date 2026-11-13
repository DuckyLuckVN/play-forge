# Styling

Plain CSS, no framework. Shared styles live in `engine/ui/styles/`; each game adds one unlayered CSS
file for what is truly its own. The look is "tidy chunky": toy-like raised edges, small corner radii,
one card style, consistent spacing, the Fredoka font.

## Files

```
engine/ui/base.css            entry point pages import (just imports styles/index.css)
engine/ui/styles/
  index.css                   imports everything below, in this order
  layers.css                  @layer pf.reset, pf.tokens, pf.components;
  fonts.css                   Fredoka @font-face (unlayered)
  tokens.css                  design tokens (custom properties on :root)
  reset.css                   box-sizing, html/body, focus ring, reduced motion, [hidden]
  components/*.css            one file per component (below)
engine/social/social.css      avatars, reactions, voice, chat (same pf.components layer)
games/<id>/<id>.css           game-only styles (unlayered)
launcher/launcher.css         launcher-only styles (unlayered)
```

`engine/app.ts` imports `base.css` for every game built on `createGameApp`; pages that build their own
shell (launcher, Brickstorm) import `@forge/ui/base.css` first, then their own CSS.

## Cascade layers

All engine CSS sits in cascade layers, declared once in `layers.css`:

1. `pf.reset` — document defaults.
2. `pf.tokens` — the `:root` custom properties.
3. `pf.components` — every shared component, plus `social.css`.

Game and launcher CSS is **unlayered**, and unlayered rules always beat layered ones. So a game can
restyle any `.pf-*` component with a plain class selector; no `!important`, no specificity games.

Two things to know:

- Unlayered game rules win even against more specific engine rules, including state rules such as
  `.pf-btn:hover`. If a game rule sets `box-shadow` on a `.pf-btn`, it also replaces the button's hover
  and pressed depth; scope it (e.g. `:not(:hover, :active)`) or set the button variables instead
  (`--face`, `--edge`, `--text`, `--pf-edge`).
- `!important` reverses layer order: an `!important` in an earlier layer beats one in a later layer and
  any unlayered one. That's why `[hidden] { display: none !important }` lives in `pf.components` (the
  top-bar groups override it with their own `!important`), and why game CSS should not need
  `!important` against engine rules at all.

## Tokens

Defined in `engine/ui/styles/tokens.css`. Use them for every colour, size, gap, radius, shadow and
z-index. If a value you need is missing, add a token rather than a raw value.

| Group   | Tokens                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour  | `--pf-night` `--pf-felt` `--pf-rim` `--pf-pit` `--pf-chalk` `--pf-haze` `--pf-yolk` `--pf-yolk-edge` `--pf-ink`                                       |
|         | `--pf-coral` `--pf-coral-edge` `--pf-coral-ink` `--pf-mint` `--pf-mint-edge` `--pf-mint-ink` `--pf-sky` `--pf-violet` `--pf-pink`                     |
| Type    | `--pf-font`; sizes `--pf-fs-xs/sm/md/base/lg/xl/2xl` = 12/13/14/16/20/24/28px; weights `--pf-fw-semi` 600, `--pf-fw-bold` 700                         |
| Spacing | `--pf-space-1..7` = 2/4/6/8/12/16/20px                                                                                                                |
| Radius  | `--pf-radius-lg` 14, `--pf-radius-md` 10, `--pf-radius` 8, `--pf-radius-sm` 6, `--pf-radius-pill` 999px                                               |
| Depth   | `--pf-edge` (button depth, 4px); `--pf-lift-sm/md/lg` = `0 3px/4px/6px 0 var(--pf-rim)`; `--pf-drop` (modal shadow)                                   |
| Stack   | `--pf-z-raised` 2, `-notice` 5, `-overlay` 10, `-countdown` 11, `-rotate` 12, `-bar` 15, `-toast` 20, `-popover` 25, `-fab` 40, `-sheet` 50, `-fx` 60 |

Colours come from `engine/ui/theme.ts` (canvas renderers import `theme`; `applyTheme()` writes each
key as `--pf-<kebab-key>` on `<html>` at startup). `tokens.css` repeats the same values as static
defaults so a page is coloured before any script runs. `engine/ui/tokens.test.ts` fails if the two
drift apart, so change a colour in both places. For a translucent tint of a token use
`color-mix(in srgb, var(--pf-mint) 25%, transparent)`.

## Components

| File            | Classes                                                                                                         | TS helper                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `shell.css`     | `.pf-shell` `.pf-bar` `.pf-bar-title` `.pf-bar-scores` `.pf-bar-actions` `.pf-stage`                            | `createGameApp` builds it                                      |
| `surface.css`   | `.pf-card` (+ `.sunken` `.raised` `.sm`)                                                                        | `card()`, `cardClass()`                                        |
| `pill.css`      | `.pf-pill` (+ `.mint` `.common` `.rare` `.epic` `.dot`); accent classes set `--accent`                          | `pill()`, `pillClass()`                                        |
| `button.css`    | `.pf-btn` + `.primary` `.quiet` `.icon` `.wide` `.sm` `.go` `.danger` `.loading`; `.pf-icon`; `.pf-toolbar`     | `button()`, `toolButton()`, `iconButton()`, `icon()`           |
| `overlay.css`   | `.pf-overlay`, `.pf-panel` (+ `.wide`, `.enter`; `--pf-panel-pad`)                                              | `panel()`                                                      |
| `text.css`      | `.pf-heading` `.pf-lede` `.pf-headline` `.pf-note` (+ `.error`) `.pf-or`                                        | `note()`                                                       |
| `forms.css`     | `.pf-field` `.pf-input` (+ `.code`) `.pf-row`                                                                   |                                                                |
| `results.css`   | `.pf-summary` `.pf-stat` (+ `.hi`), `.pf-ranking` `.pf-rank*`, `.pf-leaderboard` `.pf-lb-*`                     |                                                                |
| `room.css`      | `.pf-room` `.pf-room-code`, `.pf-seats` `.pf-seat` `.pf-token` `.pf-badge` `.pf-seat-*`                         |                                                                |
| `chip.css`      | `.pf-chip` (+ `.self` `.out` `.bump`; `.dot`)                                                                   |                                                                |
| `dots.css`      | `.pf-dots` (waiting)                                                                                            |                                                                |
| `popover.css`   | `.pf-popover-anchor` `.pf-popover` `.pf-lang-btn` `.pf-lang-pop`                                                | `popover()`, `audioMenu()`, `langMenu()`                       |
| `slider.css`    | `.pf-slider` `.pf-range` `.pf-range-value`                                                                      | `slider()`                                                     |
| `countdown.css` | `.pf-countdown`                                                                                                 |                                                                |
| `toast.css`     | `.pf-toasts` `.pf-toast` (`--pf-toast-dot`)                                                                     | `toast()`                                                      |
| `count.css`     | `.pf-count` (number badge on a button)                                                                          | `countBadge()`                                                 |
| `mobile.css`    | top-bar groups: `.pf-fan*` `.pf-fab` `.pf-more*` `.pf-overflow` `.pf-slot`; phone bottom sheets                 |                                                                |
| `options.css`   | `.pf-options` `.pf-option` `.pf-segmented` `.pf-segment`                                                        | `optionPickers()`                                              |
| `guide.css`     | `.pf-guide-layer` `.pf-guide-panel` `.pf-guide-card` `.pf-guide*` rows, `.pf-key` (keycap), `.pf-sr`            | `openGuide()`, `guideCard()`, `guideList()`, `guideButton()`   |
| `tutorial.css`  | `.pf-tut-*` (panel, card, clip, caption, hint, dots, row), `.pf-clip` `.pf-clip-still`, `.pf-pad` `.pf-pad-key` | `openTutorial()`, `tutorialButton()`, `clipRoot()`, `keyPad()` |

The look in numbers ("tidy chunky"):

- Card: felt, `2px solid var(--pf-rim)`, `--pf-radius-lg`, `--pf-lift-lg` (6px edge), 12px padding.
  Notices and hints: `.pf-card.sm` (8px radius, 4px edge).
- Panel (modal): the card plus `--pf-drop`, 20px padding (`--pf-panel-pad`).
- Button: 600 16px, padding `12px 16px 11px`, 4px edge; icon buttons 42px (40px in a phone's top
  bar); `.sm` for toolbars (3px edge, 14px text).
- Pills stay round with a 2px border; toasts are 8px rounded with a 4px edge.

Accents: `.mint`, `.common` (sky), `.rare` (violet), `.epic` (yolk) set `--accent` with zero
specificity. Any element can then use `border-color: var(--accent)` / `color: var(--accent)` instead
of repeating the colour per rarity.

TS helpers (`engine/ui/components.ts`, exported from `@forge`): `button(text, onclick, variant?)`,
`toolButton(label, svgIcon, onclick, variant?)`, `panel(...children)`, `card(...children)`,
`pill(text, variant?)`, `note(text, error?)`, plus the pure class builders `buttonClass`,
`cardClass`, `pillClass`, `noteClass` and `cx`.

Buttons are themed by three variables, which games may set: `--face` (fill), `--edge` (border and
raised edge), `--text`; and `--pf-edge` for the depth. Player colour on seats, chips and rankings is
`--c`.

## Rules

- Use tokens. No raw hex colours in game CSS; add a token (and the `theme.ts` entry) if one is missing.
  A game's own palette (e.g. Synthstride's neon, from its `palette.ts`) is named once as game custom
  properties at the top of its CSS file (`--ss-cyan`), never repeated as hex.
- Reuse a component before writing a new class; extend it with a modifier class in the game file.
- No inline visual styles from TS (`style="color:…"`). Use a class. Inline is fine for geometry or
  per-element hand-offs (`left`, `width`, `--c`, `--i`, `--left`).
- Keep each component's media queries in its own file.
- Every user-visible text goes through the game's translator (en + vi).

## Adding a component

1. Create `engine/ui/styles/components/<name>.css`, wrap the rules in `@layer pf.components { … }`, and
   use tokens only.
2. Import it from `styles/index.css`. Order matters only between components that style the same
   element; put it after the ones it builds on.
3. If it needs markup, add a small helper in `engine/ui/` and export it from `engine/index.ts`.
4. List it in the table above.
