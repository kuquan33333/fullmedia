# 08 — YouTube Tab Specification

## 1. Mục tiêu UX
YouTube là Video Hub riêng với thumbnail 16:9, channel identity, playlist và Shorts 9:16. Không copy layout Movies.

## 2. Nội dung được phép
FULLMEDIA chỉ dùng cơ chế playback/embedding và metadata phù hợp với điều khoản của YouTube hoặc nguồn mà chủ dự án có quyền sử dụng. Không xây ad-block/bypass quảng cáo, signature circumvention hay DRM bypass.

## 3. YouTube Home
- Top bar + contextual search + avatar.
- Category chips cấu hình được.
- Featured video rail.
- Recommended/curated feed.
- Playlist collections.
- Shorts horizontal rail hoặc dedicated feed.
- Channels section.

Admin có thể curate video/channel/playlist IDs và category mapping.

## 4. Video Card
Thumbnail 16:9, duration nếu được cung cấp hợp lệ, channel avatar/name, title, metadata. Card không có movie badges như episode/quality.

## 5. Shorts
Dedicated 9:16 immersive screen; swipe vertical; controls tối giản; back navigation rõ. Không tải xuống/re-host nội dung ngoài quyền sử dụng.

## 6. Player Screen
- Player 16:9.
- Title + channel.
- Action row của FULLMEDIA như favorite/save history nếu hợp lệ.
- Description metadata.
- Related/next videos.

## 7. Search
Provider abstraction cho search nếu cơ chế tích hợp cho phép. Nếu deployment chỉ dùng curated content thì search giới hạn trong catalog curated thay vì scrape tùy tiện.

## 8. History
Lưu internal reference/video ID, watched position khi integration cho phép, timestamp. Không lưu cookie/session nhạy cảm của YouTube ở backend.

## 9. Acceptance
- YouTube tab chạy độc lập với movie providers.
- Provider YouTube lỗi không ảnh hưởng Movies/TV/Football.
- Không hứa hoặc triển khai loại bỏ quảng cáo của YouTube.
- Không gọi private scraping endpoint từ client.