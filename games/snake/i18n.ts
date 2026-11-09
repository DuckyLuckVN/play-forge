// Snake in Vietnamese. Keys are the English text as written in the code
// (with {placeholders}); anything missing shows in English.
import { translator, type Dictionary } from '@forge/core/i18n'

export const VI: Dictionary = {
  // Start screen
  'Eat, grow, and be the last snake moving.': 'Ăn, lớn lên, và là con rắn cuối cùng còn bò.',
  'Steer with the arrow keys or WASD. On a phone, swipe.':
    'Lái bằng phím mũi tên hoặc WASD. Trên điện thoại, vuốt màn hình.',

  // Options
  Speed: 'Tốc độ',
  Slow: 'Chậm',
  Normal: 'Vừa',
  Fast: 'Nhanh',
  Turbo: 'Siêu tốc',

  // Results
  'You ate {n} apple': 'Bạn đã ăn {n} quả táo',
  'You ate {n} apples': 'Bạn đã ăn {n} quả táo',
  'Draw!': 'Hòa!',
  'You win!': 'Bạn thắng!',
  '{name} wins': '{name} thắng',
}

export const t = translator(VI)
