// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { NameTags, tagMode, tagOpacity, TAG } from './nametags'

describe('name tags', () => {
  it('full between points, faint during a rally', () => {
    expect(tagMode('serve')).toBe('full')
    expect(tagMode('over')).toBe('full')
    expect(tagMode('rally')).toBe('faint')
  })

  it('opacity: faint is dimmer, covering the shuttle dims more, a fading chibi fades its tag (to a floor)', () => {
    expect(tagOpacity('full', 1, false)).toBe(1)
    expect(tagOpacity('faint', 1, false)).toBe(TAG.faint)
    expect(tagOpacity('full', 1, true)).toBeLessThan(tagOpacity('full', 1, false))
    expect(tagOpacity('full', 0.8, false)).toBeCloseTo(0.8)
    expect(tagOpacity('full', 0.2, false)).toBeCloseTo(TAG.fadeFloor)
  })

  it('shows name, colour and a You marker on the local player only; rewrites only on change', () => {
    const tags = new NameTags()
    tags.set(0, 'Hảo', '#5bb8ff', true)
    tags.set(1, 'Computer', '#7be08a', false)
    const [me, them] = [...tags.root.children] as HTMLElement[]
    expect(me.textContent).toContain('Hảo')
    expect(me.querySelector('.sp-tag-you')?.textContent).toBe('You')
    expect(me.style.getPropertyValue('--sp-tag')).toBe('#5bb8ff')
    expect(them.querySelector('.sp-tag-you')).toBeNull()
    const name = me.querySelector('.sp-tag-name')
    tags.set(0, 'Hảo', '#5bb8ff', true)
    expect(me.querySelector('.sp-tag-name')).toBe(name)
  })

  it('places a tag above the point, hides it off screen or when asked, and marks faint mode', () => {
    const tags = new NameTags()
    tags.set(0, 'A', '#fff', false)
    const el = tags.root.children[0] as HTMLElement
    tags.place(0, { x: 100, y: 80, on: true }, 'faint', 1, null)
    expect(el.hidden).toBe(false)
    expect(el.classList.contains('faint')).toBe(true)
    expect(el.style.transform).toContain('100.0px')
    tags.place(0, { x: 100, y: 80, on: false }, 'full', 1, null)
    expect(el.hidden).toBe(true)
    tags.place(0, null, 'full', 1, null)
    expect(el.hidden).toBe(true)
    tags.hideFrom(0)
    expect(el.hidden).toBe(true)
  })
})
