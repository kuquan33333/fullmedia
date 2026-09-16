# 25 — Canonical Movie Resolver & Cache Layer

## Status

**CLOSED / VERIFIED — Manual Verify passed.**

Implemented in `apps/api` after the API/BFF + OPhim/KKPhim milestone. The user confirmed the Manual Verify workflow passed before work moved to TV Provider Infrastructure.

No new database migration was required. The implementation uses the existing canonical tables:

- `catalog.entities`
- `catalog.media_titles`
- `catalog.provider_refs`

## Goal

Clients must use provider-independent movie IDs. OPhim and KKPhim slugs are transport/provider details and must not leak into user-facing business logic.

Before this milestone, provider fallback could only work reliably when both providers happened to use compatible slugs. This milestone removes that assumption for canonical IDs.

## Runtime flow

```text
OPhim/KKPhim list or search
        ↓
Provider Engine
        ↓
MovieSummary with provider ref
        ↓
CanonicalMovieResolver
        ↓
find provider_ref
   ├─ found → canonical UUID
   └─ missing
        ↓
canonical key from type/year/normalized title
        ↓
upsert catalog.entities + catalog.media_titles
        ↓
attach catalog.provider_refs
        ↓
return canonical UUID to client
```

Client-facing list/search responses no longer need OPhim/KKPhim IDs.

## Cross-provider discovery

When a request uses a canonical UUID but the selected provider has no `provider_ref` yet:

```text
canonical UUID
    ↓
load canonical movie metadata
    ↓
search target provider by canonical title
    ↓
score candidates
    ├ title
    ├ original title
    ├ media type
    └ release year
    ↓
score >= threshold
    ↓
attach target provider external_id/slug
    ↓
continue detail/episodes/playback
```

This permits mappings such as:

```text
canonical movie UUID
├── OPHIM  → demo-series
└── KKPHIM → demo-series-ban-khac
```

The discovery threshold defaults to `0.8` and is configurable through `FULLMEDIA_PROVIDER_DISCOVERY_THRESHOLD`.

Discovery is conservative. A candidate with a conflicting release year is penalized instead of being force-merged.

## Canonical episodes

For canonical movie requests, episode responses expose stable BFF refs:

```text
<canonical-movie-uuid>:episode:<number>
```

Before playback, the BFF asks the selected provider for its episodes and maps the canonical episode number back to that provider's external episode ref. Therefore provider failover does not require identical episode ref strings.

The database does not yet persist provider-specific episode mappings; the current strategy uses episode number as the cross-provider bridge. Persisted canonical episode/provider mapping can be added later for titles with unusual numbering schemes.

## Cache layer

`apps/api/src/cache/ttl-cache.ts` provides:

- TTL expiration
- bounded entry count
- LRU-like refresh on read
- in-flight request deduplication
- no caching of failed loaders

Caches currently used:

| Cache | Default TTL |
|---|---:|
| provider registry config | 30 s |
| canonical movie records | 10 min |
| provider ref mappings | 10 min |
| movie list | 60 s |
| movie search | 30 s |
| movie detail | 5 min |
| movie episodes | 2 min |
| playback descriptor | **not cached** |

Playback is intentionally excluded because upstream URLs may be short-lived, tokenized or signed.

## Database connection policy

For Vercel/serverless with the Supabase transaction pooler, FULLMEDIA defaults `FULLMEDIA_DB_POOL_MAX=1` per warm API instance. Increase this only after observing real connection/query pressure.

## Files

```text
apps/api/src/
├── cache/
│   ├── ttl-cache.ts
│   └── ttl-cache.test.ts
├── catalog/
│   ├── catalog-runtime.ts
│   ├── movie-catalog-repository.ts
│   ├── canonical-movie-resolver.ts
│   └── canonical-movie-resolver.test.ts
└── services/
    └── movie-service.ts
```

## Backward compatibility

Legacy provider-prefixed refs such as `ophim:<slug>` and `kkphim:<slug>` are still accepted. Robust cross-provider discovery is guaranteed for canonical UUID requests; legacy refs remain compatibility input and should disappear once mobile/web clients consume canonical IDs everywhere.

## Verification

The milestone passed the manual verification gate:

```text
pnpm install
pnpm typecheck
pnpm test
pnpm build:api
```

The workflow remains `workflow_dispatch` only and does not run automatically on push.

## Follow-on work

The project has now moved into TV Provider Infrastructure. Remaining movie-side enhancements stay on the roadmap:

1. canonical detail persistence/update from upstream detail responses;
2. background/provider ingestion for hot catalog items;
3. persistent episode/provider mapping for special numbering cases.
