import { afterEach, describe, expect, it } from 'vitest'
import { createBroadcastTransport } from './broadcast'
import { Session, type GameDefinition, type SessionOptions } from './session'
import { createOfflineTransport } from './transport'

// A tiny counter game: each input adds to the player's total.
type Counter = { totals: Record<string, number>; ticks: number }
const counter: GameDefinition<Counter, number> = {
  id: 'counter',
  tickRate: 100,
  minPlayers: 2,
  maxPlayers: 3,
  countdown: 0,
  setup: (players) => ({ totals: Object.fromEntries(players.map((p) => [p.id, 0])), ticks: 0 }),
  tick(state, inputs) {
    for (const { player, input } of inputs) state.totals[player] += input
    state.ticks++
    return state
  },
  isFinished: (state) => Object.values(state.totals).some((t) => t >= 3),
}

const until = async (cond: () => boolean, ms = 2000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('Session', () => {
  const sessions: Session<any, any>[] = []
  afterEach(() => sessions.splice(0).forEach((s) => s.dispose()))

  const room = () => Math.random().toString(36).slice(2)
  const join = (
    roomId: string,
    opts: Partial<SessionOptions> & { playerId: string },
    def: GameDefinition<Counter, number> = counter,
  ) => {
    const s = new Session(def, createBroadcastTransport('test', roomId), {
      host: false,
      name: opts.playerId,
      ...opts,
    })
    sessions.push(s)
    return s
  }

  it('runs a host-authoritative match between two peers', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host' })
    const guest = join(r, { playerId: 'guest' })

    await until(() => guest.lobby.players.length === 2)
    expect(guest.lobby.hostId).toBe('host')
    expect(guest.self?.name).toBe('guest')

    // The host can't start until the guest is ready.
    expect(host.canStart).toBe(false)
    expect(host.waitingFor.map((p) => p.id)).toEqual(['guest'])
    guest.setReady(true)
    await until(() => host.canStart)
    expect(guest.canStart).toBe(false)

    host.start()
    await until(() => guest.phase === 'playing' && guest.state !== null)
    guest.sendInput(2)
    guest.sendInput(1)
    await until(() => guest.phase === 'finished')
    expect(guest.state!.totals.guest).toBe(3)
    // Ready flags reset for the rematch.
    expect(guest.self!.ready).toBe(false)
    expect(host.canStart).toBe(false)
  })

  it('keeps a dropped player’s seat during the grace period and restores it', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host', graceMs: 2000 })
    const guest = join(r, { playerId: 'guest', name: 'Bob' })
    await until(() => host.lobby.players.length === 2)
    const slot = host.lobby.players.find((p) => p.id === 'guest')!.slot

    guest.dispose() // like a reload or a dropped connection
    await until(() => host.reconnecting.length === 1)
    expect(host.lobby.players).toHaveLength(2)
    expect(host.canStart).toBe(false) // waits for Bob to come back

    const back = join(r, { playerId: 'guest', name: 'Bob' })
    await until(() => host.reconnecting.length === 0)
    expect(host.lobby.players.find((p) => p.id === 'guest')!.slot).toBe(slot)
    await until(() => back.self?.connected === true)
  })

  it('removes a dropped player once the grace period ends', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host', graceMs: 50 })
    const guest = join(r, { playerId: 'guest' })
    await until(() => host.lobby.players.length === 2)
    guest.dispose()
    await until(() => host.lobby.players.length === 1)
  })

  it('lets a returning player keep control of their piece mid-match', async () => {
    const r = room()
    const def = { ...counter, isFinished: (s: Counter) => s.totals.guest >= 5 }
    const host = join(r, { host: true, playerId: 'host', graceMs: 2000 }, def)
    const guest = join(r, { playerId: 'guest' }, def)
    await until(() => host.lobby.players.length === 2)
    guest.setReady(true)
    await until(() => host.canStart)
    host.start()
    await until(() => guest.phase === 'playing')
    guest.sendInput(2)
    await until(() => host.state!.totals.guest === 2)

    guest.dispose()
    await until(() => host.reconnecting.length === 1)
    const back = join(r, { playerId: 'guest' }, def)
    await until(() => back.phase === 'playing' && back.state !== null)
    back.sendInput(3)
    await until(() => back.phase === 'finished')
    expect(host.state!.totals.guest).toBe(5)
  })

  it('waits for a host that reloads, then follows the reopened room', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host' })
    const guest = join(r, { playerId: 'guest' })
    await until(() => guest.lobby.players.length === 2)
    const events: string[] = []
    guest.on('hostLost', () => events.push('lost'))
    guest.on('hostBack', () => events.push('back'))

    const snapshot = host.snapshot()
    host.dispose()
    await until(() => events.includes('lost'))
    expect(guest.hostConnected).toBe(false)

    const reopened = join(r, { host: true, playerId: 'host', restore: snapshot })
    await until(() => events.includes('back'))
    await until(() => reopened.lobby.players.find((p) => p.id === 'guest')?.connected === true)
    expect(reopened.lobby.players.map((p) => p.id).sort()).toEqual(['guest', 'host'])
  })

  it('tells guests when the host never comes back', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host' })
    const guest = join(r, { playerId: 'guest', hostWaitMs: 50 })
    await until(() => guest.hostConnected)
    let gone = false
    guest.on('hostGone', () => (gone = true))
    host.dispose()
    await until(() => gone)
  })

  it('frees the seat at once when a player leaves on purpose', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host', graceMs: 60000 })
    const guest = join(r, { playerId: 'guest' })
    await until(() => host.lobby.players.length === 2)
    guest.leave()
    await until(() => host.lobby.players.length === 1)
    expect(host.reconnecting).toEqual([])
  })

  it('tells guests at once when the host closes the room', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host' })
    const guest = join(r, { playerId: 'guest', hostWaitMs: 60000 })
    await until(() => guest.hostConnected)
    let gone = false
    guest.on('hostGone', () => (gone = true))
    host.leave()
    await until(() => gone, 1000)
  })

  it('lets a full room watch without taking a seat', async () => {
    const r = room()
    const def = { ...counter, maxPlayers: 2 }
    const host = join(r, { host: true, playerId: 'host' }, def)
    join(r, { playerId: 'a' }, def)
    await until(() => host.lobby.players.length === 2)
    const watcher = join(r, { playerId: 'b' }, def)
    await until(() => watcher.hostConnected)
    await new Promise((res) => setTimeout(res, 50))
    expect(host.lobby.players.map((p) => p.id)).toEqual(['host', 'a'])
    expect(watcher.self).toBeUndefined()
  })

  it('shares host-chosen options and applies them to the match', async () => {
    const r = room()
    const def: GameDefinition<Counter, number> = {
      ...counter,
      options: [
        {
          id: 'mode',
          label: 'Mode',
          default: 'calm',
          choices: [
            { value: 'calm', label: 'Calm' },
            { value: 'wild', label: 'Wild' },
          ],
        },
      ],
      tickRate: (o) => (o.mode === 'wild' ? 50 : 25),
      setup: (players, _seed, options) =>
        ({ ...counter.setup(players, 0, options), mode: options.mode }) as Counter,
    }
    const host = join(r, { host: true, playerId: 'host', options: { mode: 'nonsense' } }, def)
    const guest = join(r, { playerId: 'guest' }, def)
    expect(host.lobby.options).toEqual({ mode: 'calm' }) // invalid values fall back to the default
    expect(host.tickRate).toBe(25)

    await until(() => guest.lobby.players.length === 2)
    guest.setOption('mode', 'wild') // guests can't change options
    host.setOption('mode', 'wild')
    await until(() => guest.lobby.options.mode === 'wild')
    expect(guest.tickRate).toBe(50)
    expect(host.snapshot().options).toEqual({ mode: 'wild' })

    guest.setReady(true)
    await until(() => host.canStart)
    host.start()
    await until(() => guest.state !== null)
    expect((guest.state as unknown as { mode: string }).mode).toBe('wild')
    host.setOption('mode', 'calm') // locked during a match
    expect(host.lobby.options.mode).toBe('wild')
  })

  it('counts down before the match starts', async () => {
    const solo = new Session({ ...counter, minPlayers: 1, countdown: 1 }, createOfflineTransport(), {
      host: true,
      name: 'Solo',
      playerId: 'solo',
      offline: true,
    })
    sessions.push(solo)
    const phases: string[] = []
    solo.on('lobby', (l) => phases.push(l.phase))
    solo.start()
    expect(solo.phase).toBe('countdown')
    solo.sendInput(5) // ignored during the countdown
    await until(() => solo.phase === 'playing')
    await until(() => solo.state!.ticks > 2)
    expect(solo.state!.totals.solo).toBe(0)
    expect(phases).toEqual(['countdown', 'playing'])
  })

  it('pauses offline games only', async () => {
    const solo = new Session({ ...counter, minPlayers: 1 }, createOfflineTransport(), {
      host: true,
      name: 'Solo',
      playerId: 'solo',
      offline: true,
    })
    sessions.push(solo)
    solo.start()
    solo.setPaused(true)
    expect(solo.lobby.paused).toBe(true)
    const ticks = solo.state!.ticks
    await new Promise((r) => setTimeout(r, 50))
    expect(solo.state!.ticks).toBe(ticks)
    solo.setPaused(false)
    await until(() => solo.state!.ticks > ticks)
  })
})
