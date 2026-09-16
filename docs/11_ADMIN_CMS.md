# 11 — Admin CMS

## 1. Mục tiêu
Admin là control plane của FULLMEDIA. Người vận hành có thể quản lý nguồn và trải nghiệm mà không sửa client trong các thay đổi cấu hình thông thường.

## 2. Navigation
```text
Dashboard
Content
  Movies
  TV
  Football
  YouTube
Providers
  Movie Providers
  IPTV/EPG Providers
  Football Providers
  YouTube/Video Providers
Experience
  Movie Home Builder
  TV Groups
  Football Leagues
  YouTube Collections
  Feature Flags
Users
Notifications
Analytics
System
  App Config
  Health
  Audit Logs
```

## 3. Dashboard
Hiển thị provider health, playback failure rate, active users summary, recent admin changes và incidents. Không cần realtime phô trương nếu dữ liệu không đáng tin.

## 4. Provider Editor
Fields: name/code/type, enabled, endpoint, auth method, secret setter, headers, timeout, retries, priority, cache TTL, mapping, region tags. Actions: Save draft, Test connection, Preview normalized output, Publish, Disable, Rollback config version.

## 5. TV Admin
Import/preview M3U, dedupe channels, edit channel logo/name/group, map EPG, reorder sources, test playback candidate, publish channel.

## 6. Movies Admin
Quản lý providers, featured collections, hero selection, section order, denylist/hidden content nếu cần. Không bắt buộc copy toàn bộ provider catalog vào DB.

## 7. Football Admin
Enable competitions, map team/league aliases, data provider priority, stream provider policy, refresh settings, featured fixtures.

## 8. YouTube Admin
Curated channels/playlists/videos/categories, visibility, ordering, featured collections. Không có chức năng bypass ads.

## 9. User Admin
Search user, profile summary, account status, support actions được audit. Không hiển thị password; admin không thể đọc password.

## 10. Feature Flags/App Config
Flag có platform/min-version/percentage hoặc environment scope nếu cần. Config schema versioned để client cũ không crash khi config mới xuất hiện.

## 11. Audit
Mọi mutation nhạy cảm ghi actor, action, target, before/after redacted, IP/request metadata phù hợp, timestamp. Có filter/export cho điều tra vận hành.

## 12. Safety UX
Danger actions yêu cầu confirm rõ; secret rotation không show lại plaintext; test provider chạy server-side; publish tách khỏi save draft để tránh cấu hình lỗi ảnh hưởng production.