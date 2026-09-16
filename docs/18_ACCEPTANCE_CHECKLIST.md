# 18 — Master Acceptance Checklist

## Product structure
- [ ] Mobile bottom có đúng 4 tab: Xem phim / TV / Bóng đá / YouTube.
- [ ] Không có Home chung trộn 4 domain.
- [ ] Avatar mở Account Center.
- [ ] Web có 4 domain navigation tương ứng.

## Movies
- [ ] UI poster/cinematic riêng.
- [ ] OPhim/KKPhim qua adapter, không gọi thẳng từ screen.
- [ ] Search/filter/detail/episodes hoạt động.
- [ ] Resume/history/watchlist hoạt động.
- [ ] Server fallback và error UX rõ.

## TV
- [ ] UI live/EPG riêng.
- [ ] M3U import preview/publish.
- [ ] EPG mapping.
- [ ] Channel drawer đổi kênh trong player.
- [ ] Multi-source fallback.

## Football
- [ ] UI score/fixture riêng.
- [ ] Date + timezone đúng.
- [ ] Match Center, standings/competition.
- [ ] Data và stream providers tách nhau.
- [ ] Không có stream vẫn dùng app bình thường.

## YouTube
- [ ] UI thumbnail/channel/shorts riêng.
- [ ] Không dùng MoviePosterCard.
- [ ] Không bypass quảng cáo/DRM.
- [ ] Error/embed restriction xử lý rõ.

## Admin
- [ ] Provider enable/disable.
- [ ] Edit endpoint/auth/header/priority/TTL/mapping theo capability.
- [ ] Test connection + preview normalized output.
- [ ] Config versioning/rollback.
- [ ] Audit logs.
- [ ] Quản lý Home/collections riêng từng domain.

## Supabase/Auth
- [ ] Register/login/logout/reset/verify.
- [ ] RLS cho mọi user-owned table.
- [ ] User A không truy cập dữ liệu User B.
- [ ] Service-role không xuất hiện client bundle.

## Playback
- [ ] State machine đầy đủ.
- [ ] Signed URL/token không log.
- [ ] Không proxy media qua Vercel mặc định.
- [ ] TV live reconnect có giới hạn.

## Quality
- [ ] lint pass.
- [ ] typecheck pass.
- [ ] tests pass.
- [ ] web production build pass.
- [ ] admin production build pass.
- [ ] mobile validation/build pass theo release stage.
- [ ] không còn mock data trong production path.
- [ ] loading/empty/error states đầy đủ.

## Release
- [ ] env production verified.
- [ ] provider rights/source notes reviewed.
- [ ] privacy/delete-account flow tested.
- [ ] observability/alerts enabled.
- [ ] rollback plan documented.
- [ ] smoke test iOS, Android, Web, Admin hoàn tất.