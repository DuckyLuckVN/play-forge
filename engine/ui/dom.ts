export type Child = Node | string | false | null | undefined

/** Small hyperscript helper: h('button', { class: 'pf-btn', onclick }, 'Go'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Omit<HTMLElementTagNameMap[K], 'style'>> & { class?: string; style?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  const { class: cls, style, ...rest } = props
  if (cls) el.className = cls
  if (style) el.setAttribute('style', style)
  Object.assign(el, rest)
  for (const c of children) if (c) el.append(c)
  return el
}

/** An element whose content is a trusted inline SVG icon. */
export function icon(svg: string, cls = 'pf-icon'): HTMLSpanElement {
  const el = h('span', { class: cls })
  el.innerHTML = svg
  return el
}

/** A square icon button with a tooltip and accessible name, e.g. in the top bar. */
export function iconButton(svg: string, label: string, onclick?: () => void): HTMLButtonElement {
  const b = h('button', { class: 'pf-btn icon', type: 'button' })
  if (onclick) b.onclick = onclick
  b.append(icon(svg))
  setLabel(b, label)
  return b
}

/** Sets an element's tooltip and accessible name together. */
export function setLabel(el: HTMLElement, label: string): void {
  el.title = label
  el.setAttribute('aria-label', label)
}

let toastHost: HTMLElement | null = null

export interface ToastOptions {
  /** Who it's from (a chat line): shown first, as a pill in `color`, instead of the dot. */
  name?: string
  /** A player named inside `text` ("Bao joined"): that part shows as a pill in `color`, wherever it is. */
  highlight?: string
  /** How long it stays, ms (default 3000). */
  ms?: number
}

/** Brief notification in the corner, e.g. "Bob joined", or a chat line from `name`. */
export function toast(text: string, color?: string, opts: ToastOptions = {}): void {
  if (!toastHost) {
    toastHost = h('div', { class: 'pf-toasts', role: 'status' } as never)
    document.body.append(toastHost)
  }
  const pill = (name: string) => h('span', { class: 'pf-toast-name', textContent: name })
  const at = opts.highlight ? text.indexOf(opts.highlight) : -1
  const el = opts.name
    ? h(
        'div',
        { class: 'pf-toast named' },
        pill(opts.name),
        h('span', { class: 'pf-toast-text', textContent: text }),
      )
    : at >= 0
      ? h(
          'div',
          { class: 'pf-toast named' },
          h(
            'span',
            { class: 'pf-toast-text' },
            text.slice(0, at),
            pill(opts.highlight!),
            text.slice(at + opts.highlight!.length),
          ),
        )
      : h('div', { class: 'pf-toast', textContent: text })
  if (color) el.style.setProperty('--pf-toast-dot', color)
  toastHost.append(el)
  const ms = opts.ms ?? 3000
  setTimeout(() => el.classList.add('out'), ms - 400)
  setTimeout(() => el.remove(), ms)
}
