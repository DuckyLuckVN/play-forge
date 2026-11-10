import { fitCenter, pickSlot, slotOffset, type Point } from '../ui/radial'
import { h, setLabel } from '../ui/dom'
import { guardGameKeys, isTyping } from '../ui/key-guard'
import { t } from './i18n'
import { reactionEl } from './reaction-ui'
import { WHEEL_REACTIONS, reactionDef } from './reactions'

export interface ReactionWheelOptions {
  host: HTMLElement
  /** Returns false when rate-limited. */
  send(id: string): boolean
  ids?: readonly string[]
  holdKey?: string
}

export interface ReactionWheel {
  readonly button: HTMLButtonElement
  readonly isOpen: boolean
  setEnabled(on: boolean): void
  destroy(): void
}

const DEAD_ZONE = 28
const MARGIN = 8

/** Radial emoji wheel: hold a key (PC) or tap the button (phone), point at a slot, release to send. */
export function reactionWheel(opts: ReactionWheelOptions): ReactionWheel {
  const { host, send } = opts
  const ids = opts.ids ?? WHEEL_REACTIONS
  const holdKey = opts.holdKey ?? 'KeyT'

  const button = h('button', { class: 'pf-rxw-btn', type: 'button' }, reactionEl('laugh'))
  setLabel(button, t('Reactions (hold T)'))
  button.hidden = true

  const slots = ids.map((id) => {
    const b = h('button', { class: 'pf-rxw-slot', type: 'button' }, reactionEl(id))
    b.dataset.rx = id
    b.setAttribute('aria-label', t(reactionDef(id)?.name ?? id))
    return b
  })
  const center = h('button', { class: 'pf-rxw-center', type: 'button' })
  center.setAttribute('aria-label', t('Close reactions'))
  const ring = h('div', { class: 'pf-rxw-ring' }, ...slots, center)
  slots.forEach((b, i) => {
    const o = slotOffset(i, ids.length, 1)
    b.style.setProperty('--ox', String(o.x))
    b.style.setProperty('--oy', String(o.y))
  })
  const overlay = h('div', { class: 'pf-rxw' }, ring)
  overlay.setAttribute('role', 'group')
  overlay.setAttribute('aria-label', t('Reaction wheel'))
  overlay.hidden = true
  host.append(button, overlay)

  let enabled = false
  let open = false
  let picked = -1
  let centre: Point = { x: 0, y: 0 }
  let lastPointer: Point | null = null
  let unguard: (() => void) | null = null

  const rel = (e: MouseEvent): Point | null => {
    if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return null
    const r = host.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const reach = () => {
    // Mirrors the CSS vars: ring radius + half a slot + margin.
    const cs = getComputedStyle(ring)
    const r = parseFloat(cs.getPropertyValue('--r')) || 84
    const s = parseFloat(cs.getPropertyValue('--slot')) || 52
    return { r, reach: r + s / 2 + MARGIN }
  }
  const highlight = (i: number) => {
    picked = i
    slots.forEach((b, j) => b.classList.toggle('on', j === i))
  }
  const openAt = (p: Point | null) => {
    if (open) return
    const rect = host.getBoundingClientRect()
    const box = { w: rect.width, h: rect.height }
    const { r, reach: rc } = reach()
    centre = fitCenter(p ?? { x: box.w / 2, y: box.h / 2 }, box, rc)
    ring.style.left = `${centre.x}px`
    ring.style.top = `${centre.y}px`
    slots.forEach((b, i) => {
      const o = slotOffset(i, ids.length, r)
      b.style.setProperty('--ox', `${o.x}px`)
      b.style.setProperty('--oy', `${o.y}px`)
    })
    highlight(-1)
    overlay.hidden = false
    open = true
    unguard = guardGameKeys({ pass: ['KeyV'] })
  }
  const close = () => {
    if (!open) return
    open = false
    overlay.hidden = true
    highlight(-1)
    unguard?.()
    unguard = null
  }
  const fire = (id: string) => {
    close()
    if (send(id)) return
    button.classList.remove('nope')
    void button.offsetWidth
    button.classList.add('nope')
    button.title = t('Slow down a little')
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return close()
    if (e.code !== holdKey || e.repeat || !enabled || open || isTyping(e.target)) return
    e.preventDefault()
    openAt(lastPointer)
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (!open || e.code !== holdKey) return
    const id = picked >= 0 ? ids[picked] : null
    if (id) fire(id)
    else close()
  }
  const onHostMove = (e: PointerEvent) => {
    lastPointer = rel(e) ?? lastPointer
  }
  const onOverlayMove = (e: MouseEvent) => {
    const p = rel(e)
    if (p) highlight(pickSlot(p.x - centre.x, p.y - centre.y, ids.length, DEAD_ZONE))
  }
  const swallow = (e: Event) => e.stopPropagation()
  const onOverlayDown = (e: Event) => {
    e.stopPropagation()
    const slot = (e.target as HTMLElement).closest<HTMLElement>('.pf-rxw-slot')
    if (slot?.dataset.rx) fire(slot.dataset.rx)
    else close()
  }
  const onBlur = () => close()
  const onButton = () => (open ? close() : openAt(null))

  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp, true)
  window.addEventListener('blur', onBlur)
  host.addEventListener('pointermove', onHostMove, { passive: true })
  overlay.addEventListener('pointermove', onOverlayMove)
  overlay.addEventListener('pointerdown', onOverlayDown)
  overlay.addEventListener('contextmenu', swallow)
  button.addEventListener('click', onButton)
  button.addEventListener('animationend', (e) => {
    if (e.target !== button) return
    button.classList.remove('nope')
    button.title = t('Reactions (hold T)')
  })

  return {
    button,
    get isOpen() {
      return open
    },
    setEnabled(on) {
      enabled = on
      button.hidden = !on
      if (!on) close()
    },
    destroy() {
      close()
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
      host.removeEventListener('pointermove', onHostMove)
      button.remove()
      overlay.remove()
    },
  }
}
