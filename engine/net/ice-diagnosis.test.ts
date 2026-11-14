import { describe, expect, it } from 'vitest'
import { parseCandidate, whyNotDirect, type Candidate } from './ice-diagnosis'

const host = (port: number) => `candidate:1 1 udp 2113937151 a559dfc6.local ${port} typ host generation 0`
const srflx = (ip: string, port: number) =>
  `candidate:2 1 udp 1677729535 ${ip} ${port} typ srflx raddr 0.0.0.0 rport 0 generation 0`
const relay = (ip: string, port: number) =>
  `candidate:3 1 udp 33562623 ${ip} ${port} typ relay raddr 113.172.243.200 rport 57143`
const parse = (lines: string[]) => lines.map(parseCandidate).filter((c): c is Candidate => c !== null)

describe('parseCandidate', () => {
  it('reads type, address, port and protocol, with or without the "candidate:" line prefix', () => {
    expect(parseCandidate(srflx('113.172.243.200', 57143))).toEqual({
      type: 'srflx',
      address: '113.172.243.200',
      port: 57143,
      protocol: 'udp',
    })
    expect(parseCandidate(`a=${host(5000)}`)?.type).toBe('host')
  })

  it('ignores malformed lines and end-of-candidates', () => {
    expect(parseCandidate('')).toBeNull()
    expect(parseCandidate('candidate:1 1 udp')).toBeNull()
    expect(parseCandidate('candidate:1 1 udp 1 1.2.3.4 notaport typ host')).toBeNull()
  })
})

describe('whyNotDirect', () => {
  const home = parse([host(57143), srflx('113.172.243.200', 57143), relay('113.172.243.200', 49160)])

  it('same public address on both sides: same network, the router blocks the hairpin', () => {
    const peer = parse([host(60000), srflx('113.172.243.200', 60000)])
    expect(whyNotDirect(home, peer, true)).toBe('same-network')
  })

  it('one socket mapped to different public ports per server: that side has a strict NAT', () => {
    const phone = parse([host(40000), srflx('27.64.1.2', 1111), srflx('27.64.1.2', 2222)])
    expect(whyNotDirect(home, phone, true)).toBe('strict-peer')
    expect(whyNotDirect(phone, home, true)).toBe('strict-self')
  })

  it('two network interfaces (two host sockets) with their own ports are not a strict NAT', () => {
    const laptop = parse([host(1), host(2), srflx('1.2.3.4', 1), srflx('1.2.3.4', 2)])
    expect(whyNotDirect(laptop, home, true)).toBe('unknown')
  })

  it('no public address once gathering is done: this network blocks STUN (UDP)', () => {
    const corp = parse([host(5000), relay('9.9.9.9', 3478)])
    expect(whyNotDirect(corp, home, true)).toBe('no-public-self')
    // Still gathering: too early to say.
    expect(whyNotDirect(corp, home, false)).toBe('unknown')
  })

  it("the peer's missing public address is not blamed (late candidates may never be sent)", () => {
    expect(whyNotDirect(home, parse([host(1)]), true)).toBe('unknown')
  })

  it('friendly NATs on different networks: unknown (a retry may help)', () => {
    expect(whyNotDirect(home, parse([host(1), srflx('5.6.7.8', 1)]), true)).toBe('unknown')
  })
})
