import { describe, expect, it } from 'vitest'
import { cleanAvatar } from '../net/session'
import { AVATARS, AVATAR_IDS, avatarFor, avatarSvg, defaultAvatar, isAvatarId, storedAvatar } from './avatars'
import { VI } from './i18n'

describe('avatars', () => {
  it('has at least 20 distinct avatars', () => {
    expect(AVATARS.length).toBeGreaterThanOrEqual(20)
    expect(new Set(AVATAR_IDS).size).toBe(AVATARS.length)
  })

  it('uses ids the session protocol accepts', () => {
    for (const id of AVATAR_IDS) expect(cleanAvatar(id)).toBe(id)
  })

  it('draws a distinct, well-formed SVG for each avatar', () => {
    const drawings = AVATAR_IDS.map(avatarSvg)
    for (const svg of drawings) {
      expect(svg.startsWith('<svg viewBox="0 0 64 64"')).toBe(true)
      expect(svg.endsWith('</svg>')).toBe(true)
      expect(svg).not.toContain('undefined')
    }
    expect(new Set(drawings).size).toBe(drawings.length)
  })

  it('translates every avatar name to Vietnamese', () => {
    for (const a of AVATARS) expect(VI[a.name], a.name).toBeTruthy()
  })

  it('gives players without a valid pick a stable default', () => {
    expect(defaultAvatar('abc')).toBe(defaultAvatar('abc'))
    expect(isAvatarId(defaultAvatar('abc'))).toBe(true)
    expect(avatarFor({ id: 'p1', avatar: 'owl' })).toBe('owl')
    expect(avatarFor({ id: 'p1' })).toBe(defaultAvatar('p1'))
    expect(avatarFor({ id: 'p1', avatar: 'not-real' })).toBe(defaultAvatar('p1'))
  })

  it('remembers the pick even without storage', () => {
    const first = storedAvatar()
    expect(isAvatarId(first)).toBe(true)
    expect(storedAvatar()).toBe(first)
    expect(storedAvatar('ghost')).toBe('ghost')
    expect(storedAvatar('nope')).toBe('ghost')
  })
})
