import { afterEach, describe, expect, it } from 'vitest'
import { createBroadcastTransport } from './broadcast'
import { cleanAvatar, seatingOf, seatsIf, Session, type GameDefinition, type SessionOptions } from './session'
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

  it('sends guests the netView of the state, while the host keeps the full state', async () => {
    const r = room()
    type Secret = Counter & { hostOnly?: string }
    const def = {
      ...counter,
      setup: (players: Parameters<typeof counter.setup>[0]) => ({
        ...counter.setup(players, 0, {}),
        hostOnly: 'x',
      }),
      netView: ({ hostOnly: _, ...rest }: Secret) => rest,
    } as GameDefinition<Counter, number>
    const host = join(r, { host: true, playerId: 'host' }, def)
    const guest = join(r, { playerId: 'guest' }, def)
    await until(() => guest.lobby.players.length === 2)
    guest.setReady(true)
    await until(() => host.canStart)
    host.start()
    await until(() => guest.state !== null && (guest.state as Counter).ticks > 0)
    expect((host.state as Secret).hostOnly).toBe('x')
    expect((guest.state as Secret).hostOnly).toBeUndefined()
  })

  it('inputStamp: a guest burst applies at its stamps’ spacing, with stamp / late on the event; unstamped at once', async () => {
    type In = { n: number; at?: number }
    type St = { tick: number; log: { n: number; tick: number; stamp?: number; late?: number }[] }
    const def: GameDefinition<St, In> = {
      id: 'stamped',
      tickRate: 100,
      minPlayers: 2,
      maxPlayers: 2,
      countdown: 0,
      setup: () => ({ tick: 0, log: [] }),
      tick(state, inputs) {
        state.tick++
        for (const { input, stamp, late } of inputs)
          state.log.push({ n: input.n, tick: state.tick, stamp, late })
        return state
      },
      isFinished: (state) => state.log.length >= 4,
      inputStamp: (i) => i.at,
    }
    const r = room()
    const host = new Session(def, createBroadcastTransport('test', r), {
      host: true,
      name: 'h',
      playerId: 'host',
    })
    const guest = new Session(def, createBroadcastTransport('test', r), {
      host: false,
      name: 'g',
      playerId: 'guest',
    })
    sessions.push(host, guest)
    await until(() => guest.lobby.players.length === 2)
    guest.setReady(true)
    await until(() => host.canStart)
    host.start()
    await until(() => guest.phase === 'playing' && host.phase === 'playing')
    // One burst (as after a stall): sent 5 steps apart, arriving together.
    guest.sendInput({ n: 1, at: 1000 })
    guest.sendInput({ n: 2, at: 1005 })
    guest.sendInput({ n: 3, at: 1010 })
    guest.sendInput({ n: 4 }) // unstamped: applied on arrival
    await until(() => host.phase === 'finished')
    const log = (host.state as St).log
    const at = (n: number) => log.find((e) => e.n === n)!
    expect(at(4).stamp).toBeUndefined()
    expect(at(4).tick).toBeLessThan(at(2).tick)
    expect(at(2).tick - at(1).tick).toBe(5)
    expect(at(3).tick - at(2).tick).toBe(5)
    expect(at(1)).toMatchObject({ stamp: 1000, late: 0 })
    expect(at(3)).toMatchObject({ stamp: 1010, late: 0 })
  })

  it('maps players to transport peers: every guest for the host, the host for a guest', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host' })
    const guest = join(r, { playerId: 'guest' })
    await until(() => guest.lobby.players.length === 2)
    expect(host.peerOf('guest')).toBe(guest.transport.selfId)
    expect(guest.peerOf('host')).toBe(host.transport.selfId)
    expect(host.peerOf('host')).toBeUndefined()
    expect(guest.peerOf('guest')).toBeUndefined()
    expect(host.peerOf('nobody')).toBeUndefined()
  })

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

  it('shares each player’s avatar, and accepts players without one', async () => {
    const r = room()
    join(r, { host: true, playerId: 'host', avatar: 'cat' })
    const guest = join(r, { playerId: 'guest', avatar: 'robot' })
    join(r, { playerId: 'old' }) // an older client: no avatar

    await until(() => guest.lobby.players.length === 3)
    const byId = (id: string) => guest.lobby.players.find((p) => p.id === id)
    expect(byId('host')?.avatar).toBe('cat')
    expect(byId('guest')?.avatar).toBe('robot')
    expect(byId('old')).toBeDefined()
    expect(byId('old')!.avatar).toBeUndefined()
  })

  it('lets players change their name and avatar from the room', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host', name: 'Host' })
    const guest = join(r, { playerId: 'guest', name: 'Player' })
    await until(() => guest.lobby.players.length === 2)
    const seen = (s: Session<any, any>, id: string) => s.lobby.players.find((p) => p.id === id)

    guest.setProfile('  Ana  ', 'cat')
    await until(() => seen(host, 'guest')?.name === 'Ana')
    expect(seen(host, 'guest')?.avatar).toBe('cat')
    await until(() => seen(guest, 'guest')?.name === 'Ana')

    host.setProfile('Bo'.repeat(20), 'robot')
    await until(() => seen(guest, 'host')?.avatar === 'robot')
    expect(seen(guest, 'host')?.name).toHaveLength(16)

    // A blank name falls back to "Player"; a bad avatar is dropped.
    guest.setProfile('   ', '<b>')
    await until(() => seen(host, 'guest')?.name === 'Player')
    expect(seen(host, 'guest')?.avatar).toBeUndefined()
  })

  it('keeps the new name when a guest reconnects', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host' })
    const guest = join(r, { playerId: 'guest', name: 'Player' })
    await until(() => host.lobby.players.length === 2)
    guest.setProfile('Ana', undefined)
    await until(() => host.lobby.players[1]?.name === 'Ana')
    // A fresh hello (as on reconnect) must carry the new profile, not the one from construction.
    ;(guest as any).transport.send('hello', (guest as any).hello)
    await new Promise((r) => setTimeout(r, 30))
    expect(host.lobby.players[1]?.name).toBe('Ana')
  })

  it('lets the host kick a player: their seat frees at once and they are told', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host' })
    const guest = join(r, { playerId: 'guest' })
    const other = join(r, { playerId: 'other' })
    await until(() => host.lobby.players.length === 3 && other.lobby.players.length === 3)
    let kicked = 0
    guest.on('kicked', () => kicked++)

    host.kick('guest')
    expect(host.lobby.players.map((p) => p.id)).toEqual(['host', 'other'])
    await until(() => kicked === 1)
    await until(() => other.lobby.players.length === 2)
    // Their inputs and ready no longer count.
    guest.setReady(true)
    await new Promise((res) => setTimeout(res, 30))
    expect(host.lobby.players.find((p) => p.id === 'guest')).toBeUndefined()
  })

  it('removes a kicked player from a running match', async () => {
    const r = room()
    const removed: string[] = []
    const def = { ...counter, removePlayer: (_: Counter, id: string) => void removed.push(id) }
    const host = join(r, { host: true, playerId: 'host' }, def)
    const a = join(r, { playerId: 'a' }, def)
    const b = join(r, { playerId: 'b' }, def)
    await until(
      () => host.lobby.players.length === 3 && a.lobby.players.length === 3 && b.lobby.players.length === 3,
    )
    a.setReady(true)
    b.setReady(true)
    await until(() => host.canStart)
    host.start()
    await until(() => host.phase === 'playing')
    host.kick('b')
    expect(removed).toEqual(['b'])
  })

  it('ignores kicks from guests, of the host, or of unknown players', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host' })
    const guest = join(r, { playerId: 'guest' })
    await until(() => guest.lobby.players.length === 2)
    guest.kick('host')
    host.kick('host')
    host.kick('nobody')
    await new Promise((res) => setTimeout(res, 30))
    expect(host.lobby.players).toHaveLength(2)
    expect(guest.lobby.players).toHaveLength(2)
  })

  it('only trusts a kick from the host', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host' })
    const guest = join(r, { playerId: 'guest' })
    const other = join(r, { playerId: 'other' })
    await until(() => other.lobby.players.length === 3)
    let kicked = 0
    guest.on('kicked', () => kicked++)
    // A guest forging the host's kick message.
    ;(other as any).transport.send('kick', true)
    await new Promise((res) => setTimeout(res, 30))
    expect(kicked).toBe(0)
    expect(host.lobby.players).toHaveLength(3)
  })

  it('lets a kicked player join again', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host' })
    const guest = join(r, { playerId: 'guest' })
    await until(() => host.lobby.players.length === 2)
    host.kick('guest')
    guest.dispose()
    join(r, { playerId: 'guest' })
    await until(() => host.lobby.players.length === 2)
  })

  it('drops avatar ids that are not short slugs', async () => {
    const r = room()
    const host = join(r, { host: true, playerId: 'host' })
    join(r, { playerId: 'bad', avatar: '<img src=x onerror=alert(1)>' })
    await until(() => host.lobby.players.length === 2)
    expect(host.lobby.players.find((p) => p.id === 'bad')!.avatar).toBeUndefined()
    expect(cleanAvatar('panda')).toBe('panda')
    expect(cleanAvatar('x'.repeat(25))).toBeUndefined()
    expect(cleanAvatar(42)).toBeUndefined()
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

  describe('seating', () => {
    // Mode 'b' opens 4 seats in 2 teams; mode 'a' keeps 2.
    const teams: GameDefinition<Counter, number> = {
      ...counter,
      maxPlayers: 4,
      options: [
        {
          id: 'mode',
          label: 'Mode',
          default: 'a',
          choices: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
      ],
      seating: (o) => ({ seats: o.mode === 'b' ? 4 : 2, teams: 2, botFill: true }),
    }
    const slots = (s: Session<any, any>) => Object.fromEntries(s.lobby.players.map((p) => [p.id, p.slot]))
    const settle = () => new Promise((res) => setTimeout(res, 50))
    /** Host plus guests joined one after another (so seats go in join order). */
    const fill = async (r: string, mode: string, ids: string[], def = teams) => {
      const host = join(r, { host: true, playerId: 'host', options: { mode } }, def)
      const guests: Session<any, any>[] = []
      for (const id of ids) {
        guests.push(join(r, { playerId: id }, def))
        await until(() => host.lobby.players.some((p) => p.id === id))
      }
      return { host, guests }
    }

    it('a game without seating keeps maxPlayers as the cap', async () => {
      expect(seatingOf(counter, {})).toEqual({ seats: 3, teams: 1, botFill: false })
      const r = room()
      const { host } = await fill(r, 'a', ['a', 'b'], counter)
      const watcher = join(r, { playerId: 'c' })
      await until(() => watcher.hostConnected)
      await settle()
      expect(host.lobby.players.map((p) => p.id)).toEqual(['host', 'a', 'b'])
    })

    it('clamps seats to [minPlayers, maxPlayers]', () => {
      expect(seatingOf({ ...teams, seating: () => ({ seats: 9, teams: 2, botFill: true }) }, {}).seats).toBe(
        4,
      )
      expect(seatingOf({ ...teams, seating: () => ({ seats: 0, teams: 2, botFill: true }) }, {}).seats).toBe(
        2,
      )
    })

    it('seats(options) caps joiners; extra joiners watch', async () => {
      const r = room()
      const { host } = await fill(r, 'a', ['a'])
      const watcher = join(r, { playerId: 'b' }, teams)
      await until(() => watcher.hostConnected)
      await settle()
      expect(host.lobby.players.map((p) => p.id)).toEqual(['host', 'a'])
      expect(watcher.self).toBeUndefined()
    })

    it('joiners fill seats 0,1,2,3 in order (teams A,B,A,B)', async () => {
      const { host } = await fill(room(), 'b', ['a', 'b', 'c'])
      expect(slots(host)).toEqual({ host: 0, a: 1, b: 2, c: 3 })
    })

    it('moveSeat moves a guest to a free seat in the lobby', async () => {
      const { host, guests } = await fill(room(), 'b', ['a'])
      const [a] = guests
      await until(() => a.lobby.players.length === 2)
      a.moveSeat(3)
      await until(() => a.self?.slot === 3)
      expect(slots(host)).toEqual({ host: 0, a: 3 })
      expect(host.lobby.players.map((p) => p.id)).toEqual(['host', 'a']) // sorted by seat
      host.moveSeat(2) // the host moves itself directly
      expect(slots(host)).toEqual({ host: 2, a: 3 })
      await until(() => a.lobby.players[0].id === 'host' && a.lobby.players[0].slot === 2)
    })

    it('moveSeat refuses taken, out-of-range and non-integer seats', async () => {
      const { host, guests } = await fill(room(), 'b', ['a', 'b'])
      const [a] = guests
      await until(() => a.lobby.players.length === 3)
      a.moveSeat(0) // taken (host)
      a.moveSeat(2) // taken (b)
      a.moveSeat(4) // seats are 0..3
      a.moveSeat(-1)
      a.moveSeat(1.5)
      a.moveSeat('3' as never)
      a.moveSeat(3) // the one valid move, sent last: messages arrive in order
      await until(() => slots(host).a === 3)
      expect(slots(host)).toEqual({ host: 0, a: 3, b: 2 })
      host.moveSeat(3) // taken
      host.moveSeat(4)
      expect(slots(host).host).toBe(0)
    })

    it('moveSeat is refused during a match', async () => {
      const { host, guests } = await fill(room(), 'b', ['a'])
      const [a] = guests
      await until(() => a.lobby.players.length === 2)
      a.setReady(true)
      await until(() => host.canStart)
      host.start()
      await until(() => a.phase === 'playing')
      a.moveSeat(3)
      host.moveSeat(2)
      await settle()
      expect(slots(host)).toEqual({ host: 0, a: 1 })
    })

    it('moveSeat is refused in a game without teams', async () => {
      const { host, guests } = await fill(room(), 'a', ['a'], counter)
      const [a] = guests
      await until(() => a.lobby.players.length === 2)
      a.moveSeat(2)
      host.moveSeat(2)
      await settle()
      expect(slots(host)).toEqual({ host: 0, a: 1 })
    })

    it('seatsIf: the seats a choice would open (the room greys out choices with too few)', () => {
      expect(seatsIf(teams, { mode: 'b' }, 'mode', 'a')).toBe(2)
      expect(seatsIf(teams, { mode: 'a' }, 'mode', 'b')).toBe(4)
      // Unknown values fall back to the default, like setOption.
      expect(seatsIf(teams, { mode: 'b' }, 'mode', 'zzz')).toBe(2)
      expect(seatsIf(counter, {}, 'mode', 'calm')).toBe(3)
    })

    it('setOption to fewer seats is refused while more are seated', async () => {
      const { host } = await fill(room(), 'b', ['a', 'b'])
      host.setOption('mode', 'a')
      expect(host.lobby.options.mode).toBe('b')
      expect(slots(host)).toEqual({ host: 0, a: 1, b: 2 })
    })

    it('setOption to fewer seats compacts seat 3 into a free seat when it fits', async () => {
      const { host, guests } = await fill(room(), 'b', ['a'])
      const [a] = guests
      await until(() => a.lobby.players.length === 2)
      a.moveSeat(3)
      await until(() => slots(host).a === 3)
      host.setOption('mode', 'a')
      expect(host.lobby.options.mode).toBe('a')
      expect(slots(host)).toEqual({ host: 0, a: 1 })
      await until(() => a.self?.slot === 1 && a.lobby.options.mode === 'a')
    })
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
