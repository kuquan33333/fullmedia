# @fullmedia/api

Next.js App Router API/BFF for FULLMEDIA.

## Runtime

- Next.js 16.3.x.
- Node.js runtime (not Edge) because provider bootstrap uses PostgreSQL access and provider orchestration.
- PostgreSQL access through `PostgresSqlExecutor` implementing the framework-neutral `SqlExecutor` port from `@fullmedia/providers`.
- For Supabase transaction-pooler/serverless deployments, application-side DB pool defaults to 1 connection per warm instance.

## Provider bootstrap

At runtime:

1. Read `control.providers`, current `control.provider_configs`, and enabled `control.provider_capabilities`.
2. Apply optional `FULLMEDIA_PROVIDER_<CODE>_*` environment overrides.
3. Instantiate supported direct adapters (`OPHIM`, `KKPHIM`).
4. Register adapters in `ProviderRegistry`.
5. Use `DbProviderHealthStore` + `DefaultProviderSelector`.
6. Execute through `ProviderEngine`; retryable provider failure may fall back to the next healthy provider.

Registry config is cached in-process for `FULLMEDIA_PROVIDER_REGISTRY_TTL_MS` (default 30 seconds). This avoids a config query for every API request while allowing Admin changes to propagate without rebuilding clients.

## Canonical movie IDs

List/search results are normalized into `catalog.entities` + `catalog.media_titles` + `catalog.provider_refs` and return a provider-independent canonical UUID.

If a canonical movie has no mapping for a fallback provider, `CanonicalMovieResolver` searches that provider using canonical title/type/year, scores candidates conservatively, and persists a matching `provider_ref`. OPhim and KKPhim therefore do not need identical slugs.

For canonical movie requests, episode IDs are exposed as:

```text
<canonical-movie-uuid>:episode:<number>
```

Before playback, the BFF maps that stable episode number back to the selected provider's own episode ref. Playback descriptors are not cached.

## TV source model

The TV catalog is provider-independent. `catalog.tv_channels` owns stable channel UUIDs; stream locations live separately in private `control.playback_bindings`.

The supplied initial catalog contains 100 channel declarations. The repository stores metadata only; raw stream URLs are imported at runtime through the protected Admin API.

Every Admin `sourceKey` gets a separate provider identity, for example:

```text
luan9x    → IPTV_LUAN9X_<HASH>
backup-01 → IPTV_BACKUP_01_<HASH>
```

This allows multiple sources for the same channel, independent enable/disable controls, and source-level priority without changing client channel IDs.

Re-importing an existing `sourceKey` atomically replaces only that source provider's playback bindings. Other source providers remain intact as fallbacks.

Canonical TV responses expose `playable` and `sourceCount` so clients can disable Watch UI when a catalog channel currently has no stream source.

## Cache policy

The API uses bounded warm-instance TTL caches with in-flight deduplication:

- canonical movie/provider refs: 10 minutes by default;
- movie list: 60 seconds;
- movie search: 30 seconds;
- movie detail: 5 minutes;
- movie episodes: 2 minutes;
- TV channel list: 60 seconds;
- TV channel detail: 5 minutes;
- EPG response: 60 seconds;
- movie/TV playback: never cached.

See `.env.example` for runtime overrides.

## Public routes implemented

- `GET /api/v1/health`
- `GET /api/v1/movies`
- `GET /api/v1/movies?q=<keyword>`
- `GET /api/v1/movies/:ref`
- `GET /api/v1/movies/:ref/episodes`
- `POST /api/v1/movies/:ref/playback`
- `GET /api/v1/tv/channels`
- `GET /api/v1/tv/channels/:id`
- `GET /api/v1/tv/channels/:id/epg`
- `POST /api/v1/tv/channels/:id/playback`

Movie playback request body:

```json
{
  "episodeRef": "<canonical-movie-uuid>:episode:1"
}
```

`episodeRef` remains optional for single-source/single-episode titles.

## Internal / Admin routes

All routes below require:

```http
Authorization: Bearer <FULLMEDIA_INTERNAL_TOKEN>
```

Current endpoints:

- `POST /api/v1/internal/providers/health`
- `GET /api/v1/internal/admin/tv/sources`
- `POST /api/v1/internal/admin/tv/sources/import`
- `PATCH /api/v1/internal/admin/tv/sources/:sourceKey`

The internal token is an interim control-plane gate. The full Admin Web will later use authenticated Admin membership/role authorization.

### Import M3U

Preferred Admin upload:

```bash
curl -X POST \
  -H "Authorization: Bearer $FULLMEDIA_INTERNAL_TOKEN" \
  -F "sourceKey=luan9x" \
  -F "publish=true" \
  -F "basePriority=10" \
  -F "refreshIntervalMinutes=360" \
  -F "file=@playlist.m3u" \
  http://localhost:3000/api/v1/internal/admin/tv/sources/import
```

The response contains only counts, warnings, provider identity and an SHA-256 source fingerprint. It does not echo raw stream URLs or the uploaded playlist.

### Enable/disable or change source priority

```http
PATCH /api/v1/internal/admin/tv/sources/luan9x
Content-Type: application/json
```

```json
{
  "enabled": true,
  "priority": 10
}
```

Lower priority numbers are preferred.

## Local setup

Copy `.env.example` to `.env.local` and set `DATABASE_URL` to the local/staging Supabase PostgreSQL connection string.

From repository root:

```bash
corepack enable
pnpm install
pnpm verify
pnpm dev:api
```

`pnpm verify` runs workspace typechecks, fixture tests, and a production API build.

A manual-only GitHub Action also exists at `.github/workflows/manual-verify.yml`. It has only `workflow_dispatch`, so it does not run automatically on push.

Do not use `service_role`, database passwords, internal tokens, raw IPTV playlists, or provider secrets in any `NEXT_PUBLIC_*` variable.
