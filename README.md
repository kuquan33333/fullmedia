# FULLMEDIA

FULLMEDIA là nền tảng giải trí đa nguồn chạy trên iOS, Android và Web, với 4 trải nghiệm chính tách biệt hoàn toàn ở Bottom Navigation:

1. **Xem phim** — OTT/movie discovery, episode playback, watchlist, continue watching.
2. **TV** — IPTV/live channels, EPG, channel switching, favorites.
3. **Bóng đá** — live score, fixtures, standings, match center và nguồn xem hợp lệ khi có.
4. **YouTube** — video hub, channel/playlist/shorts thông qua các cơ chế phát hợp lệ của YouTube.

FULLMEDIA có một **Admin Web riêng** để quản lý nguồn, API, mapping, ưu tiên/fallback, nội dung nổi bật, feature flags, người dùng và cấu hình ứng dụng mà không phải thay đổi kiến trúc client.

## Nguyên tắc sản phẩm bắt buộc

- Không thiết kế chung một template rồi thay dữ liệu giữa 4 tab.
- Mỗi tab có navigation, layout, component, bộ lọc, trạng thái loading/error và player UX riêng.
- Mobile bottom navigation cố định: **Xem phim / TV / Bóng đá / YouTube**.
- Tài khoản/Profile mở từ avatar trên top bar, không chiếm tab bottom.
- Web giữ cùng 4 domain nhưng dùng top navigation responsive.
- Provider Engine là lớp chống phụ thuộc nguồn: client không gọi trực tiếp OPhim, KKPhim, IPTV hay football providers.
- URL, key, header, timeout, priority, fallback, mapping và feature flags được điều khiển từ Admin/DB.
- Không xây cơ chế bypass DRM, bypass quảng cáo YouTube hoặc nguồn stream không có quyền sử dụng.

## Kiến trúc mục tiêu

```text
apps/
  mobile/        Expo + React Native (iOS/Android)
  web/           Next.js user web
  admin/         Next.js admin CMS
  api/           Next.js API/BFF + provider orchestration
packages/
  ui/
  design-tokens/
  contracts/
  api-client/
  auth/
  database/
  providers/     Provider Engine + infrastructure + concrete adapters
  playback/
  analytics/
  config/
  testing/
  types/
supabase/
  migrations/    executable PostgreSQL/Supabase schema
docs/
```

Supabase chịu trách nhiệm Auth, PostgreSQL, RLS, user profile, history/watchlist/favorites, provider configuration, admin data và audit log. Web người dùng và Admin deploy lên Vercel. Mobile build iOS/Android qua Expo/EAS hoặc native CI tương ứng.

## Bộ tài liệu

- `docs/00_PROJECT_CHARTER.md`
- `docs/01_PRODUCT_REQUIREMENTS.md`
- `docs/02_INFORMATION_ARCHITECTURE.md`
- `docs/03_SYSTEM_ARCHITECTURE.md`
- `docs/04_UI_UX_DESIGN_SYSTEM.md`
- `docs/05_MOVIES_TAB_SPEC.md`
- `docs/06_TV_TAB_SPEC.md`
- `docs/07_FOOTBALL_TAB_SPEC.md`
- `docs/08_YOUTUBE_TAB_SPEC.md`
- `docs/09_PROVIDER_ENGINE.md`
- `docs/10_SUPABASE_DATABASE.md`
- `docs/11_ADMIN_CMS.md`
- `docs/12_PLAYBACK_STREAMING.md`
- `docs/13_SECURITY_COMPLIANCE.md`
- `docs/14_API_CONTRACTS.md`
- `docs/15_TESTING_QA.md`
- `docs/16_DEPLOYMENT_DEVOPS.md`
- `docs/17_ROADMAP_P0_P12.md`
- `docs/18_ACCEPTANCE_CHECKLIST.md`
- `docs/19_ARCHITECTURE_DATA_FLOW.md` — sơ đồ kiến trúc tổng thể, Control Plane/Data Plane và data flow chi tiết cho Phim, TV, Bóng đá, YouTube, Auth, playback, cache và provider fallback.
- `docs/20_DATABASE_ARCHITECTURE.md` — thiết kế PostgreSQL/Supabase production-ready: multi-schema, canonical entities, user data/RLS, Movies/TV/Football/YouTube, provider control-plane, health, ingestion, playback telemetry, indexes, migrations và ER/data flow.
- `docs/21_DATABASE_MIGRATIONS.md` — mapping giữa thiết kế DB và 14 migration SQL thật, security model, verification gate và quy tắc migration tiếp theo.
- `docs/22_PROVIDER_ENGINE_CODE_SCAFFOLD.md` — code khung Interface / Abstract Class, Registry, Selector, Health Store và fallback orchestration cho Provider Engine.
- `docs/23_PROVIDER_INFRASTRUCTURE_AND_MOVIE_ADAPTERS.md` — root monorepo, HTTP transport, Config Repository, DB Health Store và adapter thật OPhim/KKPhim.

## Database migrations

Schema executable nằm tại `supabase/migrations/` và hiện gồm 14 migration từ khởi tạo schema/extensions đến domain tables, Provider Engine control plane, user data, operations, triggers, RLS/grants, indexes và seed reference data.

Xem `supabase/README.md` trước khi chạy local/staging. Production không được push trước khi migration reset và security/advisor checks pass.

## Provider Engine

Code nằm tại `packages/providers/` và gồm contract riêng cho Movies, TV, Football Data, Football Stream và Video/YouTube; adapter không được tự fallback sang provider khác. Registry/health/selection/fallback do Provider Engine quản lý tập trung.

## Definition of Done tổng quát

Một phase chỉ được coi là hoàn tất khi:

- Code đúng tài liệu đã chốt.
- Không dùng mock data trong luồng production.
- Typecheck, lint và test bắt buộc pass.
- Web và Admin build production pass.
- Mobile build/dev-client không có lỗi blocker.
- RLS/security policy đã được test.
- Provider failure có fallback/error state rõ ràng.
- UI mobile được kiểm tra trên nhiều kích thước màn hình.
- Tài liệu và changelog được cập nhật trước khi chuyển phase.
