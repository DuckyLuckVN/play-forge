// Halo Guard in Vietnamese. Keys are the English text as written in the code
// (with {placeholders}); anything missing shows in English.
import { translator, type Dictionary } from '@forge/core/i18n'

export const VI: Dictionary = {
  'Turn the shield. Parry at the last instant. Let the sparks in.':
    'Xoay khiên. Đỡ đúng khoảnh khắc va chạm. Để tia sáng vàng bay vào.',
  'Face a lane with the arrows or WASD, or tap / swipe toward it. Turn just before impact for a perfect parry. Space or the ring fires Nova when full.':
    'Hướng khiên về một làn bằng phím mũi tên hoặc WASD, hoặc chạm / vuốt về phía đó. Xoay ngay trước va chạm để đỡ hoàn hảo. Space hoặc chạm vòng tròn để bung Nova khi đầy.',
  'Halo Guard arena': 'Đấu trường Halo Guard',
  TAP: 'CHẠM',
  perfect: 'hoàn hảo',
  // Run summary
  Time: 'Thời gian',
  Blocks: 'Lần đỡ',
  'Perfect parries': 'Đỡ hoàn hảo',
  'Perfect rate': 'Tỉ lệ hoàn hảo',
  Sparks: 'Tia sáng',
  'Best combo': 'Combo cao nhất',
  // Moments
  'FLAWLESS!': 'KHÔNG TÌ VẾT!',
  'UNBREAKABLE!': 'BẤT KHẢ PHÁ!',
  'HALO LEGEND!': 'HUYỀN THOẠI HÀO QUANG!',
  'MAX COMBO ×5!': 'COMBO TỐI ĐA ×5!',
  'FASTER!': 'NHANH HƠN!',
  'NOVA!': 'NOVA!',
  '{n} MIN!': '{n} PHÚT!',
  'NEW BEST!': 'KỶ LỤC MỚI!',
  'New best! {score} points': 'Kỷ lục mới! {score} điểm',
  '{score} points. Your best: {best}': '{score} điểm. Kỷ lục của bạn: {best}',
}

export const t = translator(VI)
