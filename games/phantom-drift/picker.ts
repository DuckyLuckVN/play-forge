import { formatNumber } from '@forge/core/i18n'
// The character picker on the start screen: a card per ghost with a live
// mini preview, its name and perk. Locked ones show the best score they need.
import { h } from '@forge/ui/dom'
import { prefersReducedMotion } from '@forge/fx/tween'
import { CHARACTERS, isUnlocked, type Character } from './characters'
import { drawGhost2D, RESTING, type GhostPose } from './ghost2d'
import { bob, Blinker } from './ghost-motion'
import { t } from './i18n'

const W = 64
const H = 82

export interface PickerOptions {
  best: number
  selected: Character
  onPick(c: Character): void
}

export function characterPicker(opts: PickerOptions): HTMLElement {
  let selected = opts.selected
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1)
  const previews: { c: Character; ctx: CanvasRenderingContext2D; blink: Blinker }[] = []

  const cards = CHARACTERS.map((c, i) => {
    const open = isUnlocked(c, opts.best)
    const canvas = h('canvas', { class: 'pd-char-art', width: W * dpr, height: H * dpr })
    canvas.setAttribute('aria-hidden', 'true')
    const ctx = canvas.getContext('2d')
    if (ctx) previews.push({ c, ctx, blink: new Blinker(i * 7 + 3) })
    const card = h(
      'button',
      {
        type: 'button',
        class: 'pd-char',
        style: `--pd-rim:${c.colors.rim}`,
        onclick: () => {
          if (!open) return
          selected = c
          sync()
          opts.onPick(c)
        },
      },
      canvas,
      h('span', { class: 'pd-char-name', textContent: t(c.name) }),
      h('span', {
        class: 'pd-char-perk',
        textContent: open ? t(c.perk) : t('Best {n} to unlock', { n: formatNumber(c.unlock) }),
      }),
    )
    card.classList.toggle('locked', !open)
    if (!open) card.setAttribute('aria-disabled', 'true')
    return { c, card }
  })

  function sync() {
    for (const { c, card } of cards) {
      const on = c.id === selected.id
      card.classList.toggle('active', on)
      card.setAttribute('aria-pressed', String(on))
    }
  }
  sync()

  const root = h(
    'section',
    { class: 'pd-chars' },
    h('h3', { class: 'pd-chars-title', textContent: t('Choose your ghost') }),
    h('div', { class: 'pd-chars-grid' }, ...cards.map((x) => x.card)),
  )
  root.setAttribute('aria-label', t('Choose your ghost'))

  // Previews: one loop for all cards, until the menu goes away.
  const still = prefersReducedMotion()
  let last = performance.now()
  let time = 0
  let seen = false
  const draw = (dt: number) => {
    for (const p of previews) {
      const active = p.c.id === selected.id
      const b = bob(time + p.c.unlock * 0.001, still ? 0 : active ? 1.4 : 0.8)
      const pose: GhostPose = still
        ? RESTING
        : {
            time,
            tilt: Math.sin(time * 1.6 + p.c.unlock) * (active ? 0.12 : 0.05),
            eyes: p.blink.update(dt),
            look: Math.sin(time * 0.9 + p.c.unlock),
            sx: b.sx,
            sy: b.sy,
            glow: 0,
          }
      const ctx = p.ctx
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      drawGhost2D(ctx, W / 2, H - 6 + b.y * 30, p.c, pose, 0.95)
    }
  }
  const frame = (now: number) => {
    if (root.isConnected) seen = true
    else if (seen) return
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    time += dt
    draw(dt)
    requestAnimationFrame(frame)
  }
  if (still) draw(0)
  else requestAnimationFrame(frame)
  return root
}
