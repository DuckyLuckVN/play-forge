import type { ReactionHub } from './reactions'

type Draw = (playerId: string, reactionId: string) => boolean

/**
 * Lets a game use the room's reaction channel: send through the hub, and draw
 * incoming reactions in its own view. The shell attaches the hub (online
 * rooms only) and detaches it when the room closes.
 */
export class ReactionBridge {
  private hub: ReactionHub | null = null
  private activeFns = new Set<(active: boolean) => void>()
  private drawers = new Set<Draw>()

  /** A hub is attached (an online room). */
  get active(): boolean {
    return !!this.hub
  }

  attach(hub: ReactionHub | null): void {
    const was = this.active
    this.hub = hub
    if (was !== this.active) for (const fn of [...this.activeFns]) fn(this.active)
  }

  /** False when offline, unknown or rate-limited. */
  send(id: string): boolean {
    return this.hub?.send(id) ?? false
  }

  onActive(fn: (active: boolean) => void): () => void {
    this.activeFns.add(fn)
    return () => this.activeFns.delete(fn)
  }

  /** The game draws reactions itself; return true when it drew one. */
  draw(fn: Draw): () => void {
    this.drawers.add(fn)
    return () => this.drawers.delete(fn)
  }

  /** True if any game drawer drew this reaction (the shell then plays sound only). */
  claim(playerId: string, reactionId: string): boolean {
    let drew = false
    for (const fn of [...this.drawers]) if (fn(playerId, reactionId)) drew = true
    return drew
  }
}
