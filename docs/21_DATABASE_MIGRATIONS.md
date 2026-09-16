# 21 — Executable Supabase Database Migrations

Tài liệu này liên kết thiết kế ở `20_DATABASE_ARCHITECTURE.md` với schema SQL thật trong `supabase/migrations/`.

## 1. Trạng thái

Đã tạo 14 migration theo đúng thứ tự phụ thuộc từ schema nền đến RLS/index/seed. Đây là schema khởi tạo cho P0/P1 và là source of truth để dựng Supabase local/staging.

## 2. Migration map

| # | Migration | Trách nhiệm |
|---|---|---|
| 01 | `init_extensions_and_schemas` | `extensions`, `catalog`, `control`, `ops`, `private`; pg_trgm/unaccent; khóa schema private |
| 02 | `catalog_core` | canonical `entities`, `genres` |
| 03 | `movies` | movie/series/seasons/episodes/genre join |
| 04 | `tv` | TV groups/channels/EPG programmes |
| 05 | `football` | competitions/teams/matches/events/standings |
| 06 | `video` | video channels/items/playlists |
| 07 | `provider_control_plane` | providers/config/mapping/capabilities/refs, playback bindings, IPTV, feature flags, app config, admin memberships |
| 08 | `user_identity` | profiles/settings/devices/notification preferences |
| 09 | `user_activity` | watch history/favorites/watchlist |
| 10 | `operations` | provider health, ingestion, cursors, playback telemetry, admin audit |
| 11 | `functions_and_triggers` | Auth provisioning + `updated_at` triggers |
| 12 | `rls_and_grants` | RLS, grants, user ownership policies, private schema lockdown |
| 13 | `indexes_and_constraints` | search/performance/uniqueness/partial indexes |
| 14 | `seed_reference_data` | safe default app config, feature flags và TV group reference data |

## 3. Canonical implementation decisions

Một số quyết định implementation được khóa rõ hơn tài liệu khái niệm ban đầu:

- Provider-specific IDs của Movies/TV/Football/YouTube nằm trong `catalog.provider_refs`, thay vì lặp `external_*` trên từng domain table.
- `catalog.video_channels`, `video_items`, `video_playlists` giữ canonical metadata; external YouTube/provider IDs đi qua `provider_refs`.
- Episode uniqueness được bảo vệ bằng expression unique index để xử lý `season_id IS NULL`.
- Watch history dùng expression unique index theo `user + entity + nullable episode` để resume/upsert ổn định.
- Chỉ một `provider_configs.is_current = true` được phép cho mỗi provider qua partial unique index.
- `control` và `ops` không có client policies; chỉ backend/service role truy cập.
- `private.handle_new_user()` là `SECURITY DEFINER`, đặt trong schema không exposed, `search_path=''`, và execute bị revoke khỏi client roles.

## 4. Security model

`public.*`:

- RLS bắt buộc.
- `anon` không được DML user data.
- `authenticated` chỉ được thao tác row của chính `auth.uid()`.
- UPDATE có cả `USING` và `WITH CHECK`.

`catalog/control/ops`:

- revoke quyền `anon/authenticated`.
- bật RLS defense-in-depth.
- cấp DML cho `service_role` phục vụ BFF/worker.

Secret:

- database chỉ giữ `secret_ref`.
- secret thật phải nằm ở Supabase Vault hoặc server secret manager.
- không expose service-role/secret key trong mobile/browser.

## 5. Verification gate

Trước khi kết nối staging/production phải chạy:

```bash
supabase start
supabase db reset
supabase migration list --local
supabase db advisors
```

Sau khi có RLS tests:

```bash
supabase test db
```

Không coi migration là production-ready nếu local reset hoặc advisor/security checks chưa pass.

## 6. Future migration rules

Từ migration tiếp theo trở đi:

```bash
supabase migration new <descriptive_name>
```

Không đổi nội dung migration đã chạy production. Mọi thay đổi schema/provider model/RLS/index phải đi bằng migration mới và cập nhật tài liệu tương ứng.
