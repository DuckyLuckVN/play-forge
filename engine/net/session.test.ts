import { afterEach, describe, expect, it } from 'vitest'
import { createBroadcastTransport } from './broadcast'
import { Session, type GameDefinition } from './session'

// A tiny counter game: each input adds to the player's total.
const counter: GameDefinition<{ totals: Record<string, number>; ticks: number }, number> = {
  id: 'counter',
  tickRate: 100,
  minPlayers: 2,
  maxPlayers: 2,
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
    expect(host.canStart).toBe(true)
    expect(guest.canStart).toBe(false)

    host.start()
    await until(() => guest.phase === 'playing' && guest.state !== null)

    guest.sendInput(2)
    guest.sendInput(1)
    await until(() => guest.phase === 'finished')
    expect(guest.state!.totals[guest.selfId]).toBe(3)
    expect(host.state!.totals[guest.selfId]).toBe(3)
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
