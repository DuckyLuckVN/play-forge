type Child = Node | string | false | null | undefined

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

let toastHost: HTMLElement | null = null

/** Brief notification in the corner, e.g. "Bob joined". */
export function toast(text: string, color?: string): void {
  if (!toastHost) {
    toastHost = h('div', { class: 'pf-toasts', role: 'status' } as never)
    document.body.append(toastHost)
  }
  const el = h('div', { class: 'pf-toast', textContent: text })
  if (color) el.style.setProperty('--pf-toast-dot', color)
  toastHost.append(el)
  setTimeout(() => el.classList.add('out'), 2600)
  setTimeout(() => el.remove(), 3000)
}
