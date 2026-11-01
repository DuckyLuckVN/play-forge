// Side panels (run stats, boosts, helper tray) and the Guide screen.
import { h } from '@forge/ui/dom'
import { theme } from '@forge/ui/theme'
import { drawBall } from './cosmetics'
import { GUIDE, runStats } from './guide'
import { t } from './i18n'
import { BOOST_ICONS } from './icons'
import { drawKindGlyph, drawPickupGlyph } from './render'
import type { Helpers } from './save'
import { BOOSTS, boostSlots, slottedBoosts } from './sim/boosts'
import type { ActiveHelper, BoostId, BrickKind, PickupKind, RunState } from './sim/types'

export const ACTIVE_HELPERS: Array<{ id: ActiveHelper; name: string; glyph: string; text: string }> = [
  { id: 'pushBack', name: 'Push Back', glyph: '⇡', text: 'Lift every brick up a row' },
  { id: 'rowBomb', name: 'Row Bomb', glyph: '✸', text: 'Destroy the lowest row' },
  { id: 'freeze', name: 'Freeze', glyph: '❄', text: "Bricks don't drop after your next volley" },
  { id: 'firePack', name: 'Fire Pack', glyph: '🔥', text: 'Next volley starts with 5 fireballs' },
  { id: 'surge', name: 'Ball Surge', glyph: '×1.5', text: '+50% balls next volley' },
  { id: 'megaBomb', name: 'Mega Bomb', glyph: '☢', text: 'Halve the health of every brick' },
  { id: 'colBomb', name: 'Column Bomb', glyph: '⇣', text: 'Destroy the fullest column' },
  { id: 'laserGrid', name: 'Laser Grid', glyph: '≡', text: 'Lasers across the 3 lowest rows' },
  { id: 'midasTouch', name: 'Midas Touch', glyph: '♛', text: 'Turn 4 bricks into gold' },
  { id: 'ballRain', name: 'Ball Rain', glyph: '+10', text: '+10 balls next volley' },
  { id: 'overcharge', name: 'Overcharge', glyph: '⚡', text: '×2 damage next volley' },
  { id: 'vacuum', name: 'Vacuum', glyph: '◎', text: 'Collect every pickup on the board' },
  { id: 'pierceShot', name: 'Pierce Shot', glyph: '➹', text: 'Balls pierce 2 bricks next volley' },
]

export function statsPanel(s: RunState, bestTurn: number): HTMLElement {
  return h(
    'div',
    { class: 'bs-side-block' },
    h('h3', { textContent: t('Run') }),
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
  const shop = h(
    'button',
    { class: 'pf-btn primary bs-shop-btn', type: 'button', onclick: onShop },
    h('span', { textContent: t('Shop') }),
  )
  return h(
    'div',
    { class: 'bs-side-nav' },
    shop,
    h('button', { class: 'pf-btn', type: 'button', textContent: t('? Guide'), onclick: onGuide }),
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
  b.setAttribute('aria-label', t('About {name}', { name: label }))
  return b
}

/**
 * Owned skills as tiles, then an empty socket for each free slot. Bonus
 * skills (+2 balls, Double Down) take no slot, so they aren't listed; a
 * running Double Down shows as an active effect. Tapping a skill (or its ⓘ)
 * shows what it does.
 */
export function boostsPanel(s: RunState, onInfo: (id: BoostId) => void): HTMLElement {
  const slotted = slottedBoosts(s.boosts)
  const free = Math.max(0, boostSlots(s) - slotted.length)
  const sockets = Array.from({ length: free }, () => {
    const socket = h(
      'div',
      { class: 'bs-tile bs-socket' },
      h('span', { class: 'bs-socket-ring' }),
      h('span', { class: 'bs-tile-name', textContent: t('Empty slot') }),
    )
    socket.setAttribute('aria-label', t('Empty skill slot'))
    return socket
  })
  return h(
    'div',
    { class: 'bs-side-block' },
    h('h3', { textContent: t('Skills') }),
    h('div', { class: 'bs-tiles' }, ...slotted.map((id) => boostTile(s, id, onInfo)), ...sockets),
    !slotted.length && h('p', { class: 'bs-side-empty', textContent: t('Level up to pick skills.') }),
    s.doubleVolleys > 0 &&
      h('p', {
        class: 'bs-active-effect',
        textContent: t('Double Down: {n} shots left', { n: s.doubleVolleys }),
      }),
  )
}

function boostTile(s: RunState, id: BoostId, onInfo: (id: BoostId) => void): HTMLElement {
  const b = BOOSTS[id]
  const name = t(b.name)
  const art = h('span', { class: 'bs-tile-icon' })
  art.innerHTML = BOOST_ICONS[id]
  const tile = h(
    'button',
    { class: `bs-tile ${b.rarity}`, type: 'button', onclick: () => onInfo(id) },
    art,
    h('span', { class: 'bs-tile-name', textContent: name }),
    h('span', { class: 'bs-badge', textContent: `×${s.boosts[id]}` }),
    infoButton(name, () => onInfo(id)),
  )
  tile.setAttribute('aria-label', t('{name} level {n}. Show details', { name, n: s.boosts[id] ?? 0 }))
  return tile
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
    h('h3', { textContent: t('Helpers') }),
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
              h('span', { class: 'bs-tile-name', textContent: t(a.name) }),
              h('span', { class: 'bs-badge', textContent: `×${helpers[a.id]}` }),
              infoButton(t(a.name), () => onInfo(a.id)),
            )
            tile.setAttribute(
              'aria-label',
              canUse
                ? t('Use {name} ({n} left)', { name: t(a.name), n: helpers[a.id] })
                : t('About {name} ({n} left)', { name: t(a.name), n: helpers[a.id] }),
            )
            return tile
          }),
        )
      : h('p', {
          class: 'bs-side-empty',
          textContent: t('Buy helpers in the shop, then use them here while aiming.'),
        }),
    owned.length > 0 &&
      !canUse &&
      h('p', { class: 'bs-side-empty', textContent: t('Helpers can be used while aiming.') }),
    (helpers.reroll > 0 || helpers.revive > 0) &&
      h('p', {
        class: 'bs-side-empty',
        textContent: t('Tokens: {reroll} reroll · {revive} revive (used automatically)', {
          reroll: helpers.reroll,
          revive: helpers.revive,
        }),
      }),
  )
}

/** A small picture of a Guide entry (brick, pickup or special ball). */
export function sample(id: string): HTMLCanvasElement {
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

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'

/** The ✕ in a menu's top-right corner. */
export function closeButton(onClose: () => void): HTMLButtonElement {
  const b = h('button', { class: 'pf-btn icon bs-close', type: 'button', onclick: onClose })
  b.innerHTML = CLOSE_ICON
  b.title = t('Close')
  b.setAttribute('aria-label', t('Close'))
  return b
}

/** A menu's title row: heading, anything extra (wallet, icon), then the ✕. */
export function panelHead(
  title: string,
  onClose: () => void,
  ...extra: Array<Node | null | false>
): HTMLElement {
  return h(
    'div',
    { class: 'bs-shop-head bs-panel-head' },
    h('h2', { class: 'pf-heading', textContent: title }),
    ...extra.filter((x): x is Node => !!x),
    closeButton(onClose),
  )
}

export function guidePanel(onBack: () => void): HTMLElement {
  return h(
    'div',
    { class: 'pf-panel wide bs-shop' },
    panelHead(t('Guide'), onBack),
    h(
      'ul',
      { class: 'bs-guide' },
      ...GUIDE.map((g) =>
        h(
          'li',
          {},
          sample(g.id),
          h('div', {}, h('strong', { textContent: t(g.name) }), h('span', { textContent: t(g.text) })),
        ),
      ),
    ),
  )
}
