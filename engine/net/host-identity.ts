/**
 * Host identity: an ECDSA P-256 key pair the host keeps for the life of a
 * room (saved in its reload snapshot). Guests pin the public key from the
 * first lobby they accept; a host that comes back on a new peer must sign a
 * guest's challenge before the guest follows it, so nobody else in the room
 * can stand in for a dropped host.
 *
 * WebCrypto needs a secure context (https or localhost). Without it there is
 * no identity and sessions behave as before (dev over a LAN IP).
 */

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const

export interface HostIdentity {
  /** Public key, base64 (raw point). Shared in the lobby. */
  readonly pub: string
  /** Private key as JWK, for the host's reload snapshot only. Never send it. */
  readonly secret: JsonWebKey
  sign(message: string): Promise<string>
}

const subtle = (): SubtleCrypto | undefined => globalThis.crypto?.subtle

const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const utf8 = (s: string) => new TextEncoder().encode(s)

/** The message a host signs: the guest's nonce bound to the host's own peer id. */
export const proofMessage = (nonce: string, hostPeer: string) => `${nonce}|${hostPeer}`

/** Make a new identity, or reload one from a saved private JWK. Null without WebCrypto. */
export async function createHostIdentity(saved?: JsonWebKey): Promise<HostIdentity | null> {
  const s = subtle()
  if (!s) return null
  try {
    let priv: CryptoKey
    let pubJwk: JsonWebKey
    if (saved?.d) {
      priv = await s.importKey('jwk', saved, ALG, true, ['sign'])
      const { d: _, ...pub } = saved
      pubJwk = { ...pub, key_ops: ['verify'] }
    } else {
      const pair = await s.generateKey(ALG, true, ['sign', 'verify'])
      priv = pair.privateKey
      pubJwk = await s.exportKey('jwk', pair.publicKey)
    }
    const pubKey = await s.importKey('jwk', pubJwk, ALG, true, ['verify'])
    const pub = toB64(await s.exportKey('raw', pubKey))
    const secret = await s.exportKey('jwk', priv)
    return {
      pub,
      secret,
      sign: async (message) => toB64(await s.sign(SIGN, priv, utf8(message))),
    }
  } catch {
    return null
  }
}

/**
 * Check a host's signature. Returns null when this browser can't check
 * (no WebCrypto), false for a bad or malformed proof.
 */
export async function verifyHost(pub: string, message: string, signature: unknown): Promise<boolean | null> {
  const s = subtle()
  if (!s) return null
  if (typeof signature !== 'string' || signature.length > 200) return false
  try {
    const key = await s.importKey('raw', fromB64(pub), ALG, false, ['verify'])
    return await s.verify(SIGN, key, fromB64(signature), utf8(message))
  } catch {
    return false
  }
}
