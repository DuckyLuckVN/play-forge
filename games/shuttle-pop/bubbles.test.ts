// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { BUBBLE, bubbleOpacity, headAnchorY, ReactionBubbles, toScreen } from './bubbles'

const el = (b: ReactionBubbles, i: number) => b.root.querySelectorAll<HTMLElement>('.sp-bubble')[i]

describe('reaction bubbles', () => {
  it('anchor rides the jump arc', () => {
    expect(headAnchorY(0, 0, 1.2, 1)).toBeCloseTo(1.48)
    expect(headAnchorY(0, 0.8, 1.2, 1)).toBeCloseTo(2.28)
    expect(headAnchorY(0, 0, 1.2, 1.5)).toBeCloseTo(2.08)
  })
  it('projects above the chibi on a real camera', () => {
    const cam = new PerspectiveCamera(50, 2, 0.1, 100)
    cam.position.set(0, 4, -9)
    cam.lookAt(0, 1, 0)
    cam.updateMatrixWorld()
    const px = (y: number) => {
      const v = new Vector3(0, y, 0).project(cam)
      return toScreen(v, 9, 800, 400)
    }
    expect(px(headAnchorY(0, 0, 1.2, 1)).y).toBeLessThan(px(1.2).y)
    expect(px(headAnchorY(0, 0.8, 1.2, 1)).y).toBeLessThan(px(headAnchorY(0, 0, 1.2, 1)).y)
  })
  it('behind the camera is off; edges clamp', () => {
    expect(toScreen({ x: 0, y: 0 }, -1, 800, 400).on).toBe(false)
    expect(toScreen({ x: 1.5, y: 1.5 }, 5, 800, 400)).toEqual({ x: 772, y: 48, on: true })
  })
  it('opacity: full, fades with the chibi (floored), dims over the shuttle, gone at life', () => {
    expect(bubbleOpacity(0.2, 1, false)).toBe(1)
    expect(bubbleOpacity(0.2, 0.2, false)).toBe(0.5)
    expect(bubbleOpacity(0.2, 1, true)).toBeCloseTo(0.35)
    expect(bubbleOpacity(1.65, 1, false)).toBeCloseTo(0.5)
    expect(bubbleOpacity(BUBBLE.life, 1, false)).toBe(0)
  })
  it('one bubble per player, newest replaces; unknown ids drawn never', () => {
    const b = new ReactionBubbles()
    expect(b.show(0, 'gg', 0)).toBe(true)
    expect(b.show(0, 'fire', 0.5)).toBe(true)
    expect(b.root.querySelectorAll('.sp-bubble:not([hidden])')).toHaveLength(1)
    expect(b.show(1, '<img onerror=x>', 0)).toBe(false)
    expect(b.root.innerHTML).not.toContain('onerror')
    expect(b.show(3, 'clap', 0)).toBe(true)
    expect(b.root.getAttribute('aria-hidden')).toBe('true')
  })
  it('expires and hides off-screen', () => {
    const b = new ReactionBubbles()
    b.show(0, 'gg', 0)
    b.place(0, 0.5, { x: 100, y: 100, on: false }, 1, null)
    expect(el(b, 0).hidden).toBe(true)
    b.place(0, 2, { x: 100, y: 100, on: true }, 1, null)
    expect(b.live(0)).toBe(false)
  })
  it('covers-shuttle test uses the bubble box', () => {
    const b = new ReactionBubbles()
    b.show(0, 'gg', 0)
    b.place(0, 0.2, { x: 100, y: 100, on: true }, 1, { x: 100, y: 80 })
    expect(Number(el(b, 0).style.opacity)).toBeCloseTo(0.35)
    b.place(0, 0.2, { x: 100, y: 100, on: true }, 1, { x: 300, y: 80 })
    expect(Number(el(b, 0).style.opacity)).toBe(1)
  })
  it('reset hides everything', () => {
    const b = new ReactionBubbles()
    b.show(0, 'gg', 0)
    b.reset()
    expect(b.live(0)).toBe(false)
    expect(el(b, 0).hidden).toBe(true)
  })
})
