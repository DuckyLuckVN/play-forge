// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Emitter, ReactionBridge } from '@forge'
import type { ReactionHub } from '@forge/social/reactions'
import { emotesLive, mountEmotes } from './emotes'

const hub = { send: vi.fn(() => true) } as unknown as ReactionHub

function setup(react: (p: string, r: string) => boolean = () => true) {
  const view = document.createElement('div')
  document.body.append(view)
  const em = new Emitter<{ lobby: [unknown] }>()
  const session = {
    offline: false,
    phase: 'playing' as string,
    lobby: { phase: 'playing', paused: false },
    on: (ev: 'lobby', fn: () => void) => em.on(ev, fn),
  }
  const bridge = new ReactionBridge()
  const off = mountEmotes(view, session as never, bridge, { react })
  const btn = () => view.querySelector<HTMLButtonElement>('.sp-rx-btn')!
  const setPhase = (p: string) => {
    session.lobby.phase = p
    session.phase = p
    em.emit('lobby', session.lobby)
  }
  return { view, session, bridge, off, btn, setPhase }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('emotesLive', () => {
  it('live only in an online countdown / match, not paused', () => {
    const base = { active: true, offline: false, phase: 'playing' as const, paused: false }
    expect(emotesLive(base)).toBe(true)
    expect(emotesLive({ ...base, phase: 'countdown' })).toBe(true)
    expect(emotesLive({ ...base, offline: true })).toBe(false)
    expect(emotesLive({ ...base, active: false })).toBe(false)
    expect(emotesLive({ ...base, phase: 'finished' })).toBe(false)
    expect(emotesLive({ ...base, phase: 'lobby' })).toBe(false)
    expect(emotesLive({ ...base, paused: true })).toBe(false)
  })
})

describe('mountEmotes', () => {
  it('button follows the bridge and the phase', () => {
    const { view, bridge, off, btn, setPhase } = setup()
    expect(btn().hidden).toBe(true)
    bridge.attach(hub)
    expect(btn().hidden).toBe(false)
    setPhase('finished')
    expect(btn().hidden).toBe(true)
    off()
    expect(view.querySelector('.sp-rx-btn')).toBeNull()
  })
  it('claims reactions for the 3D view only while live', () => {
    const { bridge, setPhase } = setup((p) => p === 'me')
    bridge.attach(hub)
    expect(bridge.claim('me', 'gg')).toBe(true)
    expect(bridge.claim('watcher', 'gg')).toBe(false)
    setPhase('finished')
    expect(bridge.claim('me', 'gg')).toBe(false)
  })
  it('button press never reaches the court', () => {
    const { view, bridge, btn } = setup()
    const seen: string[] = []
    view.addEventListener('pointerdown', () => seen.push('down'))
    bridge.attach(hub)
    btn().dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(seen).toEqual([])
  })
  it('cleanup unsubscribes the drawer and the active listener', () => {
    const { bridge, off } = setup()
    bridge.attach(hub)
    off()
    expect(bridge.claim('me', 'gg')).toBe(false)
    expect(() => bridge.attach(null)).not.toThrow()
  })
  it('a throwing court never breaks the shell claim', () => {
    const { bridge } = setup(() => {
      throw new Error('x')
    })
    bridge.attach(hub)
    expect(bridge.claim('me', 'gg')).toBe(false)
  })
})
