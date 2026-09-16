# 01 — Product Requirements

## 1. Persona chính
- Người xem phim cần tìm nhanh, tiếp tục xem và đổi server khi nguồn lỗi.
- Người xem TV cần vào kênh nhanh, xem EPG và đổi kênh không thoát player.
- Người theo dõi bóng đá cần biết trận đang live/sắp đá/kết quả, giải đấu và match center.
- Người xem YouTube cần video feed, tìm kiếm, playlist/channel và shorts theo trải nghiệm riêng.

## 2. Điều hướng mobile
Bottom Navigation luôn có 4 item theo thứ tự:
1. Xem phim
2. TV
3. Bóng đá
4. YouTube

Avatar ở góc phải top bar mở Account Center. Search là contextual: tìm kiếm trong domain hiện tại, không tự động trộn kết quả giữa 4 domain.

## 3. Account Center
- Đăng ký email/password.
- Đăng nhập/đăng xuất.
- Quên/đổi mật khẩu.
- Email verification.
- Hồ sơ: display name, avatar, ngôn ngữ, timezone.
- Watch history theo từng domain.
- Favorites.
- Movie watchlist.
- Favorite channels/teams/leagues.
- Device/session management cơ bản.
- Notification preferences.
- Privacy controls: xóa lịch sử, xóa tài khoản theo quy trình.

## 4. Search
Search phải có scope theo domain:
- Movies: title, original title, actor/director nếu metadata có, genre, country, year.
- TV: channel name, group, current programme.
- Football: club, competition, fixture.
- YouTube: query theo khả năng provider được phép.

Global Search có thể bổ sung sau nhưng không thay thế domain search.

## 5. Deep link
Chuẩn route logic:
- `/movies/:slug`
- `/movies/:slug/watch/:episode`
- `/tv/:channelId`
- `/football/match/:matchId`
- `/football/competition/:id`
- `/youtube/watch/:videoId`
- `/profile`

Mobile map các route này sang deep link tương ứng.

## 6. Notification
- Tập phim mới của nội dung đã theo dõi.
- Trận sắp bắt đầu của đội/giải yêu thích.
- Kênh/chương trình yêu thích bắt đầu nếu có EPG đáng tin cậy.
- Thông báo hệ thống do Admin gửi.
- Người dùng có thể tắt từng nhóm.

## 7. Error UX
Không hiện lỗi kỹ thuật thô. Chuẩn hóa:
- Source unavailable.
- Stream expired.
- Region restricted.
- Authentication required.
- Provider quota exceeded.
- No legal stream available.
Mỗi lỗi có CTA phù hợp: retry, change server, refresh, sign in hoặc quay lại.

## 8. Analytics events tối thiểu
`app_open`, `tab_view`, `search`, `content_open`, `play_request`, `play_start`, `play_error`, `play_complete`, `server_switch`, `favorite_add`, `watchlist_add`, `login_success`, `provider_fallback`.

Không gửi secret/provider token vào analytics.