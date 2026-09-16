# 24 — API/BFF Bootstrap, PostgreSQL Executor & Provider Tests

## 1. Status

This milestone wires the existing Provider Engine into a real Next.js API/BFF application at `apps/api`.

Implemented:

- Next.js 16.3.x App Router API-only application.
- Node.js runtime for PostgreSQL connection pooling.
- `PostgresSqlExecutor` implementing the framework-neutral `SqlExecutor` port.
- Database-backed Provider bootstrap from `control.providers`, `control.provider_configs`, and `control.provider_capabilities`.
- OPhim + KKPhim registration.
- `DbProviderHealthStore` in the live selector path.
- Movie domain service.
- Public movie API routes.
- Protected internal provider health probe route.
- Fixture tests for OPhim/KKPhim normalization and Provider Engine fallback.
- Reference migration seeding real OPhim/KKPhim provider configuration.

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

## 3. `apps/api` structure

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
      movie-service.test.ts
  .env.example
  next.config.ts
  package.json
  tsconfig.json
```

---

## 4. PostgreSQL executor

`PostgresSqlExecutor` adapts `pg.Pool` to the Provider Engine's `SqlExecutor` interface.

Responsibilities:

- parameterized queries;
- small serverless-friendly connection pool;
- transaction boundary with BEGIN / COMMIT / ROLLBACK;
- no provider-specific SQL inside the executor.

`DATABASE_URL` must remain server-only.

On Vercel/Supabase, prefer the appropriate Supabase pooler connection string rather than creating a very large direct connection pool from every serverless instance.

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

### Health

```http
GET /api/v1/health
```

### List

```http
GET /api/v1/movies
```

Supported query fields:

- `cursor`
- `limit`
- `type`
- `year`
- `genre`
- `country`

### Search

```http
GET /api/v1/movies?q=keyword
```

### Detail

```http
GET /api/v1/movies/:ref
```

### Episodes

```http
GET /api/v1/movies/:ref/episodes
```

### Resolve playback

```http
POST /api/v1/movies/:ref/playback
Content-Type: application/json
```

Body:

```json
{
  "episodeRef": "optional episode reference"
}
```

The BFF returns canonical playback descriptors. Media bytes still flow source/CDN → player, not source → Vercel → player.

---

## 8. Internal provider health probe

```http
POST /api/v1/internal/providers/health
Authorization: Bearer <FULLMEDIA_INTERNAL_TOKEN>
```

This endpoint:

1. executes provider health checks;
2. writes current state to `ops.provider_health`;
3. appends health events to `ops.provider_health_events`;
4. returns non-secret health snapshots.

If `FULLMEDIA_INTERNAL_TOKEN` is not configured, the route cannot be authorized.

This endpoint can later be called by a controlled Cron/worker after infrastructure is configured.

---

## 9. Cross-provider movie references

Current adapters expose IDs such as:

```text
ophim:movie-slug
kkphim:movie-slug
```

Before calling Provider Engine for detail/episodes/playback, the BFF strips known provider prefixes so a retryable OPhim failure may fall back to KKPhim when both sources use the same slug.

This is an interim compatibility layer only.

Final canonicalization must use:

- `catalog.entities`
- `catalog.provider_refs`

for titles where provider slugs/IDs differ.

Do not expand the prefix-strip approach into a permanent canonical identity system.

---

## 10. Tests

Provider tests live at:

`packages/providers/src/adapters/movies/movie-providers.test.ts`

They validate:

- OPhim list normalization;
- OPhim detail normalization;
- episode parsing;
- HLS playback mapping;
- subtitle mapping;
- embed alternative mapping;
- KKPhim canonical DTO compatibility;
- retryable OPhim failure → KKPhim fallback;
- fallback attempt metadata.

BFF test:

`apps/api/src/services/movie-service.test.ts`

It validates known provider-prefix normalization.

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

## 12. Required verification before production

Run from repository root after dependencies are installed:

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm test
pnpm build:api
```

Database/staging verification:

```bash
supabase db reset
supabase db advisors
```

Then test against a staging Supabase project and real provider endpoints.

Required manual/API checks:

1. `GET /api/v1/health` returns 200.
2. Movie list returns canonical objects.
3. Search returns canonical objects.
4. Detail resolves from primary provider.
5. Episodes contain stable provider episode references.
6. Playback returns HLS when upstream exposes `link_m3u8`.
7. Provider fallback works when the primary returns retryable network/5xx/429 failure.
8. No provider API secret appears in responses or logs.
9. Internal health endpoint rejects missing/wrong token.

---

## 13. Next implementation milestone

After this milestone passes local/staging gates:

1. Implement canonical movie resolver backed by `catalog.entities` + `catalog.provider_refs` so fallback works even when slugs differ.
2. Add server cache for catalog/detail responses with domain-specific TTL.
3. Add Admin provider test/reload endpoints with role authorization and audit log.
4. Add IPTV M3U + XMLTV adapters.
5. Continue P3/P4 Movie catalog and Playback integration into web/mobile clients.
