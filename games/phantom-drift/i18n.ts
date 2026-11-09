// Phantom Drift in Vietnamese. Keys are the English text as written in the
// code (with {placeholders}); anything missing shows in English.
import { translator, type Dictionary } from '@forge/core/i18n'

export const VI: Dictionary = {
  'Drift through the rift. Dodge, graze, go Phantom.': 'Lướt qua khe nứt. Né, sượt qua, hóa Bóng ma.',
  'Move with ←/→ or A/D, swipe, or tap either side. Space, ↑ or swipe up turns you Phantom when the ring is full.':
    'Di chuyển bằng ←/→ hoặc A/D, vuốt, hoặc chạm hai bên. Space, ↑ hoặc vuốt lên để hóa Bóng ma khi vòng đầy.',
  'Phantom Drift rift': 'Khe nứt Phantom Drift',
  // Run summary
  Distance: 'Quãng đường',
  Time: 'Thời gian',
  'Top speed': 'Tốc độ tối đa',
  Wisps: 'Đốm sáng',
  'Near misses': 'Né sát',
  'Best combo': 'Combo cao nhất',
  // Moments
  'DAREDEVIL!': 'LIỀU LĨNH!',
  'UNTOUCHABLE!': 'BẤT KHẢ XÂM PHẠM!',
  'GHOST LEGEND!': 'HUYỀN THOẠI BÓNG MA!',
  'MAX COMBO ×5!': 'COMBO TỐI ĐA ×5!',
  'SPEED UP! {kmh} km/h': 'TĂNG TỐC! {kmh} km/h',
  'THE RIFT WIDENS!': 'KHE NỨT MỞ RỘNG!',
  'PHANTOM!': 'BÓNG MA!',
  '{n} KM!': '{n} KM!',
  'NEW BEST!': 'KỶ LỤC MỚI!',
  'New best! {score} points': 'Kỷ lục mới! {score} điểm',
  '{score} points. Your best: {best}': '{score} điểm. Kỷ lục của bạn: {best}',
  // Characters (names and perks live in characters.ts)
  Wisp: 'Linh Hồn',
  Ember: 'Than Hồng',
  Frost: 'Băng Giá',
  Bloom: 'Hoa Nở',
  Shade: 'Bóng Tối',
  Gold: 'Hoàng Kim',
  'Balanced: no perk, pure skill': 'Cân bằng: không đặc quyền, chỉ có kỹ năng',
  'Hot streak: combo climbs every 4, not 5': 'Chuỗi nóng: combo tăng mỗi 4 lần, thay vì 5',
  'Cool head: Phantom lasts 2.5 s, not 2 s': 'Bình tĩnh: Bóng ma kéo dài 2,5 giây, thay vì 2 giây',
  'Regrowth: hearts regrow in 36 s, not 45 s': 'Hồi sinh: tim mọc lại sau 36 giây, thay vì 45 giây',
  'Close call: near misses come easier': 'Suýt soát: né sát dễ hơn',
  'Gold rush: wisps worth 12, Phantom needs 12': 'Cơn sốt vàng: đốm sáng được 12 điểm, Bóng ma cần 12',
}

export const t = translator(VI)
