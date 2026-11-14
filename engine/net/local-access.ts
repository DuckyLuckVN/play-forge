/**
 * Chrome's Local Network Access permission: a public site (the game on github.io) may not reach
 * devices on the player's own network until the player allows it. Without it, two players on the
 * same Wi-Fi can't link directly over WebRTC (their checks to each other's 192.168.x addresses are
 * dropped) and play through the backup server instead. A blocked WebRTC check doesn't make Chrome
 * ask, so the game asks on purpose (requestLocalAccess, from a click) when that seems to be the case.
 */

/** 'unsupported': the browser has no such permission (it doesn't block local links). */
export type LocalAccess = PermissionState | 'unsupported'

/** The permission's name (Chrome 145+), then its older alias. */
const NAMES = ['local-network', 'local-network-access']

/**
 * Reports the permission now and on every change; returns a stop function. Never throws: a
 * browser without the permission reports 'unsupported' once.
 */
export async function watchLocalAccess(onChange: (state: LocalAccess) => void): Promise<() => void> {
  const query = typeof navigator !== 'undefined' ? navigator.permissions?.query : undefined
  if (query) {
    for (const name of NAMES) {
      try {
        const status = await navigator.permissions.query({ name } as unknown as PermissionDescriptor)
        let live = true
        onChange(status.state)
        status.onchange = () => {
          if (live) onChange(status.state)
        }
        return () => {
          live = false
          status.onchange = null
        }
      } catch {
        // Not a name this browser knows: try the next.
      }
    }
  }
  onChange('unsupported')
  return () => {}
}

/**
 * Home routers' usual addresses (their admin page answers on port 80). Chrome only prompts once a
 * local request actually connects (a refused port or no such host fails with no prompt), and a
 * page can't learn the router's address: so ask them all, the player's own router answers. The
 * reply is never read; the answer is the permission's change.
 */
export const LOCAL_PROBE_URLS = [
  '192.168.1.1',
  '192.168.0.1',
  '192.168.50.1', // ASUS
  '192.168.31.1', // Xiaomi
  '192.168.100.1',
  '192.168.88.1', // MikroTik
  '192.168.2.1',
  '192.168.1.254',
  '192.168.43.1', // Android hotspot
  '172.20.10.1', // iPhone hotspot
  '10.0.0.1',
  '10.0.0.138',
].map((ip) => `http://${ip}/`)

/** Make Chrome show its "access devices on your local network" prompt. Call from a click. */
export function requestLocalAccess(): void {
  for (const url of LOCAL_PROBE_URLS) {
    try {
      void fetch(url, {
        mode: 'no-cors',
        cache: 'no-store',
        // Marks it as a deliberate local-network request (allowed from an https page).
        targetAddressSpace: 'local',
        signal: AbortSignal.timeout(60_000),
      } as RequestInit).catch(() => {})
    } catch {
      // No fetch, or the browser refused at once: nothing to ask.
    }
  }
}
