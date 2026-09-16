# 26 — TV Channel Catalog & Admin Source Import

## Status

Implemented after Canonical Movie Resolver milestone passed Manual Verify.

This milestone integrates the supplied Luan9x IPTV catalog into FULLMEDIA without committing the raw playlist or sensitive-looking stream paths to the public repository.

## Source inventory

The supplied playlist contains:

- **100 channel declarations**;
- **96 declarations with a playable HTTP/HTTPS stream URL**;
- **4 channel declarations with metadata but no stream URL**;
- **27 EPG source URLs** declared in the `#EXTM3U url-tvg` header.

The four metadata-only channels are retained in the canonical catalog and remain non-playable until an Admin source supplies a stream:

- `Три Ангела`
- `ЛДПР ТВ HD`
- `Союз`
- `TV BRICS`

The initial catalog is represented in TypeScript metadata under:

```text
apps/api/src/tv/initial-catalog/
├── types.ts
├── luan9x-part-1.ts
├── luan9x-part-2.ts
├── luan9x-part-3.ts
├── luan9x-part-4.ts
└── index.ts
```

No raw stream URL is stored in these source files.

## Why raw playlist URLs are not committed

Some IPTV entries can contain tokens, credentials, temporary paths or third-party URLs whose distribution rights may change. The repository is public, so FULLMEDIA treats stream locations as runtime source data rather than application source code.

The code repository stores only:

- canonical channel metadata;
- logos;
- source group metadata;
- TVG IDs where available;
- import/parser logic;
- Admin source management code.

Raw stream URLs are written only to the private server-side `control.playback_bindings` table after an authorized Admin import.

## Canonical channel architecture

```text
Initial channel metadata / Admin M3U
                ↓
         channel matching
       name → unique TVG ID
                ↓
        catalog.entities
        catalog.tv_channels
                ↓
       canonical channel UUID
                ↓
        client iOS/Web/Android
```

The client never uses an IPTV URL as channel identity.

A channel keeps the same canonical UUID when its playback source changes.

## Source architecture

Every Admin playlist uses its own provider identity:

```text
sourceKey=luan9x
       ↓
IPTV_LUAN9X_<HASH>

sourceKey=backup-01
       ↓
IPTV_BACKUP_01_<HASH>
```

Each provider has independent:

- enabled state;
- priority;
- provider config;
- provider refs;
- playback bindings;
- EPG source mapping;
- health state when health probing is available.

This means multiple source playlists may serve the same canonical channel at the same time.

## Replace behavior

Re-importing the same `sourceKey` is an atomic replacement of that source only:

```text
Admin uploads updated luan9x.m3u
        ↓
parse + validate
        ↓
BEGIN transaction
        ↓
resolve IPTV_LUAN9X_<HASH>
        ↓
delete old IPTV_LUAN9X bindings
        ↓
insert new IPTV_LUAN9X bindings
        ↓
update EPG/provider metadata
        ↓
COMMIT
```

Bindings owned by `backup-01`, `backup-02`, or another provider are not deleted.

Therefore source rotation does not require a mobile/web release.

## Multi-source playback fallback

For one canonical channel:

```text
Canonical VTV3 UUID
├── IPTV_PRIMARY    priority 10
│   ├── stream A
│   └── stream B
├── IPTV_BACKUP_01 priority 20
│   └── stream C
└── IPTV_BACKUP_02 priority 30
    └── stream D
```

`TvCatalogRepository.resolvePlayback()` reads enabled candidates and orders them by:

1. provider health;
2. provider priority;
3. binding priority;
4. stable creation order.

The BFF returns:

```text
primary
alternatives[]
```

Live stream descriptors are not cached by `TvService`.

## Channel availability DTO

Canonical `TVChannel` now supports:

```ts
playable?: boolean;
sourceCount?: number;
```

A metadata-only channel can therefore remain visible while the UI disables or changes the Watch action until a source becomes available.

## Admin API

The current implementation uses `FULLMEDIA_INTERNAL_TOKEN` as an interim server-side authorization gate until the full Admin membership/session layer is implemented.

### List sources

```http
GET /api/v1/internal/admin/tv/sources
Authorization: Bearer <FULLMEDIA_INTERNAL_TOKEN>
```

The response includes source fingerprints and state, not raw stream URLs.

### Import or replace M3U

```http
POST /api/v1/internal/admin/tv/sources/import
Authorization: Bearer <FULLMEDIA_INTERNAL_TOKEN>
Content-Type: multipart/form-data
```

Form fields:

```text
sourceKey=luan9x
file=<playlist.m3u>
publish=true
basePriority=10
refreshIntervalMinutes=360
```

The route also accepts JSON or raw M3U text for controlled server integrations.

JSON example:

```json
{
  "sourceKey": "luan9x",
  "playlistText": "#EXTM3U\n...",
  "publish": true,
  "basePriority": 10,
  "refreshIntervalMinutes": 360
}
```

Do not send this JSON form through logging systems because it contains the raw playlist. Multipart upload is preferred for the future Admin UI.

### Enable/disable or reprioritize a source

```http
PATCH /api/v1/internal/admin/tv/sources/luan9x
Authorization: Bearer <FULLMEDIA_INTERNAL_TOKEN>
Content-Type: application/json
```

```json
{
  "enabled": true,
  "priority": 10
}
```

Either field may be omitted.

Lower priority numbers are preferred.

## Source persistence

Private database records:

```text
control.providers
control.provider_configs
control.provider_capabilities
control.iptv_playlists
control.playback_bindings
control.provider_mappings
catalog.provider_refs
catalog.epg_mappings
```

`control.iptv_playlists.source_ref` stores only:

```text
admin-upload:<sha256 fingerprint>
```

It does **not** store the uploaded M3U body.

Actual stream URLs exist only in `control.playback_bindings`.

## EPG handling

All URLs from the M3U header are parsed.

The first URL is kept as the primary `epg_source_ref`. The complete source list is stored in private provider mapping data for later EPG synchronization.

Automatic EPG channel mapping is created only for a meaningful, unique TVG ID. Generic IDs such as:

```text
N/A
no_epg
no_epg_sport
```

are not treated as stable EPG identities.

## Audit and security

Source import and source state changes write redacted records to `ops.admin_audit_logs`.

Audit logs never store:

- playlist body;
- stream URL;
- Authorization header;
- tokens/passwords/secrets.

Client applications never receive provider configuration tables.

The upload API has a 20 MB playlist limit.

Future URL-based remote playlist import must pass the existing SSRF security requirements before it is enabled. Current Admin flow intentionally accepts uploaded playlist content instead of fetching arbitrary URLs server-side.

## Tests

The test suite now locks the source inventory:

```text
100 declared channels
96 initial stream-bearing channels
4 metadata-only channels
27 declared EPG sources
10 VTV channels
10 HTV channels
```

It also verifies:

- provider source codes are deterministic and distinct;
- non-Latin channel names do not collapse to the same canonical key;
- existing M3U parser behavior;
- XMLTV parser behavior;
- IPTV multi-source playback alternatives.

## Schema impact

No new database migration is required.

This milestone uses the existing TV and Provider Control Plane schema created by migrations 004 and 007.

## Next step

After Manual Verify passes:

1. add XMLTV ingestion into `catalog.epg_programmes` using stored EPG source configuration;
2. add stream/provider health probing and automatic degraded/down state;
3. add Admin Web UI for upload/preview/publish/disable/priority controls;
4. add TV home/current-next programme BFF composition;
5. continue TV player/channel drawer integration for Web/Mobile.
