// The shop screen: tabs of items with live previews, buy and equip buttons.
import { playSound } from '@forge/audio/sound'
import { h } from '@forge/ui/dom'
import { FONT, theme } from '@forge/ui/theme'
import { ArenaPainter, type ArenaId } from './arenas'
import { playMusic } from '@forge/audio/music'
import { coinAmount } from './coin'
import { trackFor } from './music'
import { drawBall, IMPACT_STYLE, TRAIL_STYLE } from './cosmetics'
import { t } from './i18n'
import { panelHead } from './panels'
import type { Save } from './save'
import { buy, CATALOG, equip, type ItemKind, type ShopItem } from './shop'
import { BRICK_SOUNDS } from './sounds'

const TABS: Array<[ItemKind, string]> = [
  ['ball', t('Balls')],
  ['trail', t('Trails')],
  ['arena', t('Arenas')],
  ['impact', t('Impacts')],
  ['music', t('Music')],
  ['helper', t('Helpers')],
]

const PREVIEW = 72
const HELPER_GLYPH: Record<string, string> = {
  'helper:headStart': '+5',
  'helper:luckyStart': '★',
  'helper:reroll': '↻',
  'helper:revive': '♥',
  'helper:pushBack': '⇡',
  'helper:rowBomb': '✸',
  'helper:freeze': '❄',
  'helper:firePack': '🔥',
  'helper:surge': '×1.5',
}

const arenaPainter = new ArenaPainter()

function drawArenaPreview(ctx: CanvasRenderingContext2D, arena: ArenaId, time: number): void {
  // The whole scene, laid out for a square, drawn at 3× and scaled down.
  const size = PREVIEW * 3
  ctx.save()
  ctx.scale(1 / 3, 1 / 3)
  arenaPainter.draw(ctx, arena, 1, false, time, { boardW: size, boardH: size, floorY: size * 0.88 })
  ctx.restore()
}

/** Arena previews on the open tab; they animate while the shop is open. */
let livePreviews: Array<{ ctx: CanvasRenderingContext2D; arena: ArenaId }> = []

let animating = false
/** The soundtrack being listened to in the shop, if any. */
let previewing: string | null = null

/** True while the shop plays a soundtrack preview (the game leaves the music alone). */
export function isPreviewingMusic(): boolean {
  return previewing !== null
}

function animatePreviews(panel: HTMLElement): void {
  if (animating) return
  animating = true
  const start = performance.now()
  const frame = (now: number) => {
    if (!panel.isConnected || !livePreviews.length) {
      animating = false
      return
    }
    for (const p of livePreviews) drawArenaPreview(p.ctx, p.arena, 4 + (now - start) / 1000)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

function preview(it: ShopItem): HTMLCanvasElement {
  const canvas = h('canvas', { width: PREVIEW * 2, height: PREVIEW * 2 })
  canvas.style.width = canvas.style.height = `${PREVIEW}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.scale(2, 2)
  ctx.fillStyle = theme.pit
  ctx.fillRect(0, 0, PREVIEW, PREVIEW)
  const c = PREVIEW / 2
  const key = it.id.split(':')[1]
  switch (it.kind) {
    case 'ball':
      drawBall(ctx, it.id, c, c, 14, 0.3, 1, -1)
      break
    case 'trail': {
      const style = TRAIL_STYLE[it.id]
      for (let k = style.len; k >= 1; k--) {
        const r = 10 * style.size * (1 - k / (style.len + 1))
        ctx.fillStyle = style.color(k, 0)
        ctx.globalAlpha = 0.7 * (1 - k / (style.len + 1))
        ctx.beginPath()
        ctx.arc(c - k * 4, c + k * 4, r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      drawBall(ctx, 'ball:classic', c, c, 9, 0)
      break
    }
    case 'arena':
      drawArenaPreview(ctx, key, 4)
      livePreviews.push({ ctx, arena: key })
      break
    case 'impact': {
      const style = IMPACT_STYLE[it.id]
      const colors = Array.isArray(style.color) ? style.color : [style.color ?? '#5ab8ff']
      const n = style.count ?? 10
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const d = 12 + (i % 3) * 7
        const s = style.size ?? 4
        ctx.fillStyle = colors[i % colors.length]
        if (style.shape === 'circle') {
          ctx.beginPath()
          ctx.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, s / 2 + 1, 0, Math.PI * 2)
          ctx.fill()
        } else ctx.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, s, s)
      }
      break
    }
    case 'music': {
      // An equaliser under a note, its own shape for each track.
      const seed = [...key].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7)
      const bars = Array.from({ length: 6 }, (_, i) => 6 + ((seed >> (i * 4)) % 22))
      bars.forEach((hgt, i) => {
        ctx.fillStyle = i % 2 ? '#b48cff' : '#5ab8ff'
        ctx.fillRect(10 + i * 9, PREVIEW - 12 - hgt, 6, hgt)
      })
      ctx.fillStyle = theme.yolk
      ctx.font = `700 26px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('♪', c, c - 10)
      break
    }
    case 'helper':
      ctx.fillStyle = theme.yolk
      ctx.font = `700 30px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(HELPER_GLYPH[it.id] ?? '?', c, c + 2)
      break
  }
  return canvas
}

/**
 * Builds the shop panel. `getSave`/`setSave` read and persist the wallet;
 * the panel re-renders itself after every purchase.
 */
export function shopPanel(getSave: () => Save, setSave: (s: Save) => void, onBack: () => void): HTMLElement {
  let tab: ItemKind = 'ball'
  const panel = h('div', { class: 'pf-panel wide bs-shop' })

  const render = () => {
    const save = getSave()
    const tabs = h(
      'div',
      { class: 'bs-tabs', role: 'tablist' } as never,
      ...TABS.map(([kind, label]) => {
        const b = h('button', {
          class: `pf-btn quiet bs-tab${kind === tab ? ' active' : ''}`,
          type: 'button',
          textContent: label,
          onclick: () => {
            tab = kind
            render()
            animatePreviews(panel)
          },
        })
        b.setAttribute('role', 'tab')
        b.setAttribute('aria-selected', String(kind === tab))
        return b
      }),
    )
    livePreviews = []
    const items = CATALOG.filter((i) => i.kind === tab).map((it) => {
      const owned = it.kind !== 'helper' && save.owned.includes(it.id)
      const equipped = it.kind !== 'helper' && save.equipped[it.kind] === it.id
      let action: HTMLButtonElement
      if (equipped) {
        action = h('button', {
          class: 'pf-btn quiet',
          type: 'button',
          textContent: t('Equipped'),
          disabled: true,
        })
      } else if (owned) {
        action = h('button', {
          class: 'pf-btn',
          type: 'button',
          textContent: t('Equip'),
          onclick: () => {
            setSave(equip(getSave(), it.id))
            render()
          },
        })
      } else {
        action = h('button', {
          class: 'pf-btn primary',
          type: 'button',
          disabled: save.coins < it.price,
          onclick: () => {
            const res = buy(getSave(), it.id)
            if (res.result !== 'ok') return
            let next = res.save
            if (it.kind !== 'helper') next = equip(next, it.id)
            setSave(next)
            playSound(BRICK_SOUNDS.buy)
            render()
          },
        })
        action.append(coinAmount(it.price))
        action.setAttribute(
          'aria-label',
          t('Buy {name} for {price} coins', { name: t(it.name), price: it.price }),
        )
      }
      const listen =
        it.kind === 'music' &&
        h('button', {
          class: 'pf-btn quiet bs-listen',
          type: 'button',
          textContent: previewing === it.id ? t('♪ Playing') : t('▶ Listen'),
          onclick: () => {
            previewing = it.id
            playMusic(trackFor(it.id))
            render()
          },
        })
      return h(
        'div',
        { class: 'bs-item' },
        preview(it),
        listen,
        h('strong', { textContent: t(it.name) }),
        it.text && h('span', { class: 'bs-item-text', textContent: t(it.text) }),
        it.helper &&
          h('span', { class: 'bs-item-text', textContent: t('Owned: {n}', { n: save.helpers[it.helper] }) }),
        action,
      )
    })
    panel.replaceChildren(
      panelHead(
        t('Shop'),
        () => {
          previewing = null
          onBack()
        },
        coinAmount(save.coins, 'bs-wallet'),
      ),
      tabs,
      h('div', { class: 'bs-items' }, ...items),
    )
  }
  render()
  animatePreviews(panel)
  return panel
}
