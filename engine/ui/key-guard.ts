/** True while typing in a field, where a key is just a letter (contenteditable, INPUT / TEXTAREA / SELECT). */
export const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))

/**
 * While an overlay is open no key PRESS reaches the game (window listeners), wherever focus is.
 * Capture on `window`, no preventDefault: sliders and buttons keep their native keys; Esc/Tab stay for
 * the overlay's own handling, as do the codes in `pass` (e.g. push-to-talk). Never listens to keyup: a
 * key held before opening must still release (else stuck movement / charged swing / live push-to-talk
 * mic). Returns the remover.
 */
export function guardGameKeys(opts: { pass?: readonly string[] } = {}): () => void {
  const pass = opts.pass ?? []
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Tab' || pass.includes(e.code)) return
    e.stopPropagation()
  }
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}
