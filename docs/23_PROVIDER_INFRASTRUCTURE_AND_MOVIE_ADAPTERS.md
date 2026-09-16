# 23 — Provider Infrastructure + OPhim / KKPhim Adapters

## Status

Implemented TypeScript scaffold under `packages/providers/src/` and verified with root `tsc -b`.

## Root workspace

The repository now has a pnpm workspace and solution-style TypeScript configuration:

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `tsconfig.json`
- `packages/providers/tsconfig.json`

Run `corepack enable && pnpm install && pnpm typecheck`.

## Infrastructure

### HTTP

`infrastructure/http/http-transport.ts` wraps native Fetch. It provides custom/default headers, optional User-Agent, timeout via AbortController, external AbortSignal forwarding, retry with bounded exponential backoff + jitter, retry classification for 429/5xx/timeouts, and canonical transport errors.

### Config repository

`infrastructure/config/provider-config-repository.ts` reads the provider control-plane tables through an injected `SqlExecutor`. It maps database rows to `ProviderRuntimeConfig` and supports environment overrides per provider code. Private provider schemas therefore do not need to be exposed through Supabase PostgREST.

### Health

`health/db-health-store.ts` persists current state to `ops.provider_health`, appends probe events to `ops.provider_health_events`, and computes rolling error-rate/latency metrics. If the injected executor supports transactions, snapshot+event writes are executed in one transaction.

## OPhim

Default base URL: `https://ophim1.com`.

Implemented operations:

- list: `/v1/api/danh-sach/{type}`
- search: `/v1/api/tim-kiem`
- detail: `/v1/api/phim/{slug}`
- episodes/playback: parsed from detail response
- health: `/v1/api/home`

Adapter normalizes OPhim metadata, categories/countries, episode refs, `link_m3u8`, `link_embed`, and optional subtitle-like track fields.

## KKPhim

Default base URL: `https://phimapi.com`.

Implemented operations:

- list: `/v1/api/danh-sach` or `/v1/api/danh-sach/{type}`
- search: `/v1/api/tim-kiem`
- detail: `/phim/{slug}`
- episodes/playback: parsed from `episodes[].server_data[]`
- health: `/v1/api/home`

The parser accepts both root-level and nested `data` response forms so upstream version differences do not leak into client DTOs.

## Playback normalization

The canonical `PlaybackCandidate` now supports optional `subtitles`. HLS candidates are created from `link_m3u8`, embed candidates from `link_embed`; no stream URL or subtitle is invented when the provider does not return one.

## Provider rules

- Adapters never call one another.
- Retry inside one upstream is bounded by HTTP transport policy.
- Cross-provider fallback remains owned by `ProviderEngine`.
- Schema mismatch is non-retryable for that adapter request.
- Network, timeout, 429 and upstream 5xx are retryable and may fall back to another provider after local retries are exhausted.
- Provider secrets remain server-side references.

## Next step

Wire a concrete `SqlExecutor` in `apps/api`, load configs from the DB, register OPhim/KKPhim instances in `ProviderRegistry`, record scheduled health checks through `DbProviderHealthStore`, and add fixture-based parser/unit tests before P3 is declared complete.
