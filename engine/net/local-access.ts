/**
 * Chrome's Local Network Access permission: a public site (the game on github.io) may not reach
 * devices on the player's own network until the player allows it. Without it, two players on the
 * same Wi-Fi can't link directly over WebRTC (their checks to each other's 192.168.x addresses are
 * dropped) and play through the backup server instead. A blocked WebRTC check doesn't make Chrome
 * ask, so the game asks on purpose (requestLocalAccess, from a click) when that seems to be the case.
 */

/** 'unsupported': the browser has no such permission (it doesn't block local links). */
export type LocalAccess = PermissionState | 'unsupported'

/** Names the permission has had (the spec renamed it). */
const NAMES = ['local-network-access', 'local-network']

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
 * Any address on a private network: the request only has to be one, so Chrome shows its prompt.
 * Nothing needs to answer (port 9 is "discard"); the answer is the permission's change.
 */
export const LOCAL_PROBE_URL = 'http://192.168.0.1:9/'

/** Make Chrome show its "access devices on your local network" prompt. Call from a click. */
export function requestLocalAccess(): void {
  try {
    void fetch(LOCAL_PROBE_URL, {
      mode: 'no-cors',
      cache: 'no-store',
      // Marks it as a deliberate local-network request (allowed from an https page).
      targetAddressSpace: 'local',
    } as RequestInit).catch(() => {})
  } catch {
    // No fetch, or the browser refused at once: nothing to ask.
  }
}
