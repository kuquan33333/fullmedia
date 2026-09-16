# @fullmedia/providers

Framework-agnostic Provider Engine core for FULLMEDIA.

## Responsibilities

- Canonical provider interfaces for Movies, TV, Football data, Football streams and Video/YouTube.
- Provider registry.
- Health-aware provider ordering.
- Retryable-error-based fallback orchestration.
- Canonical DTOs and playback descriptors.

## Non-responsibilities

- No OPhim/KKPhim/IPTV-specific parsing in the engine.
- No database client inside provider interfaces.
- No HTTP framework dependency.
- No secret persistence.
- No media proxying.

## Adapter rule

A concrete adapter extends `BaseProvider` and implements exactly the domain contract(s) it supports. It must normalize upstream data to canonical DTOs and throw `ProviderError` for classified failures.

Adapters must never call another provider directly. Fallback belongs to `ProviderEngine`.

## Example shape

```ts
class OPhimProvider extends BaseProvider implements MovieProvider {
  // list/search/detail/episodes/resolvePlayback/healthCheck
}
```

The concrete OPhim and KKPhim adapters are intentionally not included in this scaffold; they belong to the Movies implementation phase.
