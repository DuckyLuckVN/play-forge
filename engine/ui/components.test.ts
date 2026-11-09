import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  button,
  buttonClass,
  card,
  cardClass,
  cx,
  note,
  noteClass,
  panel,
  pill,
  pillClass,
  toolButton,
} from './components'

describe('class builders', () => {
  it('cx joins and skips empty parts', () => {
    expect(cx('a', '', false, null, undefined, ' b  c ')).toBe('a b c')
  })

  it('buttonClass', () => {
    expect(buttonClass()).toBe('pf-btn')
    expect(buttonClass('primary wide')).toBe('pf-btn primary wide')
    expect(buttonClass(' sm  danger ')).toBe('pf-btn sm danger')
  })

  it('cardClass and pillClass', () => {
    expect(cardClass()).toBe('pf-card')
    expect(cardClass('sunken')).toBe('pf-card sunken')
    expect(pillClass()).toBe('pf-pill')
    expect(pillClass('mint dot')).toBe('pf-pill mint dot')
  })

  it('noteClass', () => {
    expect(noteClass()).toBe('pf-note')
    expect(noteClass(true)).toBe('pf-note error')
  })
})

// The builders only need createElement and append; a tiny stand-in keeps this
// test free of a DOM environment.
interface FakeEl {
  tagName: string
  className: string
  children: unknown[]
  type?: string
  textContent?: string
  onclick?: () => void
  title?: string
  attrs: Record<string, string>
  append(...c: unknown[]): void
  setAttribute(k: string, v: string): void
}
const realDocument = (globalThis as { document?: unknown }).document

describe('element builders', () => {
  beforeEach(() => {
    ;(globalThis as { document?: unknown }).document = {
      createElement: (tag: string): FakeEl => ({
        tagName: tag.toUpperCase(),
        className: '',
        children: [],
        attrs: {},
        append(...c) {
          this.children.push(...c)
        },
        setAttribute(k, v) {
          this.attrs[k] = v
        },
      }),
    }
  })
  afterEach(() => {
    ;(globalThis as { document?: unknown }).document = realDocument
  })

  it('button: a typed button with text, handler and classes', () => {
    const go = () => {}
    const b = button('Go', go, 'primary') as unknown as FakeEl
    expect(b.tagName).toBe('BUTTON')
    expect(b.type).toBe('button')
    expect(b.className).toBe('pf-btn primary')
    expect(b.textContent).toBe('Go')
    expect(b.onclick).toBe(go)
  })

  it('toolButton: a small button with an icon, a label and an accessible name', () => {
    const b = toolButton('Undo', '<svg/>', () => {}, 'danger') as unknown as FakeEl
    expect(b.className).toBe('pf-btn sm danger')
    expect(b.title).toBe('Undo')
    expect(b.attrs['aria-label']).toBe('Undo')
    const [art, label] = b.children as FakeEl[]
    expect(art.className).toBe('pf-icon')
    expect([label.className, label.textContent]).toEqual(['pf-btn-label', 'Undo'])
  })

  it('panel and card wrap their children', () => {
    const p = panel('a', null, 'b') as unknown as FakeEl
    expect(p.className).toBe('pf-panel')
    expect(p.children).toEqual(['a', 'b'])
    const c = card('x') as unknown as FakeEl
    expect(c.className).toBe('pf-card')
    expect(c.children).toEqual(['x'])
  })

  it('pill and note', () => {
    const p = pill('+2', 'mint') as unknown as FakeEl
    expect([p.tagName, p.className, p.textContent]).toEqual(['SPAN', 'pf-pill mint', '+2'])
    const n = note('Oops', true) as unknown as FakeEl
    expect([n.tagName, n.className, n.textContent]).toEqual(['P', 'pf-note error', 'Oops'])
  })
})
