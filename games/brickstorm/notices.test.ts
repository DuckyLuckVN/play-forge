import { describe, expect, it } from 'vitest'
import { NoticeQueue, noticeDuration } from './notices'

const n = (id: string, text = 'Short text.') => ({ id, title: id, text })

describe('notices', () => {
  it('stays longer for longer text, within 5 to 10 seconds', () => {
    expect(noticeDuration('Hi.')).toBe(5)
    expect(noticeDuration('word '.repeat(12))).toBeGreaterThan(5)
    expect(noticeDuration('word '.repeat(200))).toBe(10)
  })

  it('shows one notice at a time, in order', () => {
    const q = new NoticeQueue()
    q.push(n('a'))
    q.push(n('b'))
    expect(q.current?.id).toBe('a')
    q.update(4.9)
    expect(q.current?.id).toBe('a')
    q.update(0.2)
    expect(q.current?.id).toBe('b')
    q.update(5.1)
    expect(q.current).toBeNull()
  })

  it('skips to the next notice when dismissed', () => {
    const q = new NoticeQueue()
    q.push(n('a'))
    q.push(n('b'))
    q.dismiss()
    expect(q.current?.id).toBe('b')
    expect(q.age).toBe(0)
  })

  it('reports how far through the current notice is', () => {
    const q = new NoticeQueue()
    q.push(n('a'))
    q.update(2.5)
    expect(q.progress).toBeCloseTo(0.5)
  })
})
