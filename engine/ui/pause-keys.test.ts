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
  it('online: nothing outside a match in progress', () => {
    for (const phase of ['lobby', 'countdown', 'finished'])
      expect(pauseAction({ key: 'Escape', pauseKeys, offline: false, phase })).toBeNull()
  })
  it('solo: nothing outside a match in progress', () => {
    for (const phase of ['lobby', 'countdown', 'finished'])
      expect(pauseAction({ key: 'Escape', pauseKeys, offline: true, phase })).toBeNull()
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
})
