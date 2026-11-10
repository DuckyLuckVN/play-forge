// Shuttle Pop in Vietnamese. Keys are the English text as written in the code
// (with {placeholders}); anything missing shows in English.
import { translator, type Dictionary } from '@forge/core/i18n'

export const VI: Dictionary = {
  // Options
  'Playing alone': 'Chơi một mình',
  'Easy AI': 'Máy dễ',
  'Normal AI': 'Máy vừa',
  'Hard AI': 'Máy khó',

  // Players
  Computer: 'Máy',

  // Start screen
  'Chibi badminton. Time your swing for a Perfect, smash on high balls. Play the computer or a friend online.':
    'Cầu lông chibi. Vung vợt đúng lúc để được Perfect, đập mạnh khi cầu cao. Chơi với máy hoặc với bạn bè trực tuyến.',
  // Control guide (main.ts)
  Move: 'Di chuyển',
  'left side': 'nửa trái',
  Swing: 'Vung vợt',
  'Tap for a quick swing': 'Nhấn nhanh để vung nhẹ',
  'Power shot': 'Cú đánh mạnh',
  'Let go to hit. You move slower while charging, and much slower for a moment after a full-power swing.':
    'Thả ra để đánh. Khi tích lực bạn đi chậm hơn, và chậm hẳn trong giây lát sau cú đánh mạnh tối đa.',
  'Smash or drive': 'Đập cầu hoặc tạt cầu',
  'as you swing': 'khi vung vợt',
  'Clear (high and deep)': 'Đánh cầu cao sâu',
  'Aim left or right': 'Nhắm trái hoặc phải',
  'Drop shot': 'Bỏ nhỏ',
  'Swing with no direction held': 'Vung vợt khi không giữ hướng nào',
  'Pick the shot': 'Chọn cú đánh',
  'Stick forward: smash or drive. Back: clear. Sideways: aim. Centred: drop.':
    'Cần tiến: đập hoặc tạt cầu. Lùi: cầu cao sâu. Sang ngang: nhắm hướng. Ở giữa: bỏ nhỏ.',

  // Character picker (preset names in actors.ts)
  'Choose your player': 'Chọn nhân vật',
  Berry: 'Dâu',
  Cloud: 'Mây',
  Sunny: 'Nắng',
  Mint: 'Bạc Hà',
  Cat: 'Mèo',
  Bunny: 'Thỏ',
  Panda: 'Gấu Trúc',
  Fox: 'Cáo',
  Dragon: 'Rồng Con',
  Slime: 'Thạch Nhầy',
  Robot: 'Rô-bốt',
  Ghost: 'Ma Nhỏ',

  // Play
  'Shuttle Pop needs WebGL to run.': 'Shuttle Pop cần WebGL để chạy.',
  'Badminton court': 'Sân cầu lông',

  // In-match overlay (hud.ts, scoreboard.ts): timing pops, badges, the board
  'Power!': 'Siêu mạnh!',
  'Perfect!': 'Hoàn hảo!',
  Good: 'Tốt',
  Late: 'Trễ',
  Miss: 'Hụt',
  'Your serve': 'Lượt bạn giao cầu',
  'Match point': 'Điểm quyết định',
  // Scoreboard (scoreboard.ts)
  'Deuce: win by 2': 'Hòa: phải hơn 2 điểm',
  'Next point wins': 'Ai ghi điểm tiếp sẽ thắng',

  // Results
  '{name} wins!': '{name} thắng!',
  'Your opponent left. You win!': 'Đối thủ đã rời đi. Bạn thắng!',
  'You win {score}!': 'Bạn thắng {score}!',
  'The computer wins {score}. Rematch?': 'Máy thắng {score}. Đấu lại nhé?',
  '{name} wins {score}.': '{name} thắng {score}.',
  'Final score': 'Tỉ số chung cuộc',
  'Longest rally': 'Pha cầu dài nhất',
  '{n} shot': '{n} cú đánh',
  '{n} shots': '{n} cú đánh',
  'Your Perfect hits': 'Cú Hoàn hảo của bạn',
  'Perfect hits': 'Cú Hoàn hảo',
}

export const t = translator(VI)
