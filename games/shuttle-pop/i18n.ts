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
  'Chibi badminton. Time your swing for a Perfect, smash the high ones.':
    'Cầu lông chibi. Vung vợt đúng lúc để được Perfect, đập mạnh những quả cầu cao.',
  'Move with WASD or the arrow keys. Swing with Space, J or a click. Hold forward as you swing to smash or drive, back to clear, nothing to drop; left or right aims.':
    'Di chuyển bằng WASD hoặc phím mũi tên. Vung vợt bằng Space, J hoặc nhấp chuột. Giữ tiến khi vung để đập cầu hoặc tạt cầu, giữ lùi để đánh cầu cao sâu, không giữ để bỏ nhỏ; trái hoặc phải để nhắm hướng.',

  // Play
  'Shuttle Pop needs WebGL to run.': 'Shuttle Pop cần WebGL để chạy.',
  'Badminton court': 'Sân cầu lông',

  // Results
  '{name} wins!': '{name} thắng!',
  'Your opponent left. You win!': 'Đối thủ đã rời đi. Bạn thắng!',
  'You win {score}!': 'Bạn thắng {score}!',
  'The computer wins {score}. Rematch?': 'Máy thắng {score}. Đấu lại nhé?',
  '{name} wins {score}.': '{name} thắng {score}.',
  'Final score': 'Tỉ số chung cuộc',
}

export const t = translator(VI)
