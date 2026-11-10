/** `?netdebug=1`: log connection problems and status changes to the console. */
const netDebug =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('netdebug') === '1'

/** Console log for `?netdebug=1` only (a dev aid; off by default). */
export function netLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  if (netDebug) console.info('[net]', ...args)
}
