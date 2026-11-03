import { describe, expect, it } from 'vitest'
import { KeyedPool } from './pool'

describe('KeyedPool', () => {
  const make = () => {
    const log: string[] = []
    let made = 0
    const pool = new KeyedPool<{ id: number; kind: string }, { n: number; kind: string }>({
      kind: (item) => item.kind,
      create: (kind) => {
        log.push(`create ${kind}`)
        return { n: made++, kind }
      },
      show: (view, on) => log.push(`${on ? 'show' : 'hide'} ${view.n}`),
    })
    return { pool, log }
  }

  it('creates views for new items and reuses hidden ones of the same kind', () => {
    const { pool, log } = make()
    const a = pool.sync([{ id: 1, kind: 'shard' }], (i) => i.id)
    expect(a.get(1)).toEqual({ n: 0, kind: 'shard' })
    pool.sync([], (i) => i.id)
    expect(log).toEqual(['create shard', 'show 0', 'hide 0'])
    const b = pool.sync([{ id: 2, kind: 'shard' }], (i) => i.id)
    expect(b.get(2)).toEqual({ n: 0, kind: 'shard' }) // recycled
    expect(log.filter((l) => l.startsWith('create'))).toHaveLength(1)
  })

  it('keeps the same view for the same key and never mixes kinds', () => {
    const { pool } = make()
    const first = pool.sync([{ id: 1, kind: 'shard' }], (i) => i.id).get(1)
    const again = pool.sync([{ id: 1, kind: 'shard' }], (i) => i.id).get(1)
    expect(again).toBe(first)
    pool.sync([], (i) => i.id)
    const wisp = pool.sync([{ id: 3, kind: 'wisp' }], (i) => i.id).get(3)
    expect(wisp?.kind).toBe('wisp')
    expect(pool.size).toBe(2)
  })

  it('clear hides everything', () => {
    const { pool, log } = make()
    pool.sync(
      [
        { id: 1, kind: 'a' },
        { id: 2, kind: 'a' },
      ],
      (i) => i.id,
    )
    pool.clear()
    expect(log.filter((l) => l.startsWith('hide'))).toHaveLength(2)
    expect(pool.sync([], (i) => i.id).size).toBe(0)
  })
})
