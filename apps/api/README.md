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
3. Instantiate supported adapters (`OPHIM`, `KKPHIM`).
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

## Cache policy

The API uses bounded warm-instance TTL caches with in-flight deduplication:

- canonical movie/provider refs: 10 minutes by default;
- movie list: 60 seconds;
- search: 30 seconds;
- detail: 5 minutes;
- episodes: 2 minutes;
- playback: never cached.

See `.env.example` for runtime overrides.

## Routes implemented

- `GET /api/v1/health`
- `GET /api/v1/movies`
- `GET /api/v1/movies?q=<keyword>`
- `GET /api/v1/movies/:ref`
- `GET /api/v1/movies/:ref/episodes`
- `POST /api/v1/movies/:ref/playback`
- `POST /api/v1/internal/providers/health` — requires `Authorization: Bearer <FULLMEDIA_INTERNAL_TOKEN>`.

Playback request body:

```json
{
  "episodeRef": "<canonical-movie-uuid>:episode:1"
}
```

`episodeRef` remains optional for single-source/single-episode titles.

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

Do not use `service_role`, database passwords, internal tokens, or provider secrets in any `NEXT_PUBLIC_*` variable.
