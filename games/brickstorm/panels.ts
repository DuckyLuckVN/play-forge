// Side panels (run stats, boosts, helper tray) and the Guide screen.
import { h } from '@forge/ui/dom'
import { theme } from '@forge/ui/theme'
import { drawBall } from './cosmetics'
import { GUIDE, runStats } from './guide'
import { BOOST_ICONS } from './icons'
import { drawKindGlyph, drawPickupGlyph } from './render'
import type { Helpers } from './save'
import { BOOSTS } from './sim/boosts'
import type { ActiveHelper, BoostId, BrickKind, PickupKind, RunState } from './sim/types'

export const ACTIVE_HELPERS: Array<{ id: ActiveHelper; name: string; glyph: string; text: string }> = [
  { id: 'pushBack', name: 'Push Back', glyph: '⇡', text: 'Lift every brick up a row' },
  { id: 'rowBomb', name: 'Row Bomb', glyph: '✸', text: 'Destroy the lowest row' },
  { id: 'freeze', name: 'Freeze', glyph: '❄', text: "Bricks don't drop after your next volley" },
  { id: 'firePack', name: 'Fire Pack', glyph: '🔥', text: 'Next volley starts with 5 fireballs' },
  { id: 'surge', name: 'Ball Surge', glyph: '×1.5', text: '+50% balls next volley' },
]

export function statsPanel(s: RunState, bestTurn: number): HTMLElement {
  return h(
    'div',
    { class: 'bs-side-block' },
    h('h3', { textContent: 'Run' }),
    h(
      'dl',
      { class: 'bs-stats-list' },
      ...runStats(s, bestTurn).flatMap(([k, v]) => [
        h('dt', { textContent: k }),
        h('dd', { textContent: v }),
      ]),
    ),
  )
}

export function boostsPanel(s: RunState): HTMLElement {
  const owned = (Object.keys(s.boosts) as BoostId[]).filter((id) => (s.boosts[id] ?? 0) > 0)
  return h(
    'div',
    { class: 'bs-side-block' },
    h('h3', { textContent: 'Boosts' }),
    owned.length
      ? h(
          'ul',
          { class: 'bs-boost-list' },
          ...owned.map((id) => {
            const b = BOOSTS[id]
            const art = h('span', { class: `bs-mini-icon ${b.rarity}` })
            art.innerHTML = BOOST_ICONS[id]
            return h(
              'li',
              { title: b.text },
              art,
              h('span', { class: 'bs-boost-name', textContent: b.name }),
              h('span', { class: 'bs-boost-count', textContent: `×${s.boosts[id]}` }),
            )
          }),
        )
      : h('p', { class: 'bs-side-empty', textContent: 'Level up to pick boosts.' }),
  )
}

/** Helper tray: buttons for owned mid-run helpers, usable while aiming. */
export function helpersPanel(
  helpers: Helpers,
  canUse: boolean,
  onUse: (id: ActiveHelper) => void,
): HTMLElement {
  const owned = ACTIVE_HELPERS.filter((a) => helpers[a.id] > 0)
  return h(
    'div',
    { class: 'bs-side-block' },
    h('h3', { textContent: 'Helpers' }),
    owned.length
      ? h(
          'div',
          { class: 'bs-helper-tray' },
          ...owned.map((a) => {
            const b = h(
              'button',
              {
                class: 'pf-btn bs-helper',
                type: 'button',
                disabled: !canUse,
                title: a.text,
                onclick: () => onUse(a.id),
              },
              h('span', { class: 'bs-helper-glyph', textContent: a.glyph }),
              h('span', { textContent: a.name }),
              h('span', { class: 'bs-boost-count', textContent: `×${helpers[a.id]}` }),
            )
            b.setAttribute('aria-label', `Use ${a.name} (${helpers[a.id]} left): ${a.text}`)
            return b
          }),
        )
      : h('p', {
          class: 'bs-side-empty',
          textContent: 'Buy helpers in the shop, then use them here while aiming.',
        }),
    (helpers.reroll > 0 || helpers.revive > 0) &&
      h('p', {
        class: 'bs-side-empty',
        textContent: `Tokens: ${helpers.reroll} reroll · ${helpers.revive} revive (used automatically)`,
      }),
  )
}

function sample(id: string): HTMLCanvasElement {
  const size = 48
  const canvas = h('canvas', { width: size * 2, height: size * 2 })
  canvas.style.width = canvas.style.height = `${size}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.scale(2, 2)
  const [group, kind] = id.split(':')
  if (group === 'brick') {
    const r = { x: 2, y: 2, w: size - 4, h: size - 4 }
    ctx.fillStyle = kind === 'gold' ? theme.yolk : '#b48cff'
    ctx.beginPath()
    ctx.roundRect(r.x, r.y, r.w, r.h, 8)
    ctx.fill()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    drawKindGlyph(ctx, kind as BrickKind, r, 0.3)
  } else if (group === 'pickup') {
    drawPickupGlyph(ctx, kind as PickupKind, size / 2, size / 2, 0.3)
  } else if (kind === 'fire') {
    ctx.fillStyle = '#ff9f43'
    ctx.globalAlpha = 0.45
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    drawBall(ctx, 'ball:flame', size / 2, size / 2, 9, 0, 0, -1)
  } else {
    ctx.fillStyle = '#2b1d00'
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = theme.coral
    ctx.beginPath()
    ctx.arc(size / 2 + 6, size / 2 - 6, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  return canvas
}

export function guidePanel(onBack: () => void): HTMLElement {
  const back = h('button', {
    class: 'pf-btn primary wide',
    type: 'button',
    textContent: 'Got it',
    onclick: onBack,
  })
  back.autofocus = true
  return h(
    'div',
    { class: 'pf-panel wide bs-shop' },
    h('h2', { class: 'pf-heading', textContent: 'Guide' }),
    h(
      'ul',
      { class: 'bs-guide' },
      ...GUIDE.map((g) =>
        h(
          'li',
          {},
          sample(g.id),
          h('div', {}, h('strong', { textContent: g.name }), h('span', { textContent: g.text })),
        ),
      ),
    ),
    back,
  )
}
