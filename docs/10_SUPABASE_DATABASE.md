# 10 — Supabase Database

## 1. Nguyên tắc
Supabase Auth quản lý identity; bảng domain dùng UUID internal. Mọi bảng user-owned bật RLS. Migration là source of truth, không chỉnh production schema thủ công mà không ghi migration.

## 2. Core tables
`profiles(id auth.users FK, display_name, avatar_url, locale, timezone, created_at, updated_at)`

`user_settings(user_id, autoplay_next, data_saver, notification_json, privacy_json)`

`devices(id, user_id, platform, push_token, last_seen_at)` nếu triển khai push.

## 3. Content canonicalization
`contents(id, domain, canonical_type, title, normalized_title, year, metadata_json, created_at)`

`content_provider_refs(id, content_id, provider_id, external_id, external_slug, metadata_hash, last_synced_at)`

Không nhất thiết persist toàn bộ catalog provider; có thể chỉ persist canonical entities khi user tương tác hoặc sync curated catalog.

## 4. User activity
- `watch_history(id,user_id,domain,content_id,external_ref,episode_ref,position_sec,duration_sec,last_watched_at)`
- `favorites(id,user_id,domain,target_type,target_id,created_at)`
- `watchlist(id,user_id,content_id,created_at)`
- unique constraints chống duplicate logic.

## 5. TV
`tv_channels`, `tv_channel_sources`, `tv_channel_groups`, `epg_programmes`, `epg_mappings`.

Source URL/credential nhạy cảm không expose qua direct Supabase client query. Public client đọc view/safe API DTO.

## 6. Football
`football_teams`, `football_competitions`, `football_provider_refs`, optional cached fixtures/standings nếu cần. Live data có thể cache server thay vì persist mọi update.

## 7. Providers/Admin
`providers`, `provider_configs`, `provider_health`, `provider_mappings`, `feature_flags`, `app_config`, `home_sections`, `admin_audit_logs`.

Secret material dùng secret manager/server-side strategy; DB chỉ lưu encrypted/ref phù hợp.

## 8. Roles
`profiles.role` không phải nguồn authorization duy nhất nếu dễ bị client sửa. Dùng custom claims/server verified admin membership. Roles dự kiến: user, support, editor, admin, super_admin.

## 9. RLS mẫu
- Profile: user select/update chính mình; admin qua server role.
- History/favorites/watchlist: chỉ owner CRUD.
- Provider config: không public select; chỉ backend/admin service.
- Public content views: chỉ field an toàn.

## 10. Database quality
Index theo user_id + timestamps, external provider refs, channel lookup, canonical search fields. Dùng updated_at triggers nhất quán. Migrations có rollback strategy khi khả thi.