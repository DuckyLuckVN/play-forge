// Ranks Nostr relays for matchmaking (engine/net/net-config.ts RELAY_URLS).
//
//   node scripts/probe-relays.mjs [rounds=6]
//
// Candidates: Trystero's own defaults plus our current list. For each relay and
// round, one socket subscribes to a random topic and a second socket publishes a
// Trystero event to it (the library's own event code, so the format always
// matches the installed version), like two players finding each other. Relays
// are scored by deliveries, then by median delivery time; the top ones are
// printed ready to paste. Rejections (rate limits, auth, PoW) are listed too.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defaultRelayUrls } from 'trystero'
import WebSocket from 'ws'

const root = fileURLToPath(new URL('..', import.meta.url))
const { createEvent, createSigner, topicToKind, subscribeSince } = await import(
  new URL('node_modules/@trystero-p2p/nostr/dist/protocol.mjs', `file://${root}/`).href
)

const ROUNDS = Number(process.argv[2]) || 6
const KEEP = 8
const TIMEOUT_MS = 6000
const PAUSE_MS = 1500

const config = readFileSync(`${root}/engine/net/net-config.ts`, 'utf8')
const list = /RELAY_URLS[^=]*=\s*\[([^\]]*)\]/.exec(config)?.[1] ?? ''
const ours = [...list.matchAll(/'(wss:\/\/[^']+)'/g)].map((m) => m[1])
const candidates = [...new Set([...defaultRelayUrls, ...ours])]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { handshakeTimeout: TIMEOUT_MS })
    const timer = setTimeout(() => (ws.terminate(), reject(new Error('connect timeout'))), TIMEOUT_MS)
    ws.once('open', () => (clearTimeout(timer), resolve(ws)))
    ws.once('error', (e) => (clearTimeout(timer), reject(e)))
    ws.once(
      'unexpected-response',
      (_, res) => (clearTimeout(timer), reject(new Error(`HTTP ${res.statusCode}`))),
    )
  })
}

/** One round: subscribe on one socket, publish on another. Delivery ms, or an error. */
async function round(url) {
  const topic = `pf-probe-${Math.random().toString(36).slice(2)}`
  const sockets = await Promise.allSettled([open(url), open(url)])
  const failed = sockets.find((r) => r.status === 'rejected')
  if (failed) {
    // Close the one that did open, or it keeps the process alive.
    for (const r of sockets) if (r.status === 'fulfilled') r.value.terminate()
    throw new Error(`connect: ${failed.reason?.message || 'refused'}`)
  }
  const [sub, pub] = sockets.map((r) => r.value)
  try {
    const subId = Math.random().toString(36).slice(2, 10)
    const subscribed = new Promise((resolve) => {
      sub.on('message', (raw) => {
        const msg = JSON.parse(String(raw))
        if (msg[0] === 'EOSE' && msg[1] === subId) resolve()
      })
      setTimeout(resolve, 2000) // some relays never send EOSE
    })
    sub.send(
      JSON.stringify(['REQ', subId, { kinds: [topicToKind(topic)], '#x': [topic], since: subscribeSince() }]),
    )
    await subscribed
    const start = performance.now()
    const delivered = new Promise((resolve, reject) => {
      sub.on('message', (raw) => {
        const msg = JSON.parse(String(raw))
        if (msg[0] === 'EVENT' && msg[1] === subId) resolve(performance.now() - start)
        if (msg[0] === 'CLOSED') reject(new Error(`sub closed: ${msg[2] ?? ''}`))
      })
      pub.on('message', (raw) => {
        const msg = JSON.parse(String(raw))
        if (msg[0] === 'OK' && msg[2] === false) reject(new Error(`rejected: ${msg[3] ?? ''}`))
        if (msg[0] === 'NOTICE') reject(new Error(`notice: ${msg[1] ?? ''}`))
      })
      setTimeout(() => reject(new Error('not delivered')), TIMEOUT_MS)
    })
    pub.send(await createEvent(topic, JSON.stringify({ probe: true }), createSigner()))
    return await delivered
  } finally {
    sub.terminate()
    pub.terminate()
  }
}

async function probe(url) {
  const times = []
  const errors = new Map()
  for (let i = 0; i < ROUNDS; i++) {
    try {
      times.push(await round(url))
    } catch (e) {
      const key = String(e.message).slice(0, 80)
      errors.set(key, (errors.get(key) ?? 0) + 1)
    }
    await sleep(PAUSE_MS)
  }
  times.sort((a, b) => a - b)
  const median = times.length ? Math.round(times[Math.floor(times.length / 2)]) : null
  return { url, ok: times.length, median, errors: [...errors].map(([e, n]) => `${e} ×${n}`).join('; ') }
}

console.log(`Probing ${candidates.length} relays, ${ROUNDS} rounds each…`)
const results = await Promise.all(candidates.map(probe))
results.sort((a, b) => b.ok - a.ok || (a.median ?? Infinity) - (b.median ?? Infinity))
for (const r of results) {
  const tag = ours.includes(r.url) ? ' (current)' : ''
  console.log(
    `${String(r.ok).padStart(2)}/${ROUNDS}  ${r.median === null ? '   -' : `${r.median}`.padStart(4)} ms  ${r.url}${tag}${r.errors ? `  ← ${r.errors}` : ''}`,
  )
}
const best = results.filter((r) => r.ok === ROUNDS).slice(0, KEEP)
console.log(`\nRelays that delivered every round (best ${KEEP}):`)
for (const r of best) console.log(`  '${r.url}',`)
process.exit(0)
