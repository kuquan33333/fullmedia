# 06 — TV Tab Specification

## 1. Mục tiêu UX
TV là trải nghiệm live television, không phải thư viện poster. Người dùng phải vào kênh nhanh, biết đang phát gì, tiếp theo là gì và đổi kênh mà không thoát player.

## 2. TV Home
Layout ưu tiên:
1. Top bar: `Truyền hình`, search, avatar.
2. Mini/live player hoặc featured live channel nếu đã có recent channel.
3. Current programme card.
4. Category chips: Tất cả, VTV, HTV, VTC, THVL, Thể thao, Phim, Thiếu nhi, Quốc tế...
5. Channel list/grid tối ưu logo + EPG.
6. Favorites và Recent Channels có thể là section riêng.

## 3. Channel row
Phải có: logo, channel name, LIVE status, current programme, progress bar theo EPG nếu có, next programme optional. Không dùng poster phim.

## 4. IPTV ingest
Admin thêm source bằng URL/file cấu hình được phép. Parser hỗ trợ M3U/M3U8 metadata thông dụng: tvg-id, tvg-name, tvg-logo, group-title. Source import không tự động public; cần validate/preview/publish.

## 5. EPG
XMLTV hoặc provider adapter khác. Mapping dựa trên stable channel ID và manual override trong Admin. Nếu EPG stale thì hiển thị trạng thái không chắc chắn thay vì programme sai.

## 6. Player
- Fullscreen landscape.
- Channel Drawer overlay để đổi kênh không rời player.
- Previous/next channel.
- Current/next programme overlay.
- Multiple stream candidates cho cùng channel.
- Failover có giới hạn; tránh loop source lỗi.
- Reconnect logic cho live HLS.

## 7. Channel canonicalization
`tv_channels` là entity nội bộ. `tv_channel_sources` chứa provider/source URLs và priority. Một channel có N source candidates.

## 8. Favorites/recent
Favorite channel sync theo account. Recent channel lưu timestamp và last selected source chỉ như hint, không khóa source.

## 9. Acceptance
- Đổi kênh trong player <= vài thao tác, không quay về home bắt buộc.
- Một source fail không làm mất channel nếu source khác healthy.
- EPG absence không làm kênh biến mất.
- TV tab không có movie hero/poster carousel làm layout chính.