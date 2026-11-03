/**
 * Keeps one view (a mesh, a group…) per live simulation item, recycling views
 * of items that are gone instead of creating and disposing every frame.
 * Renderer-agnostic, so it is unit-testable without WebGL.
 */
export interface PoolOptions<T, V> {
  /** Views are only reused for items of the same kind. */
  kind(item: T): string
  create(kind: string): V
  show(view: V, visible: boolean): void
}

export class KeyedPool<T, V> {
  private live = new Map<string | number, { view: V; kind: string }>()
  private free = new Map<string, V[]>()
  private made = 0

  constructor(private opts: PoolOptions<T, V>) {}

  /** Views created so far (live + free). */
  get size(): number {
    return this.made
  }

  /** Matches views to `items`; returns key → view for the items given. */
  sync(items: Iterable<T>, key: (item: T) => string | number): Map<string | number, V> {
    const out = new Map<string | number, V>()
    for (const item of items) {
      const k = key(item)
      const kind = this.opts.kind(item)
      let entry = this.live.get(k)
      if (entry && entry.kind !== kind) {
        this.release(k, entry)
        entry = undefined
      }
      if (!entry) {
        const view = this.free.get(kind)?.pop() ?? this.create(kind)
        this.opts.show(view, true)
        entry = { view, kind }
        this.live.set(k, entry)
      }
      out.set(k, entry.view)
    }
    for (const [k, entry] of this.live) if (!out.has(k)) this.release(k, entry)
    return out
  }

  clear(): void {
    for (const [k, entry] of this.live) this.release(k, entry)
  }

  private create(kind: string): V {
    this.made++
    return this.opts.create(kind)
  }

  private release(k: string | number, entry: { view: V; kind: string }) {
    this.live.delete(k)
    this.opts.show(entry.view, false)
    const list = this.free.get(entry.kind) ?? []
    list.push(entry.view)
    this.free.set(entry.kind, list)
  }
}
