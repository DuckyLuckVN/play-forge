// Gloop Pop in Vietnamese. Keys are the English text as written in the code
// (with {placeholders}); anything missing shows in English.
import { translator, type Dictionary } from '@forge/core/i18n'

export const VI: Dictionary = {
  // Options
  'Playing alone': 'Chơi một mình',
  'Just me': 'Một mình',
  'Computer: easy': 'Đấu máy: dễ',
  'Computer: normal': 'Đấu máy: vừa',
  'Computer: hard': 'Đấu máy: khó',
  Computer: 'Máy',
  Speed: 'Tốc độ',
  Slow: 'Chậm',
  Medium: 'Vừa',
  Fast: 'Nhanh',
  'Start level': 'Màn bắt đầu',

  // Start screen and guide
  'Drop fizzy capsules, line up 4 of a colour and pop every gloop in the jar.':
    'Thả viên nang sủi bọt, xếp 4 ô cùng màu và nổ tung mọi con gloop trong lọ.',
  Move: 'Di chuyển',
  arrows: 'mũi tên',
  Turn: 'Xoay',
  'the jar': 'vào lọ',
  'Drop faster': 'Rơi nhanh',
  Drop: 'Thả ngay',
  down: 'xuống',
  '4 in a row of one colour pop': '4 ô cùng màu thẳng hàng sẽ nổ',
  'Pop every gloop to clear the jar. Chains score big!':
    'Nổ hết gloop để dọn sạch lọ. Nổ dây chuyền được nhiều điểm!',

  // Touch pad
  'Move left': 'Sang trái',
  'Move right': 'Sang phải',
  'Turn left': 'Xoay trái',
  'Turn right': 'Xoay phải',

  // Jar and panel
  'Gloop jar': 'Lọ gloop',
  Next: 'Tiếp theo',
  Level: 'Màn',
  Score: 'Điểm',
  Gloops: 'Gloop',
  Best: 'Kỷ lục',
  Out: 'Thua',
  Left: 'Đã rời',
  'Jar full!': 'Đầy lọ!',
  'Watch the others finish': 'Xem mọi người chơi tiếp',

  // Moments
  'Chain ×{n}!': 'Dây chuyền ×{n}!',
  'Jar clear!': 'Sạch lọ!',
  '+{n} bonus': '+{n} thưởng',
  'Level {n}': 'Màn {n}',
  'Pop every gloop!': 'Nổ hết gloop nào!',
  'Junk!': 'Rác rơi!',
  'Sent {n} junk!': 'Ném {n} rác!',
  "{name}'s jar is full!": 'Lọ của {name} đã đầy!',
  'Double!': 'Đôi!',
  'Triple!': 'Ba!',
  'Gloop-tastic!': 'Đỉnh của gloop!',
  'Last one!': 'Con cuối cùng!',

  // Results
  'New best! {score} points': 'Kỷ lục mới! {score} điểm',
  '{score} points. Your best: {best}': '{score} điểm. Kỷ lục của bạn: {best}',
  "It's a tie!": 'Hòa!',
  'You win!': 'Bạn thắng!',
  'The computer wins. Rematch?': 'Máy thắng rồi. Đấu lại nhé?',
  '{name} wins!': '{name} thắng!',
  'Gloops popped': 'Gloop đã nổ',
  'Best chain': 'Dây chuyền dài nhất',
  'Jars cleared': 'Lọ đã dọn',
}

export const t = translator(VI)
