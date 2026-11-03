// The boss card: a live preview of the boss, what its skills do, and a button
// to start the fight. It waits for the player to close it.
import { h } from '@forge/ui/dom'
import { drawBoss } from './boss-art'
import { bossName, skillInfo } from './boss-skill-ui'
import { t } from './i18n'
import { panelHead } from './panels'
import { bodyBricks, shapeOf, shapeSize } from './sim/boss-shapes'
import { CELL, TOP } from './sim/config'
import type { Boss } from './sim/types'

export { bossName } from './boss-skill-ui'

/** Room around the previewed body for its aura. */
const PREVIEW_PAD = 22

/** A canvas that keeps drawing `boss` for as long as it is on the page. */
function bossPreview(boss: Boss): HTMLCanvasElement {
  const shape = shapeOf(boss.shape)
  const size = shapeSize(shape)
  const w = size.w * CELL + PREVIEW_PAD * 2
  const hgt = size.h * CELL + PREVIEW_PAD * 2
  const canvas = h('canvas', { class: 'bs-boss-preview', width: w * 2, height: hgt * 2 })
  canvas.style.width = `${w}px`
  canvas.style.height = `${hgt}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const parts = bodyBricks(boss.shape, 0, boss.hp, boss.maxHp)
  const start = performance.now()
  const frame = (now: number) => {
    ctx.setTransform(2, 0, 0, 2, 0, 0)
    ctx.clearRect(0, 0, w, hgt)
    ctx.translate(PREVIEW_PAD, PREVIEW_PAD - TOP)
    drawBoss(ctx, { boss, bricks: parts }, (now - start) / 1000, { hit: 0 })
    if (canvas.isConnected || now - start < 500) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  return canvas
}

/** The card that introduces a boss (or, `again`, recalls it mid-fight): it waits for the player to close it. */
export function bossIntro(boss: Boss, onClose: () => void, again = false): HTMLElement {
  // Reopened mid-fight (from the HUD chip or a long press on the boss): back to it.
  const label = again ? t('Back to the fight') : t('Fight!')
  const fight = h('button', { class: 'pf-btn primary wide', type: 'button', onclick: onClose }, label)
  fight.autofocus = true
  return h(
    'div',
    { class: 'pf-panel bs-boss-intro' },
    panelHead(t('Boss: {name}', { name: bossName(boss) }), onClose),
    bossPreview(boss),
    h('p', {
      class: 'pf-lede',
      textContent: t(
        'No new rows until it falls. Hit any part to drain its health before it reaches the line.',
      ),
    }),
    h(
      'ul',
      { class: 'bs-boss-skills' },
      ...boss.traits.map((k) =>
        h(
          'li',
          {},
          h('span', { class: 'bs-boss-chip', style: `background:${skillInfo(k).color}` }),
          h('span', { textContent: skillInfo(k).text }),
        ),
      ),
    ),
    fight,
  )
}
