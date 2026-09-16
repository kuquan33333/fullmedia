# FULLMEDIA Supabase

Thư mục này chứa schema PostgreSQL/Supabase versioned của FULLMEDIA.

## Migration order

Các file trong `supabase/migrations/` phải chạy theo timestamp tăng dần:

1. `20260916173001_init_extensions_and_schemas.sql`
2. `20260916173002_catalog_core.sql`
3. `20260916173003_movies.sql`
4. `20260916173004_tv.sql`
5. `20260916173005_football.sql`
6. `20260916173006_video.sql`
7. `20260916173007_provider_control_plane.sql`
8. `20260916173008_user_identity.sql`
9. `20260916173009_user_activity.sql`
10. `20260916173010_operations.sql`
11. `20260916173011_functions_and_triggers.sql`
12. `20260916173012_rls_and_grants.sql`
13. `20260916173013_indexes_and_constraints.sql`
14. `20260916173014_seed_reference_data.sql`

## Local verification

Yêu cầu Supabase CLI và Docker/local runtime phù hợp.

```bash
supabase --version
supabase start
supabase db reset
supabase migration list --local
supabase db advisors
```

Sau khi thêm database tests trong `supabase/tests/`:

```bash
supabase test db
```

Không push production trước khi `db reset`, migration list và security/advisor checks pass trên local/staging.

## Quy tắc migration

- Migration là source of truth; không chỉnh production schema thủ công rồi bỏ qua migration history.
- Migration mới phải tạo bằng `supabase migration new <descriptive_name>` trong môi trường phát triển có Supabase CLI.
- Không sửa migration đã chạy production; tạo migration mới để thay đổi schema.
- Không seed fake user, fake movie, fake TV channel hay fake football match vào production.
- `public.*` là vùng client-facing và bắt buộc RLS + explicit GRANT.
- `catalog.*`, `control.*`, `ops.*` là server-side/private theo kiến trúc hiện tại; không thêm vào Data API exposed schemas nếu chưa review lại grants/policies.
- `service_role`/secret key chỉ dùng ở backend; không đưa vào Expo bundle hoặc `NEXT_PUBLIC_*`.
- Provider API key/token không lưu plaintext trong public tables. `secret_ref` phải được resolve server-side bằng Vault hoặc secret manager phù hợp.

## Schema ownership

- `auth.*`: Supabase Auth quản lý.
- `public.*`: profile/settings/user activity.
- `catalog.*`: canonical Movies / TV / Football / YouTube.
- `control.*`: Provider Engine config, feature flags, app config, Admin membership.
- `ops.*`: provider health, ingestion, playback telemetry và audit.

## Provider principle

Client không tham chiếu trực tiếp OPhim/KKPhim/IPTV/football provider IDs trong business logic. Mọi nguồn ngoài được map vào canonical entity và Provider Engine thông qua `catalog.provider_refs`, `control.provider_*` và `control.playback_bindings`.
