# 05 — Movies Tab Specification

## 1. Mục tiêu UX
Tạo trải nghiệm OTT chuyên dụng để khám phá, xem tiếp và phát phim nhanh. Nguồn backend có thể là OPhim, KKPhim hoặc provider khác nhưng người dùng không phải hiểu provider topology.

## 2. Movies Home
Thứ tự section mặc định:
1. Top bar: logo/title + search + avatar.
2. Cinematic Hero 1–5 item.
3. Continue Watching (chỉ hiện khi có dữ liệu).
4. Trending/Hot.
5. Phim bộ mới.
6. Phim lẻ mới.
7. Anime.
8. Theo thể loại/quốc gia động.
9. Top 10.

Admin có thể reorder/enable/disable section bằng Home Composition config nhưng chỉ trong domain Movies.

## 3. Movie card
Poster 2:3; title tối đa 2 dòng; badges nhỏ cho year/quality/episode khi có; favorite action không che poster. Continue card phải hiển thị progress và episode context.

## 4. Search & filters
- Debounced search.
- Recent searches local/account sync tùy chọn.
- Filters: type, genre, country, year, status.
- Sort: relevance, updated, release year khi provider hỗ trợ.

## 5. Detail screen
- Backdrop + gradient.
- Poster + title/original title.
- Metadata: year, duration, country, genre, status.
- CTA: Xem ngay/Tiếp tục xem, + Watchlist.
- Synopsis.
- Cast/crew nếu có.
- Episode/server selector.
- Related movies.

## 6. Canonical movie merge
Nếu OPhim và KKPhim cùng có một title, backend có thể canonicalize dựa trên normalized title/year/metadata. Không merge mù khi confidence thấp. External IDs được lưu trong `content_provider_refs`.

## 7. Playback UX
- Chọn episode → backend trả danh sách playback candidates đã normalize.
- Auto-select candidate healthy có priority tốt nhất.
- User có thể đổi server.
- Lỗi phát có CTA `Thử server khác`.
- Resume position được lưu định kỳ và khi app background/exit player.
- Episode auto-next tùy setting.

## 8. History/watchlist
History ghi canonical content ID + episode + position + duration + last_watched_at. Watchlist độc lập history.

## 9. Acceptance
- Source A lỗi nhưng source B còn hoạt động thì detail/player vẫn dùng được.
- Không hiển thị raw provider JSON.
- Scroll position được giữ khi quay lại từ detail.
- Không trộn channel/football/video cards vào Movies Home.