# 17 — Roadmap P0–P12

Mỗi phase phải cập nhật checklist và docs trước khi đóng.

## P0 — Foundation
Monorepo, TypeScript, lint/format, env validation, CI skeleton, design tokens, shared contracts, Supabase local/config.
**Exit:** install + lint + typecheck + basic builds pass.

## P1 — Auth & App Shell
Supabase Auth, profile, 4-tab mobile navigation, web top nav, Account Center, route guards.
**Exit:** register/login/logout/reset + persistence hoạt động.

## P2 — Provider Engine Core
Registry, config schema, health, retry/fallback, canonical errors, cache abstraction, admin provider test skeleton.
**Exit:** sample/test provider có thể bật/tắt và fallback không đổi client.

## P3 — Movies
OPhim/KKPhim adapters, Movies Home, search/filter, detail, episodes, playback resolve, history/watchlist.
**Exit:** movie journey end-to-end thật, không mock.

## P4 — TV
M3U ingest, channel canonicalization, TV-specific UI, EPG, player/channel drawer, favorites/recent, source fallback.
**Exit:** import -> publish -> watch -> switch channel hoạt động.

## P5 — Football Data
Fixtures, scores, competition, standings, favorites, Match Center, refresh/cache strategy.
**Exit:** live/upcoming/final UI đúng và provider failure không crash.

## P6 — Football Playback
Legal/authorized stream provider interface, match playback resolve, no-source UX.
**Exit:** stream optional; data experience vẫn hoàn chỉnh khi không có stream.

## P7 — YouTube Video Hub
Curated/search strategy theo integration được phép, video cards, channels/playlists, player, Shorts UI.
**Exit:** YouTube domain độc lập, không bypass ads/DRM.

## P8 — Admin CMS Complete
Provider CRUD/versioning/test, Movies/TV/Football/YouTube management, home builders, users, flags, audit logs.
**Exit:** operator có thể thay cấu hình nguồn thông thường không sửa client.

## P9 — Notifications & Personalization
Push infrastructure, team/movie reminders, recent/favorites improvements, user preferences.

## P10 — Observability & Performance
Provider metrics, playback telemetry, caching tuning, list/image performance, error tracking.

## P11 — Security & Hardening
RLS audit, secret review, SSRF protections, rate limits, dependency audit, privacy/delete flows, chaos tests.

## P12 — Release
Store metadata/privacy, production env, disaster/rollback checklist, smoke tests iOS/Android/Web/Admin, release candidate sign-off.

## Phase rules
- Không nhảy phase bằng mock data.
- Có thể phát triển song song task độc lập nhưng acceptance của phase phải đủ.
- Nếu provider bên ngoài thay schema, sửa adapter/mapping chứ không đẩy logic đặc thù vào UI.