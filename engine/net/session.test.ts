import { afterEach, describe, expect, it } from 'vitest'
import { createBroadcastTransport } from './broadcast'
import { Session, type GameDefinition } from './session'
import { createOfflineTransport } from './transport'

// A tiny counter game: each input adds to the player's total.
const counter: GameDefinition<{ totals: Record<string, number>; ticks: number }, number> = {
  id: 'counter',
  tickRate: 100,
  minPlayers: 2,
  maxPlayers: 2,
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

describe('Session over BroadcastChannel', () => {
  const sessions: Session<any, any>[] = []
  afterEach(() => sessions.splice(0).forEach((s) => s.dispose()))

  it('runs a host-authoritative match between two peers', async () => {
    const room = Math.random().toString(36).slice(2)
    const host = new Session(counter, createBroadcastTransport('test', room), { host: true, name: 'Host' })
    const guest = new Session(counter, createBroadcastTransport('test', room), { host: false, name: 'Guest' })
    sessions.push(host, guest)

    await until(() => guest.lobby.players.length === 2)
    expect(guest.lobby.hostId).toBe(host.selfId)
    expect(guest.self?.name).toBe('Guest')
    // The host can't start until the guest is ready.
    expect(host.canStart).toBe(false)
    expect(host.waitingFor.map((p) => p.name)).toEqual(['Guest'])
    guest.setReady(true)
    await until(() => host.canStart)
    expect(guest.canStart).toBe(false)

    host.start()
    await until(() => guest.phase === 'playing' && guest.state !== null)

    guest.sendInput(2)
    guest.sendInput(1)
    await until(() => guest.phase === 'finished')
    expect(guest.state!.totals[guest.selfId]).toBe(3)
    expect(host.state!.totals[guest.selfId]).toBe(3)
    // Ready flags reset for the rematch.
    expect(guest.self!.ready).toBe(false)
    expect(host.canStart).toBe(false)
  })

  it('counts down before the match starts', async () => {
    const solo = new Session({ ...counter, minPlayers: 1, countdown: 1 }, createOfflineTransport(), {
      host: true,
      name: 'Solo',
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
    expect(solo.state!.totals.local).toBe(0)
    expect(phases).toEqual(['countdown', 'playing'])
  })

  it('pauses offline games only', async () => {
    const solo = new Session({ ...counter, minPlayers: 1 }, createOfflineTransport(), {
      host: true,
      name: 'Solo',
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

  it('removes players who leave', async () => {
    const room = Math.random().toString(36).slice(2)
    const host = new Session(counter, createBroadcastTransport('test', room), { host: true, name: 'Host' })
    const guest = new Session(counter, createBroadcastTransport('test', room), { host: false, name: 'Guest' })
    sessions.push(host)

    await until(() => host.lobby.players.length === 2)
    guest.dispose()
    await until(() => host.lobby.players.length === 1)
  })
})
