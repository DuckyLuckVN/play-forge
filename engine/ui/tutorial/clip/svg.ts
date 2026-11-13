// Tiny SVG element helper for tutorial clips (the HTML `h()` in engine/ui/dom.ts can't create SVG).

const NS = 'http://www.w3.org/2000/svg'

export type SvgChild = Node | string | false | null | undefined
export type SvgAttrs = Record<string, string | number | undefined | null | false>

/** s('circle', { r: 9, fill: '#fff' }) -> <circle>. Nullish / false attrs are skipped. */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: SvgAttrs = {},
  ...children: SvgChild[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    el.setAttribute(k, String(v))
  }
  for (const c of children) if (c) el.append(c)
  return el
}
