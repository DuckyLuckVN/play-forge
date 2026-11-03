import { afterEach, describe, expect, it } from 'vitest'
import { createBroadcastTransport } from '../net/broadcast'
import type { Transport } from '../net/transport'
import {
  CHAT_HISTORY_SHARED,
  CHAT_MAX_LENGTH,
  CHAT_RECEIVE_LIMIT,
  CHAT_SEND_LIMIT,
  ChatHub,
  cleanText,
  type ChatMessage,
} from './chat'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('cleanText', () => {
  it('trims, collapses control characters and caps the length', () => {
    expect(cleanText('  hi  ')).toBe('hi')
    expect(cleanText('a\u0000b\u0007c\nd')).toBe('a b c d')
    expect(cleanText('x'.repeat(500))).toHaveLength(CHAT_MAX_LENGTH)
    expect(cleanText(42)).toBe('')
    expect(cleanText('   ')).toBe('')
  })
})

describe('ChatHub', () => {
  const hubs: ChatHub[] = []
  const transports: Transport[] = []
  afterEach(() => {
    hubs.splice(0).forEach((h) => h.dispose())
    transports.splice(0).forEach((t) => t.leave())
  })

  const room = () => Math.random().toString(36).slice(2)
  const connect = (r: string) => {
    const t = createBroadcastTransport('chat-test', r)
    transports.push(t)
    return t
  }
  const hub = (
    t: Transport,
    id: string,
    opts: { host?: boolean; known?: string[]; now?: () => number } = {},
  ) => {
    const known = opts.known ?? ['alice', 'bob', 'cara']
    const h = new ChatHub(t, {
      selfId: id,
      selfName: () => id.toUpperCase(),
      isKnown: (p) => known.includes(p),
      isHost: () => opts.host ?? false,
      now: opts.now,
    })
    hubs.push(h)
    return h
  }
  const meet = async (...ts: Transport[]) => {
    const end = Date.now() + 2000
    while (ts.some((t) => t.peers().length < ts.length - 1)) {
      if (Date.now() > end) throw new Error('peers never met')
      await wait(5)
    }
  }
  const texts = (msgs: readonly ChatMessage[]) => msgs.map((m) => `${m.playerId}:${m.text}`)

  it('delivers a message to everyone, including the sender', async () => {
    const r = room()
    const [ta, tb] = [connect(r), connect(r)]
    const a = hub(ta, 'alice', { host: true })
    const b = hub(tb, 'bob')
    await meet(ta, tb)
    const seen: string[] = []
    b.on((m) => seen.push(`${m.name}:${m.text}`))
    expect(a.send('  gg  ')).toBe('ok')
    await wait(30)
    expect(texts(a.messages())).toEqual(['alice:gg'])
    expect(a.messages()[0].mine).toBe(true)
    expect(seen).toEqual(['ALICE:gg'])
    expect(b.messages()[0].mine).toBe(false)
  })

  it('refuses empty messages and limits how fast you can send', async () => {
    const t = 0
    const a = hub(connect(room()), 'alice', { now: () => t })
    expect(a.send('   ')).toBe('empty')
    const results = Array.from({ length: CHAT_SEND_LIMIT.max + 1 }, (_, i) => a.send(`m${i}`))
    expect(results.filter((r) => r === 'ok')).toHaveLength(CHAT_SEND_LIMIT.max)
    expect(results.at(-1)).toBe('limited')
  })

  it('drops floods, strangers, spoofed self, duplicates and junk', async () => {
    const t = 0
    const r = room()
    const [ta, tb] = [connect(r), connect(r)]
    const b = hub(tb, 'bob', { now: () => t })
    await meet(ta, tb)
    for (let i = 0; i < CHAT_RECEIVE_LIMIT.max + 4; i++)
      ta.send('tx', { k: 'm', id: `m${i}`, p: 'alice', n: 'A', t: 'hi' })
    ta.send('tx', { k: 'm', id: 'x1', p: 'mallory', n: 'M', t: 'hi' })
    ta.send('tx', { k: 'm', id: 'x2', p: 'bob', n: 'B', t: 'not me' })
    ta.send('tx', { k: 'm', id: 'm0', p: 'cara', n: 'C', t: 'dup id' })
    ta.send('tx', { k: 'm', id: 'x3', p: 'cara', n: 'C', t: '   ' })
    ta.send('tx', null)
    await wait(30)
    expect(b.messages()).toHaveLength(CHAT_RECEIVE_LIMIT.max)
    expect(b.messages().every((m) => m.playerId === 'alice')).toBe(true)
  })

  it('the host shares recent history with players who join later', async () => {
    const r = room()
    const [ta, tb] = [connect(r), connect(r)]
    const a = hub(ta, 'alice', { host: true })
    const b = hub(tb, 'bob')
    await meet(ta, tb)
    a.send('first')
    await wait(10)
    b.send('second')
    await wait(30)

    const tc = connect(r)
    const c = hub(tc, 'cara')
    const historyFlags: boolean[] = []
    c.on((_, fromHistory) => historyFlags.push(fromHistory))
    await meet(ta, tb, tc)
    await wait(50)
    // Only the host answers, so cara gets each message once, in order.
    expect(texts(c.messages())).toEqual(['alice:first', 'bob:second'])
    expect(historyFlags).toEqual([true, true])
  })

  it('shares at most the latest messages and ignores a second history', async () => {
    const r = room()
    const [ta, tb] = [connect(r), connect(r)]
    const b = hub(tb, 'bob')
    await meet(ta, tb)
    const msgs = Array.from({ length: CHAT_HISTORY_SHARED + 5 }, (_, i) => ({
      id: `h${i}`,
      p: 'alice',
      n: 'A',
      t: `${i}`,
    }))
    ta.send('tx', { k: 'h', m: msgs })
    ta.send('tx', { k: 'h', m: [{ id: 'late', p: 'alice', n: 'A', t: 'again' }] })
    await wait(30)
    expect(b.messages()).toHaveLength(CHAT_HISTORY_SHARED)
    expect(b.messages().at(-1)!.text).toBe(String(CHAT_HISTORY_SHARED + 4))
  })
})
