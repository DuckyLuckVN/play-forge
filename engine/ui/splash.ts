/**
 * The first-paint splash (scripts/splash.mjs: cover + loading bar, put in the
 * page at build time). Fades it out once the shell's first screen is up.
 */
export function dismissSplash(doc: Document = document): void {
  const el = doc.getElementById('pf-splash')
  if (!el || el.classList.contains('out')) return
  el.classList.add('out')
  el.removeAttribute('aria-busy')
  // Remove after the fade (and anyway, in case transitions never fire, e.g. a background tab).
  const remove = () => el.remove()
  el.addEventListener('transitionend', remove, { once: true })
  setTimeout(remove, 400)
}
