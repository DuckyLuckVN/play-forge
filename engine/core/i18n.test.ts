import { describe, expect, it } from 'vitest'
import { detectLang, format, translator } from './i18n'

describe('i18n', () => {
  it('fills {name} placeholders', () => {
    expect(format('Turn {n} · {who}', { n: 3, who: 'you' })).toBe('Turn 3 · you')
    expect(format('No params {n}')).toBe('No params {n}')
  })

  it('prefers the saved language, then the browser language, then English', () => {
    expect(detectLang('vi', 'en-US')).toBe('vi')
    expect(detectLang(null, 'vi-VN')).toBe('vi')
    expect(detectLang(null, 'fr-FR')).toBe('en')
    expect(detectLang('xx', undefined)).toBe('en')
  })

  it('translates through the dictionary and falls back to English', () => {
    const t = translator({ Shop: 'Cửa hàng', 'Turn {n}': 'Lượt {n}' }, 'vi')
    expect(t('Shop')).toBe('Cửa hàng')
    expect(t('Turn {n}', { n: 4 })).toBe('Lượt 4')
    expect(t('Missing')).toBe('Missing')
  })

  it('leaves English as written', () => {
    const t = translator({ Shop: 'Cửa hàng' }, 'en')
    expect(t('Shop')).toBe('Shop')
    expect(t('Turn {n}', { n: 4 })).toBe('Turn 4')
  })
})
