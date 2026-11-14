import { describe, expect, it } from 'vitest'
import { pauseAction } from './pause-keys'

const pauseKeys = ['Escape', 'KeyP']

describe('pauseAction', () => {
  it('solo: a pause key while playing toggles the real pause', () => {
    expect(pauseAction({ key: 'Escape', pauseKeys, offline: true, phase: 'playing' })).toBe('toggle-solo')
    expect(pauseAction({ key: 'KeyP', pauseKeys, offline: true, phase: 'playing' })).toBe('toggle-solo')
  })
  it('online: a pause key while playing toggles the local menu (the match keeps running)', () => {
    expect(pauseAction({ key: 'Escape', pauseKeys, offline: false, phase: 'playing' })).toBe('toggle-menu')
  })
  it('solo or online: nothing outside a match in progress', () => {
    for (const offline of [true, false])
      for (const phase of ['lobby', 'countdown', 'finished'])
        expect(pauseAction({ key: 'Escape', pauseKeys, offline, phase })).toBeNull()
  })
  it('ignores keys that are not pause keys', () => {
    expect(pauseAction({ key: 'Space', pauseKeys, offline: true, phase: 'playing' })).toBeNull()
    expect(pauseAction({ key: 'KeyW', pauseKeys, offline: false, phase: 'playing' })).toBeNull()
    expect(pauseAction({ key: 'Escape', pauseKeys: ['KeyP'], offline: false, phase: 'playing' })).toBeNull()
  })
  it('online: nothing while the host is lost (the host-lost screen shows, not the menu)', () => {
    expect(
      pauseAction({ key: 'Escape', pauseKeys, offline: false, phase: 'playing', hostLost: true }),
    ).toBeNull()
  })
  it('online: nothing when the game already used the key (e.g. Fuse: Esc cancels an armed blast)', () => {
    expect(
      pauseAction({ key: 'Escape', pauseKeys, offline: false, phase: 'playing', consumed: true }),
    ).toBeNull()
    expect(pauseAction({ key: 'Escape', pauseKeys, offline: false, phase: 'playing', consumed: false })).toBe(
      'toggle-menu',
    )
  })
})
