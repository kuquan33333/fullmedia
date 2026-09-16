# @fullmedia/providers

Provider Engine + infrastructure adapters for FULLMEDIA.

## Current layout

```text
packages/providers/src/
  core/                  Provider primitives, errors, BaseProvider
  contracts/             Canonical domain contracts/DTOs
  engine/                Provider selection + fallback
  registry/              Provider registry
  health/                In-memory + PostgreSQL-backed health stores
  infrastructure/
    db/                   SqlExecutor port
    http/                 Fetch transport with headers, timeout, retry
    config/               DB config repository + environment overlay
  adapters/
    movies/
      shared.ts
      movie-api-provider-base.ts
      ophim-provider.ts
      kkphim-provider.ts
```

## Typecheck

From repo root:

```bash
corepack enable
pnpm install
pnpm typecheck
```

The package intentionally has no runtime framework dependency. `SqlExecutor` is injected by `apps/api`; this keeps private `control` and `ops` PostgreSQL schemas off the public Data API.

## HTTP transport

`FetchHttpTransport` supports default/custom headers, server-side User-Agent, per-request timeout, AbortSignal, JSON/text responses, and bounded retry for timeout/429/5xx according to `RetryPolicy`.

## Provider config

`PostgresProviderConfigRepository` reads `control.providers`, current `control.provider_configs`, and enabled `control.provider_capabilities`. `EnvironmentOverlayProviderConfigRepository` can override operational fields with variables such as:

```text
FULLMEDIA_PROVIDER_OPHIM_BASE_URL
FULLMEDIA_PROVIDER_OPHIM_ENABLED
FULLMEDIA_PROVIDER_OPHIM_TIMEOUT_MS
FULLMEDIA_PROVIDER_OPHIM_PRIORITY
FULLMEDIA_PROVIDER_OPHIM_WEIGHT
FULLMEDIA_PROVIDER_OPHIM_CACHE_TTL_SECONDS
FULLMEDIA_PROVIDER_OPHIM_HEADERS_JSON
```

Secrets remain references (`secretRef`) and are not resolved inside this package.

## Health store

`DbProviderHealthStore` persists snapshots to `ops.provider_health`, events to `ops.provider_health_events`, and computes rolling error rate/average latency from events.

## Movie adapters

Default upstreams:

- OPhim: `https://ophim1.com`
- KKPhim: `https://phimapi.com`

Both normalize list/search/detail/episodes/playback into the shared `MovieProvider` contract. Playback prefers HLS (`link_m3u8`) and retains embed candidates as alternatives. Optional subtitle-like fields are normalized if the upstream includes them; the adapter never fabricates subtitles.

Callers should treat `Episode.externalId` as the adapter episode reference passed to `resolvePlayback`.
