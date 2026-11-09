import { describe, expect, it } from 'vitest'
import { translatedKeys, untranslatedText } from './i18n-scan'

describe('translatedKeys', () => {
  it('finds the first argument of each call, both sides of a ternary, escapes undone', () => {
    const src = `t('Play'); t(on ? 'On' : "Off", { n }); t('It\\'s {n}', { n: 1 }); ts('Chat')`
    expect(translatedKeys(src)).toEqual(['Play', 'On', 'Off', "It's {n}"])
    expect(translatedKeys(src, 'ts')).toEqual(['Chat'])
    expect(translatedKeys(`t(n === '1' ? 'One' : 'Many'); t(el.getAttribute('title')!)`)).toEqual([
      'One',
      'Many',
    ])
  })

  it('skips other functions ending in t, methods and template literals with ${}', () => {
    expect(translatedKeys("split('a'); this.t('b'); t(`Hi ${name}`); t(`Plain`)")).toEqual(['Plain'])
  })
})

describe('untranslatedText', () => {
  it('flags English literals where text reaches the screen', () => {
    const src = [
      "h('p', { textContent: 'Game over' })",
      "button('Play again', go)",
      "iconButton(icons.pause, 'Pause', go)",
      "el.setAttribute('aria-label', 'Room code')",
      'toast(`${name} joined`)',
      "ctx.fillText('SCORE', 0, 0)",
      "h('label', { class: 'f' }, 'Your name', input)",
    ].join('\n')
    expect(untranslatedText(src)).toEqual([
      'Game over',
      'Room code',
      'Play again',
      '${name} joined',
      'SCORE',
      'Pause',
      'Your name',
    ])
  })

  it('passes translated text, symbols, numbers, comments and allowed names', () => {
    const src = [
      "h('p', { textContent: t('Game over') })",
      "button(t('Play'), go)",
      "h('span', { textContent: '×2' })",
      'toast(`${n}`)',
      "// h('p', { textContent: 'In a comment' })",
      "h('h1', { textContent: 'Play Forge' })",
    ].join('\n')
    expect(untranslatedText(src, new Set(['Play Forge']))).toEqual([])
  })
})
