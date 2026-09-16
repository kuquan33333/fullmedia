# @fullmedia/api

Next.js App Router API/BFF for FULLMEDIA.

## Runtime

- Next.js 16.3.x.
- Node.js runtime (not Edge) because provider bootstrap uses PostgreSQL connection pooling.
- PostgreSQL access through `PostgresSqlExecutor` implementing the framework-neutral `SqlExecutor` port from `@fullmedia/providers`.

## Provider bootstrap

At runtime:

1. Read `control.providers`, current `control.provider_configs`, and enabled `control.provider_capabilities`.
2. Apply optional `FULLMEDIA_PROVIDER_<CODE>_*` environment overrides.
3. Instantiate supported adapters (`OPHIM`, `KKPHIM`).
4. Register adapters in `ProviderRegistry`.
5. Use `DbProviderHealthStore` + `DefaultProviderSelector`.
6. Execute through `ProviderEngine`; retryable provider failure may fall back to the next healthy provider.

Registry config is cached in-process for `FULLMEDIA_PROVIDER_REGISTRY_TTL_MS` (default 30 seconds). This avoids a config query for every API request while allowing Admin changes to propagate without rebuilding clients.

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
  "episodeRef": "optional-provider-episode-ref"
}
```

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
