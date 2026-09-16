# 22 — Provider Engine Code Scaffold

## Status

Initial framework-agnostic TypeScript scaffold lives at `packages/providers/`.

## Design rule

Provider adapters normalize one upstream source. They do not select or call fallback providers. Selection/fallback is exclusively owned by `ProviderEngine`.

## Layers

```text
Domain Service
    ↓
ProviderEngine
    ↓
ProviderRegistry
    ↓
ProviderSelector
    ↓
MovieProvider / TVProvider / FootballDataProvider / FootballStreamProvider / VideoProvider
    ↓
Concrete adapter (OPhim, KKPhim, IPTV, football API, YouTube integration...)
```

## Core contracts

- `ProviderAdapter`: common identity/capability/health contract.
- `BaseProvider`: shared abstract base class.
- `MovieProvider`: list/search/detail/episodes/playback.
- `TVProvider`: channels/EPG/playback.
- `FootballDataProvider`: fixtures/match/standings.
- `FootballStreamProvider`: match playback only.
- `VideoProvider`: home/search/video/channel/playlists/playback.

Football data and football streaming are intentionally separate contracts.

## Engine behavior

1. Query Registry by domain + capability.
2. Remove disabled providers.
3. Selector reads health/circuit state.
4. Sort by health → priority → latency → weight.
5. Invoke primary adapter.
6. On a classified retryable `ProviderError`, try the next candidate.
7. On non-retryable errors, stop immediately.
8. Return canonical data plus non-sensitive attempt metadata.
9. Never fallback indefinitely; candidate list/maxProviders bounds execution.

## Error discipline

Concrete adapters must convert upstream failures to `ProviderError` with an explicit `retryable` flag. Authentication/config/schema failures should normally be non-retryable for that request; transient network/5xx/429 failures may be retryable according to adapter policy.

## Next implementation steps

- Add HTTP transport abstraction with timeout/retry hooks.
- Add DB-backed ProviderConfig repository and DB-backed health store.
- Add OPhim and KKPhim adapters.
- Add M3U/XMLTV adapters.
- Add football data adapter(s).
- Add unit tests for registry, selector and fallback.
- Wire ProviderEngine into `apps/api` domain services during P2/P3.

No production mock provider is included.
