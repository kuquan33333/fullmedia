# 24 — API/BFF Bootstrap, PostgreSQL Executor & Provider Tests

## 1. Status

**CLOSED / VERIFIED.** The owner ran the manual GitHub Actions verification on 2026-09-16 and reported PASS for the milestone before canonicalization work continued.

This milestone wires the existing Provider Engine into a real Next.js API/BFF application at `apps/api`.

Implemented and verified at milestone close:

- Next.js 16.3.x App Router API-only application.
- Node.js runtime for PostgreSQL access.
- `PostgresSqlExecutor` implementing the framework-neutral `SqlExecutor` port.
- Database-backed Provider bootstrap from `control.providers`, `control.provider_configs`, and `control.provider_capabilities`.
- OPhim + KKPhim registration.
- `DbProviderHealthStore` in the live selector path.
- Movie domain service.
- Public movie API routes.
- Protected internal provider health probe route.
- Fixture tests for OPhim/KKPhim normalization and Provider Engine fallback.
- Reference migration seeding real OPhim/KKPhim provider configuration.
- Manual-only verification workflow (`workflow_dispatch`).

No movie mock data is added to production paths.

---

## 2. Runtime architecture

```text
Mobile / Web
    ↓
apps/api Route Handler
    ↓
MovieService
    ↓
ProviderEngine
    ↓
ProviderRegistry
    ↓
DefaultProviderSelector
    ↓
DbProviderHealthStore
    ↓
OPhimProvider / KKPhimProvider
    ↓
External API
```

Provider configuration flow:

```text
Supabase PostgreSQL
  control.providers
  control.provider_configs
  control.provider_capabilities
        ↓
PostgresProviderConfigRepository
        ↓
EnvironmentOverlayProviderConfigRepository
        ↓
Provider bootstrap
        ↓
ProviderRegistry
```

Admin/provider configuration remains server-side. Client applications do not receive provider credentials or raw configuration.

---

## 3. `apps/api` structure at milestone close

```text
apps/api/
  app/
    api/v1/
      health/route.ts
      movies/route.ts
      movies/[ref]/route.ts
      movies/[ref]/episodes/route.ts
      movies/[ref]/playback/route.ts
      internal/providers/health/route.ts
  src/
    http/
      api-response.ts
      request-context.ts
    infrastructure/
      database.ts
      postgres-executor.ts
    providers/
      provider-runtime.ts
    services/
      movie-service.ts
  .env.example
  next.config.ts
  package.json
  tsconfig.json
```

Canonical catalog/cache additions implemented after this milestone are documented in `25_CANONICAL_MOVIE_RESOLVER_AND_CACHE.md`.

---

## 4. PostgreSQL executor

`PostgresSqlExecutor` adapts `pg.Pool` to the Provider Engine's `SqlExecutor` interface.

Responsibilities:

- parameterized queries;
- small serverless-friendly connection pool;
- transaction boundary with BEGIN / COMMIT / ROLLBACK;
- no provider-specific SQL inside the executor.

`DATABASE_URL` must remain server-only.

For Vercel/Supabase, use the appropriate Supabase pooler connection string rather than creating a large direct connection pool from every serverless instance.

---

## 5. Provider bootstrap

`getProviderRuntime()` performs lazy initialization and caches the registry in-process.

Default registry TTL: 30 seconds.

Environment override:

```text
FULLMEDIA_PROVIDER_REGISTRY_TTL_MS
```

Process:

1. Connect to PostgreSQL.
2. Load enabled MOVIES provider configs.
3. Apply `FULLMEDIA_PROVIDER_<CODE>_*` environment overrides.
4. Build the concrete adapter by provider code.
5. Register adapter.
6. Build health-aware selector.
7. Build Provider Engine.

Currently recognized concrete codes:

- `OPHIM`
- `KKPHIM`

Unknown providers are ignored until their concrete adapter is implemented.

---

## 6. Provider database seed

Migration:

`supabase/migrations/20260916181215_seed_movie_providers.sql`

It creates/updates real provider reference configuration for:

- OPhim: `https://ophim1.com`
- KKPhim: `https://phimapi.com`

It also enables:

- MOVIE_LIST
- MOVIE_SEARCH
- MOVIE_DETAIL
- MOVIE_EPISODES
- MOVIE_PLAYBACK

No secret is committed to source control.

---

## 7. Public Movie API

```http
GET /api/v1/health
GET /api/v1/movies
GET /api/v1/movies?q=keyword
GET /api/v1/movies/:ref
GET /api/v1/movies/:ref/episodes
POST /api/v1/movies/:ref/playback
```

The BFF returns canonical playback descriptors. Media bytes still flow source/CDN → player, not source → Vercel → player.

---

## 8. Internal provider health probe

```http
POST /api/v1/internal/providers/health
Authorization: Bearer <FULLMEDIA_INTERNAL_TOKEN>
```

This endpoint executes provider health checks, writes current state to `ops.provider_health`, appends health events and returns non-secret health snapshots.

---

## 9. Historical cross-provider compatibility

At milestone close, provider-prefixed refs such as `ophim:<slug>` and `kkphim:<slug>` were accepted and prefix-stripping allowed basic fallback when providers used the same slug.

That mechanism was explicitly interim. It has now been superseded by the canonical UUID/provider-ref implementation documented in `25_CANONICAL_MOVIE_RESOLVER_AND_CACHE.md`.

---

## 10. Tests at milestone close

Provider fixture tests validated:

- OPhim list/detail normalization;
- episode parsing;
- HLS playback mapping;
- subtitle mapping;
- embed alternatives;
- KKPhim contract compatibility;
- retryable OPhim failure → KKPhim fallback;
- fallback attempt metadata.

Fixtures are test-only and are not imported by production code.

---

## 11. Version pins

At implementation time:

- Next.js `16.3.5`
- React / React DOM `19.3.0`
- `pg` `8.23.0`
- Vitest `5.0.0`

Versions are pinned rather than using floating `latest` ranges.

---

## 12. Verification result

Manual verification command chain:

```bash
pnpm typecheck
pnpm test
pnpm build:api
```

Result reported by the owner: **PASS**.

The GitHub Actions workflow remains manual-only and must not gain automatic `push`/`pull_request` triggers unless the owner explicitly changes that policy.

---

## 13. Successor milestone

The next milestone is `25_CANONICAL_MOVIE_RESOLVER_AND_CACHE.md`, which replaces provider-slug identity with canonical UUIDs, provider-ref discovery and domain TTL caching.
