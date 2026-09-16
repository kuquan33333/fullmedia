# 07 — Football Tab Specification

## 1. Mục tiêu UX
Football là Sports Center chuyên dụng: score-first, fixture-first, competition-first. Không dùng poster-grid hoặc cấu trúc của Movies/TV.

## 2. Football Home
Header: title + notifications + avatar. Date switcher: Hôm qua / Hôm nay / Ngày mai và date picker.

Section ưu tiên:
1. Live now.
2. Upcoming today.
3. Favorites first nếu user theo dõi đội/giải.
4. Competition groups.
5. Recent results.

## 3. Match Card
Hiển thị competition, kickoff/local time, home/away crest + name, score/status, live minute khi có. CTA xem trực tiếp chỉ xuất hiện khi backend xác nhận có playback candidate hợp lệ.

## 4. Match Center
- Score header.
- Status/time.
- Event timeline: goal/card/substitution khi provider có.
- Stats: possession, shots, shots on target, corners, fouls.
- Lineups khi provider hỗ trợ.
- Standings context.
- Related fixtures.
- Watch CTA riêng, không nhúng stream mặc định nếu không có nguồn hợp lệ.

## 5. Competition Screen
Tabs/segments: Fixtures, Results, Standings, Teams. Season selector khi API hỗ trợ.

## 6. Favorites
User có thể follow team, competition, fixture. Reminder trước giờ bóng lăn được cấu hình trong notification preferences.

## 7. Data strategy
Tách hai interface:
- `FootballDataProvider`: fixtures, scores, standings, events, teams.
- `FootballStreamProvider`: playback candidates nếu có quyền.

Không buộc data provider và video provider là cùng nguồn.

## 8. Refresh
Live match sử dụng polling/realtime interval thích hợp với quota provider. Background app giảm frequency; không spam API. UI phải hiển thị `lastUpdatedAt` khi data có thể trễ.

## 9. Failure
Data stale vẫn hiển thị snapshot kèm dấu hiệu cập nhật; stream lỗi không được làm Match Center lỗi. Nếu không có stream, giữ stats/score bình thường.

## 10. Acceptance
- Live/upcoming/final phân biệt rõ.
- Timezone render đúng thiết bị/user setting.
- Không tự suy đoán score khi provider thiếu dữ liệu.
- Football home không dùng MoviePosterCard/TVChannelRow.