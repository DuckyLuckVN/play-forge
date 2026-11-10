// Reaction bubbles over the chibis (emoji slice): one pooled DOM bubble per player, drawn in the 3D view's overlay.
// Pure maths (anchor, projection, opacity) + the pool; render3d.ts feeds it each frame. Cosmetic only: a bubble
// dims while it covers the shuttle and fades with its chibi, so it never hides a play.
import { reactionDef } from '@forge/social/reactions'
import { reactionEl } from '@forge/social/reaction-ui'

export const BUBBLE = { life: 1.8, gap: 0.28, size: 48, edge: 28, cover: 0.35, fadeFloor: 0.5, out: 0.3 }

export interface ScreenPoint {
  x: number
  y: number
  on: boolean
}

/** World Y the bubble hangs at: the head top on the jump arc (lift, k = root scale) plus a gap. */
export function headAnchorY(rootY: number, lift: number, top: number, k: number): number {
  return rootY + (lift + top) * k + BUBBLE.gap
}

/** NDC + camera depth -> px for the bubble's bottom-centre; clamped to stay inside the view. */
export function toScreen(ndc: { x: number; y: number }, depth: number, w: number, h: number): ScreenPoint {
  const x = ((ndc.x + 1) / 2) * w
  const y = ((1 - ndc.y) / 2) * h
  return {
    x: Math.min(Math.max(x, BUBBLE.edge), w - BUBBLE.edge),
    y: Math.min(Math.max(y, BUBBLE.size), h - BUBBLE.edge),
    on: depth > 0,
  }
}

export function bubbleOpacity(age: number, fade: number, coversShuttle: boolean): number {
  if (age >= BUBBLE.life) return 0
  const out = Math.min(1, (BUBBLE.life - age) / BUBBLE.out)
  return out * Math.max(fade, BUBBLE.fadeFloor) * (coversShuttle ? BUBBLE.cover : 1)
}

interface Slot {
  el: HTMLElement
  since: number
  live: boolean
}

export class ReactionBubbles {
  readonly root: HTMLElement
  private slots: Slot[] = []

  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'sp-bubbles'
    this.root.setAttribute('aria-hidden', 'true')
  }

  private slot(i: number): Slot {
    while (this.slots.length <= i) {
      const el = document.createElement('div')
      el.className = 'sp-bubble'
      el.hidden = true
      this.root.appendChild(el)
      this.slots.push({ el, since: 0, live: false })
    }
    return this.slots[i]
  }

  /** Starts (or replaces) slot's bubble. False for an unknown id: nothing is drawn. */
  show(slot: number, reactionId: string, now: number): boolean {
    const def = reactionDef(reactionId)
    if (!def) return false
    const s = this.slot(slot)
    const disc = document.createElement('span')
    disc.className = 'sp-bubble-disc'
    disc.appendChild(reactionEl(reactionId, `pf-rx-art ${def.motion}`))
    s.el.replaceChildren(disc)
    s.since = now
    s.live = true
    s.el.style.opacity = '0'
    s.el.hidden = false
    return true
  }

  live(slot: number): boolean {
    return this.slots[slot]?.live ?? false
  }

  /** Per frame for a live slot. `at` null / off-screen hides it (still counts down). No layout reads. */
  place(
    slot: number,
    now: number,
    at: ScreenPoint | null,
    fade: number,
    shuttle: { x: number; y: number } | null,
  ) {
    const s = this.slots[slot]
    if (!s || !s.live) return
    const age = now - s.since
    if (age >= BUBBLE.life) {
      s.live = false
      s.el.hidden = true
      return
    }
    if (!at || !at.on) {
      s.el.hidden = true
      return
    }
    const half = BUBBLE.size / 2
    const covers =
      shuttle !== null &&
      shuttle.x >= at.x - half &&
      shuttle.x <= at.x + half &&
      shuttle.y >= at.y - BUBBLE.size &&
      shuttle.y <= at.y
    s.el.hidden = false
    s.el.style.opacity = String(bubbleOpacity(age, fade, covers))
    s.el.style.transform = `translate(${(at.x - half).toFixed(1)}px, ${(at.y - BUBBLE.size).toFixed(1)}px)`
  }

  reset() {
    for (const s of this.slots) {
      s.live = false
      s.el.hidden = true
    }
  }
}
