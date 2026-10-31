type Handler<Args extends unknown[]> = (...args: Args) => void

/** Minimal typed event emitter. `on` returns an unsubscribe function. */
export class Emitter<Events extends { [K in keyof Events]: unknown[] }> {
  private handlers = new Map<keyof Events, Set<Handler<any>>>()

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event)
    if (!set) this.handlers.set(event, (set = new Set()))
    set.add(handler)
    return () => set.delete(handler)
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    this.handlers.get(event)?.forEach((h) => h(...args))
  }

  clear(): void {
    this.handlers.clear()
  }
}
