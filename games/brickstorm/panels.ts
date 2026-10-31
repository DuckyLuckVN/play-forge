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

/** Shop and Guide, at the top of the left panel. */
export function navPanel(onShop: () => void, onGuide: () => void): HTMLElement {
  return h(
    'div',
    { class: 'bs-side-nav' },
    h('button', { class: 'pf-btn primary', type: 'button', textContent: 'Shop', onclick: onShop }),
    h('button', { class: 'pf-btn', type: 'button', textContent: '? Guide', onclick: onGuide }),
  )
}

function infoButton(label: string, onInfo: () => void): HTMLButtonElement {
  const b = h('button', {
    class: 'bs-info',
    type: 'button',
    textContent: 'i',
    onclick: (e: MouseEvent) => {
      e.stopPropagation()
      onInfo()
    },
  })
  b.setAttribute('aria-label', `About ${label}`)
  return b
}

/** Owned boosts as tiles; tapping one (or its ⓘ) shows what it does. */
export function boostsPanel(s: RunState, onInfo: (id: BoostId) => void): HTMLElement {
  const owned = (Object.keys(s.boosts) as BoostId[]).filter((id) => (s.boosts[id] ?? 0) > 0)
  return h(
    'div',
    { class: 'bs-side-block' },
    h('h3', { textContent: `Boosts${owned.length ? ` · ${owned.length}` : ''}` }),
    owned.length
      ? h(
          'div',
          { class: 'bs-tiles' },
          ...owned.map((id) => {
            const b = BOOSTS[id]
            const art = h('span', { class: 'bs-tile-icon' })
            art.innerHTML = BOOST_ICONS[id]
            const tile = h(
              'button',
              { class: `bs-tile ${b.rarity}`, type: 'button', onclick: () => onInfo(id) },
              art,
              h('span', { class: 'bs-tile-name', textContent: b.name }),
              h('span', { class: 'bs-badge', textContent: `×${s.boosts[id]}` }),
              infoButton(b.name, () => onInfo(id)),
            )
            tile.setAttribute('aria-label', `${b.name} level ${s.boosts[id]}. Show details`)
            return tile
          }),
        )
      : h('p', { class: 'bs-side-empty', textContent: 'Level up to pick boosts.' }),
  )
}

/** Owned mid-run helpers as tiles: tap to use (with a confirm), ⓘ for details. */
export function helpersPanel(
  helpers: Helpers,
  canUse: boolean,
  onTap: (id: ActiveHelper) => void,
  onInfo: (id: ActiveHelper) => void,
): HTMLElement {
  const owned = ACTIVE_HELPERS.filter((a) => helpers[a.id] > 0)
  return h(
    'div',
    { class: 'bs-side-block' },
    h('h3', { textContent: 'Helpers' }),
    owned.length
      ? h(
          'div',
          { class: 'bs-tiles' },
          ...owned.map((a) => {
            const tile = h(
              'button',
              {
                class: `bs-tile helper${canUse ? '' : ' waiting'}`,
                type: 'button',
                onclick: () => (canUse ? onTap(a.id) : onInfo(a.id)),
              },
              h('span', { class: 'bs-tile-icon glyph', textContent: a.glyph }),
              h('span', { class: 'bs-tile-name', textContent: a.name }),
              h('span', { class: 'bs-badge', textContent: `×${helpers[a.id]}` }),
              infoButton(a.name, () => onInfo(a.id)),
            )
            tile.setAttribute('aria-label', `${canUse ? 'Use' : 'About'} ${a.name} (${helpers[a.id]} left)`)
            return tile
          }),
        )
      : h('p', {
          class: 'bs-side-empty',
          textContent: 'Buy helpers in the shop, then use them here while aiming.',
        }),
    owned.length > 0 &&
      !canUse &&
      h('p', { class: 'bs-side-empty', textContent: 'Helpers can be used while aiming.' }),
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
