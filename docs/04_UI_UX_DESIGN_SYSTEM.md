# 04 — UI/UX & Design System

## 1. Hướng thẩm mỹ
Dark cinematic, rõ nội dung, không neon quá mức, ưu tiên khả năng đọc. Dùng một core design system nhưng bốn domain có visual grammar riêng.

## 2. Core tokens
- Spacing scale: 4/8/12/16/20/24/32/40.
- Radius: 8 control nhỏ, 12 card, 16 hero/modal.
- Typography: Display, H1, H2, Body, Caption, Score numerals.
- Touch target >= 44pt iOS và tương đương Android.
- Safe-area bắt buộc cho bottom nav/player.
- Contrast đạt mức dễ đọc; không dùng text xám quá tối trên nền đen.

## 3. Bottom Navigation
Thứ tự cố định: `Xem phim`, `TV`, `Bóng đá`, `YouTube`.
- 4 item cân đều.
- Active có icon + label rõ và capsule/background nhẹ.
- Không animation phức tạp làm chậm chuyển tab.
- Badge chỉ cho thông báo có ý nghĩa.

## 4. Domain visual grammar
### Movies
Poster 2:3, cinematic backdrop, collection rails, continue progress.

### TV
16:9 player-first, logo/channel rows, EPG timeline, LIVE badge, channel drawer.

### Football
Score-first, crest/team names, live minute, competition grouping, stats/timeline; tuyệt đối không poster-grid.

### YouTube
Thumbnail 16:9, avatar channel, metadata text, shorts 9:16, playlist stack; không dùng MoviePosterCard.

## 5. Component boundaries
Shared chỉ cho primitive: Button, Text, Icon, Sheet, Modal, Skeleton, ErrorState, Avatar.

Domain components phải riêng:
- MoviePosterCard, MovieHero, EpisodeRow.
- TVChannelRow, EPGRow, ChannelDrawer.
- FootballMatchCard, ScoreHeader, EventTimeline, StandingsTable.
- YouTubeVideoCard, YouTubeShortCard, ChannelHeader, PlaylistCard.

Không tạo `GenericContentCard` chứa hàng chục props để phục vụ tất cả domain.

## 6. Motion
- 150–220ms cho transition nhỏ.
- Player fullscreen dùng native transition khi có.
- Skeleton không nhấp nháy mạnh.
- Respect Reduce Motion.

## 7. Responsive
Mobile-first; tablet tăng số cột/rail density; web desktop có max content width hợp lý. TV/player ưu tiên chiều rộng hơn poster sections.

## 8. Accessibility
Screen reader labels cho icon, score, live state; focus order hợp lý trên web; dynamic type không phá layout; color không phải tín hiệu duy nhất.