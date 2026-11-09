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
  'Move with WASD or the arrow keys. Swing with Space, J or a click. Hold forward as you swing to smash or drive, back to clear, nothing to drop; left or right aims.':
    'Di chuyển bằng WASD hoặc phím mũi tên. Vung vợt bằng Space, J hoặc nhấp chuột. Giữ tiến khi vung để đập cầu hoặc tạt cầu, giữ lùi để đánh cầu cao sâu, không giữ để bỏ nhỏ; trái hoặc phải để nhắm hướng.',

  // Character picker (preset names in actors.ts)
  'Choose your player': 'Chọn nhân vật',
  Berry: 'Dâu',
  Cloud: 'Mây',
  Sunny: 'Nắng',
  Mint: 'Bạc Hà',

  // Play
  'Shuttle Pop needs WebGL to run.': 'Shuttle Pop cần WebGL để chạy.',
  'Badminton court': 'Sân cầu lông',

  // In-match overlay (hud.ts): timing pops, badges
  'Perfect!': 'Hoàn hảo!',
  Good: 'Tốt',
  Late: 'Trễ',
  Miss: 'Hụt',
  'Your serve': 'Lượt bạn giao cầu',
  '{name} serves': '{name} giao cầu',
  'Match point': 'Điểm quyết định',

  // Results
  '{name} wins!': '{name} thắng!',
  'Your opponent left. You win!': 'Đối thủ đã rời đi. Bạn thắng!',
  'You win {score}!': 'Bạn thắng {score}!',
  'The computer wins {score}. Rematch?': 'Máy thắng {score}. Đấu lại nhé?',
  '{name} wins {score}.': '{name} thắng {score}.',
  'Final score': 'Tỉ số chung cuộc',
  'Longest rally': 'Pha cầu dài nhất',
  '{n} shots': '{n} cú đánh',
  'Your Perfect hits': 'Cú Hoàn hảo của bạn',
  'Perfect hits': 'Cú Hoàn hảo',
}

export const t = translator(VI)
