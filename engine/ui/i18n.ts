import { translator, type Dictionary } from '../core/i18n'

/**
 * Vietnamese for the shared game shell (engine/app.ts: start screen, rooms,
 * pause, results) and the top-bar menus (language, sound, full screen).
 * Keys are the English text as written in the code; missing ones show in English.
 */
export const VI: Dictionary = {
  // Top bar
  'All games': 'Tất cả trò chơi',
  Pause: 'Tạm dừng',
  Leave: 'Rời đi',
  'Quit to menu': 'Thoát ra menu',
  'Leave room': 'Rời phòng',
  'Full screen': 'Toàn màn hình',
  'Exit full screen': 'Thoát toàn màn hình',
  // Landscape guard (engine/ui/landscape.ts)
  'Rotate your phone': 'Xoay ngang điện thoại',
  'This game plays sideways.': 'Trò chơi này cần màn hình ngang.',
  Language: 'Ngôn ngữ',
  'Language: {name}': 'Ngôn ngữ: {name}',
  Music: 'Nhạc',
  Effects: 'Hiệu ứng',
  '{label} volume': 'Âm lượng {label}',
  Off: 'Tắt',
  'Turn sound on': 'Bật âm thanh',
  'Mute everything': 'Tắt hết âm thanh',
  'Sound settings': 'Cài đặt âm thanh',

  // Start screen
  Player: 'Người chơi',
  'Your name': 'Tên của bạn',
  CODE: 'MÃ',
  'Room code': 'Mã phòng',
  'Room codes are 5 characters, like K7QXP.': 'Mã phòng gồm 5 ký tự, ví dụ K7QXP.',
  Play: 'Chơi',
  'Play solo': 'Chơi một mình',
  'Create room': 'Tạo phòng',
  Join: 'Vào',
  "or join a friend's room": 'hoặc vào phòng của bạn bè',
  'Loading…': 'Đang tải…',

  // Joining and connection
  'Joining {room}…': 'Đang vào phòng {room}…',
  "Still looking for this room. Check the code, and make sure the host's game is open.":
    'Vẫn đang tìm phòng này. Kiểm tra lại mã, và nhớ là chủ phòng đang mở game nhé.',
  'Finding the host. This usually takes a few seconds.': 'Đang tìm chủ phòng. Thường chỉ mất vài giây.',
  Cancel: 'Hủy',
  'Host disconnected': 'Chủ phòng mất kết nối',
  'Waiting for them to come back. If they reloaded, this takes a few seconds.':
    'Đang chờ chủ phòng quay lại. Nếu họ vừa tải lại trang thì chỉ mất vài giây.',
  'The host is back': 'Chủ phòng đã quay lại',
  'The room closed': 'Phòng đã đóng',
  'The host left the room. Create a new room to keep playing.':
    'Chủ phòng đã rời đi. Tạo phòng mới để chơi tiếp nhé.',
  'You are offline. Reconnecting when the network is back.': 'Bạn đang mất mạng. Sẽ kết nối lại khi có mạng.',
  'Back online': 'Đã có mạng lại',
  'You are offline. Check your connection.': 'Bạn đang mất mạng. Kiểm tra kết nối nhé.',
  '{name} joined': '{name} đã vào',
  '{name} lost connection': '{name} mất kết nối',
  '{name} is back': '{name} đã quay lại',
  '{name} left': '{name} đã rời đi',
  'Reopening room {room}': 'Đang mở lại phòng {room}',
  'Rejoining room {room}': 'Đang vào lại phòng {room}',

  // Room
  'Copy invite link': 'Sao chép link mời',
  'Invite link copied': 'Đã sao chép link mời',
  'Room code. Share it, or copy the link.': 'Mã phòng. Gửi cho bạn bè, hoặc sao chép link.',
  'Room code. Share it with friends.': 'Mã phòng. Gửi cho bạn bè nhé.',
  Open: 'Trống',
  'Reconnecting…': 'Đang kết nối lại…',
  Host: 'Chủ phòng',
  Ready: 'Sẵn sàng',
  'Not ready': 'Chưa sẵn sàng',
  '{name} (you)': '{name} (bạn)',
  '{game} room': 'Phòng {game}',
  'The room is full, so you are watching. You get a seat when one opens.':
    'Phòng đã đầy nên bạn đang xem. Có chỗ trống là bạn được vào chơi.',
  'Waiting for players. {game} needs at least {n}.': 'Đang chờ người chơi. {game} cần ít nhất {n} người.',
  'Waiting for {names} to reconnect.': 'Đang chờ {names} kết nối lại.',
  'Waiting for {names} to get ready.': 'Đang chờ {names} sẵn sàng.',
  'Invite friends with the code, or start on your own.': 'Mời bạn bè bằng mã phòng, hoặc tự chơi luôn.',
  'Everyone is ready.': 'Mọi người đã sẵn sàng.',
  'Start rematch': 'Đấu lại',
  'Start game': 'Bắt đầu',
  'Waiting for the host to start.': 'Đang chờ chủ phòng bắt đầu.',
  'Get ready so the host can start.': 'Sẵn sàng đi để chủ phòng bắt đầu.',
  "I'm ready": 'Sẵn sàng!',
  '{a} and {b}': '{a} và {b}',
  Gone: 'Đã rời',

  // Countdown, pause, results
  'Go!': 'Chiến!',
  Paused: 'Tạm dừng',
  Resume: 'Tiếp tục',
  'Play again': 'Chơi lại',
  'Back to menu': 'Về menu',
  'Game over': 'Kết thúc',

  // Control guide (engine/ui/guide.ts). Key names on keycaps stay as printed (Space, Esc, W…).
  'How to play': 'Cách chơi',
  'Got it': 'Đã hiểu',
  or: 'hoặc',
  hold: 'giữ',
  'Up arrow': 'Mũi tên lên',
  'Down arrow': 'Mũi tên xuống',
  'Left arrow': 'Mũi tên trái',
  'Right arrow': 'Mũi tên phải',
  Click: 'Nhấp chuột',
  'Hold the mouse button': 'Giữ chuột',
  'Drag with the mouse': 'Kéo chuột',
  Scroll: 'Cuộn chuột',
  'Right-click': 'Nhấp chuột phải',
  Tap: 'Chạm',
  'Double-tap': 'Chạm hai lần',
  'Touch and hold': 'Chạm và giữ',
  Swipe: 'Vuốt',
  'Swipe up': 'Vuốt lên',
  Drag: 'Kéo',
  'Drag on the left side': 'Kéo ở nửa trái màn hình',
  'Tap the button': 'Chạm nút',
}

export const t = translator(VI)
