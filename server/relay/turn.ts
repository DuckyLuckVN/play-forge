import { createHmac } from 'node:crypto'
import { TokenBucket } from './hub.ts'

/**
 * Short-lived TURN logins for browsers (the "TURN REST API" scheme that coturn's
 * `use-auth-secret` understands): username = "<expiry unix seconds>:<tag>",
 * password = base64(HMAC-SHA1(secret, username)). The shared secret stays on the
 * server; a login is useless after its expiry, and nobody can mint one without
 * the secret. The secret is never logged or sent.
 */
export interface TurnLogin {
  urls: string[]
  username: string
  credential: string
  /** Seconds the login stays valid. */
  ttl: number
}

export interface TurnSettings {
  secret: string
  urls: string[]
  /** Seconds a login stays valid (long enough for a whole online session). */
  ttl: number
}

/** Logins per address: a burst for a few tabs, then one every 2 minutes. */
export const TURN_RATE = { perSecond: 1 / 120, burst: 6 } as const
export const DEFAULT_TURN_TTL = 12 * 60 * 60
const MIN_SECRET = 24

/** TURN settings from the environment, or null when TURN is off (or misconfigured). */
export function turnSettings(env: Record<string, string | undefined>): TurnSettings | null {
  const secret = env.TURN_SECRET ?? ''
  const urls = (env.TURN_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^turns?:[A-Za-z0-9.-]+(:\d+)?(\?transport=(udp|tcp))?$/.test(u))
  const ttl = Number(env.TURN_TTL_S ?? DEFAULT_TURN_TTL)
  if (secret.length < MIN_SECRET || !urls.length || !Number.isFinite(ttl) || ttl < 60) return null
  return { secret, urls, ttl: Math.round(ttl) }
}

export function turnLogin(s: TurnSettings, nowMs: number, tag = 'pf'): TurnLogin {
  const username = `${Math.floor(nowMs / 1000) + s.ttl}:${tag}`
  const credential = createHmac('sha1', s.secret).update(username).digest('base64')
  return { urls: [...s.urls], username, credential, ttl: s.ttl }
}

/** Per-address rate limit for logins (addresses are forgotten once their bucket is full again). */
export class TurnLimiter {
  private buckets = new Map<string, TokenBucket>()
  allow(address: string, now: number): boolean {
    let b = this.buckets.get(address)
    if (!b) {
      if (this.buckets.size > 50_000) this.buckets.clear() // memory guard under abuse
      b = new TokenBucket(TURN_RATE.perSecond, TURN_RATE.burst, now)
      this.buckets.set(address, b)
    }
    return b.take(1, now)
  }
  /** Drops addresses whose bucket has refilled (called by the relay's minute sweep). */
  sweep(now: number): void {
    const full = (TURN_RATE.burst / TURN_RATE.perSecond) * 1000
    for (const [address, b] of this.buckets) if (b.idleSince(now) >= full) this.buckets.delete(address)
  }
}
