import type { Moment } from './moments'
import type { DriftState } from './sim'

/** What `main.ts` needs from a renderer, 3D or the 2D fallback. */
export interface DriftView {
  onState(state: DriftState): void
  frame(dt: number): void
  /** Show a big celebratory message. */
  banner(moment: Moment): void
  /** Element that receives pointer input. */
  surface: HTMLElement
  /** A pointer position in HUD space, with the HUD size (for tap targets). */
  hudPoint(clientX: number, clientY: number): { x: number; y: number; w: number; h: number }
  destroy(): void
}
