import { createHash } from 'node:crypto';
import {
  parseM3u,
  type M3uEntry,
  type PlaybackDescriptor,
  type SqlExecutor,
  type SqlRow,
} from '@fullmedia/providers';
import { getDatabase } from '../infrastructure/database';
import { LUAN9X_INITIAL_CHANNELS, LUAN9X_INITIAL_GROUPS, type InitialTvChannelSeed } from './initial-catalog';
import { TvCatalogRepository } from './tv-catalog-repository';

const MAX_PLAYLIST_BYTES = 20 * 1024 * 1024;

export interface ManagedTvImportInput {
  sourceKey: string;
  playlistText: string;
  publish?: boolean;
  refreshIntervalMinutes?: number;
  basePriority?: number;
}

export interface ManagedTvImportResult {
  sourceKey: string;
  providerCode: string;
  providerId: string;
  channelCatalogCount: number;
  parsedStreamCount: number;
  boundChannelCount: number;
  epgSourceCount: number;
  warningCount: number;
  warnings: string[];
  published: boolean;
  sourceFingerprint: string;
}

interface IdRow extends SqlRow { id: string }
interface CanonicalRow extends SqlRow { id: string; canonical_key: string }
interface PlaylistRow extends SqlRow { id: string }
interface SourceRow extends SqlRow {
  id: string;
  provider_code: string;
  name: string;
  source_ref: string;
  epg_source_ref: string | null;
  enabled: boolean;
  priority: number;
  refresh_interval_minutes: number;
  last_sync_at: string | Date | null;
  next_sync_at: string | Date | null;
}

interface GlobalTvSeedState {
  fullmediaInitialTvCatalogReady?: boolean;
  fullmediaInitialTvCatalogPromise?: Promise<void>;
}

const globalState = globalThis as typeof globalThis & GlobalTvSeedState;

export async function ensureInitialTvCatalog(): Promise<void> {
  if (globalState.fullmediaInitialTvCatalogReady) return;
  if (globalState.fullmediaInitialTvCatalogPromise) return globalState.fullmediaInitialTvCatalogPromise;
  const pending = seedCatalog(getDatabase(), LUAN9X_INITIAL_CHANNELS);
  globalState.fullmediaInitialTvCatalogPromise = pending;
  try {
    await pending;
    globalState.fullmediaInitialTvCatalogReady = true;
  } finally {
    delete globalState.fullmediaInitialTvCatalogPromise;
  }
}

export async function importManagedTvPlaylist(input: ManagedTvImportInput): Promise<ManagedTvImportResult> {
  const sourceKey = normalizeSourceKey(input.sourceKey);
  if (!sourceKey) throw new Error('sourceKey must contain letters or numbers');
  const bytes = Buffer.byteLength(input.playlistText, 'utf8');
  if (bytes === 0) throw new Error('Playlist is empty');
  if (bytes > MAX_PLAYLIST_BYTES) throw new Error('Playlist exceeds 20 MB import limit');

  const parsed = parseM3u(input.playlistText);
  if (parsed.entries.length === 0) throw new Error('Playlist contains no playable HTTP/HTTPS stream entries');

  const publish = input.publish ?? true;
  const refreshIntervalMinutes = clampInt(input.refreshIntervalMinutes, 360, 5, 10080);
  const basePriority = clampInt(input.basePriority, 100, 1, 100000);
  const fingerprint = createHash('sha256').update(input.playlistText).digest('hex');
  const providerCode = providerCodeForSource(sourceKey);
  const db = getDatabase();
  if (!db.transaction) throw new Error('Managed TV import requires transaction support');

  return db.transaction(async (tx) => {
    await seedCatalog(tx, LUAN9X_INITIAL_CHANNELS);
    const providerId = await ensureSourceProvider(tx, providerCode, sourceKey, basePriority, publish);
    const imported = mapImportChannels(parsed.entries);
    const dynamicSeeds = dedupeSeeds(imported.map((item) => item.seed).filter((seed) => !INITIAL_BY_KEY.has(seed.canonicalKey)));
    if (dynamicSeeds.length > 0) await seedCatalog(tx, dynamicSeeds);

    const canonicalIds = await loadCanonicalIds(tx, imported.map((item) => item.seed.canonicalKey));
    const repository = new TvCatalogRepository(tx);

    // Replace only this source/provider. Other source providers remain available as fallbacks.
    await tx.query(`
      delete from control.playback_bindings
      where provider_id = $1 and binding_type = 'IPTV_STREAM'
    `, [providerId]);

    const tvgCounts = new Map<string, number>();
    for (const entry of parsed.entries) {
      const id = meaningfulTvgId(entry.externalId)?.toLowerCase();
      if (id) tvgCounts.set(id, (tvgCounts.get(id) ?? 0) + 1);
    }

    let boundChannelCount = 0;
    for (let index = 0; index < imported.length; index += 1) {
      const item = imported[index]!;
      const entityId = canonicalIds.get(item.seed.canonicalKey);
      if (!entityId) continue;

      await upsertProviderRef(tx, providerId, entityId, sourceKey, item.entry, item.seed);
      await repository.replacePlaybackBindings(
        entityId,
        providerId,
        descriptorFromEntry(item.entry, providerId, sourceKey),
      );
      if (!publish) {
        await tx.query(`
          update control.playback_bindings
          set enabled = false, updated_at = now()
          where entity_id = $1 and provider_id = $2 and binding_type = 'IPTV_STREAM'
        `, [entityId, providerId]);
      }
      await updateChannelMetadata(tx, entityId, item.seed, item.entry);

      const tvgId = meaningfulTvgId(item.entry.externalId);
      if (tvgId && tvgCounts.get(tvgId.toLowerCase()) === 1) {
        await tx.query(`
          insert into catalog.epg_mappings (
            channel_id, provider_id, external_channel_id, confidence, enabled, updated_at
          ) values ($1, $2, $3, 1.0, true, now())
          on conflict (provider_id, external_channel_id) do update set
            channel_id = excluded.channel_id,
            confidence = 1.0,
            enabled = true,
            updated_at = now()
        `, [entityId, providerId, tvgId]);
      }
      boundChannelCount += 1;
    }

    await upsertPlaylistControl(tx, {
      providerId,
      sourceKey,
      fingerprint,
      epgSourceRef: parsed.epgUrls[0],
      publish,
      refreshIntervalMinutes,
    });
    await storeEpgSources(tx, providerId, sourceKey, parsed.epgUrls);

    return {
      sourceKey,
      providerCode,
      providerId,
      channelCatalogCount: LUAN9X_INITIAL_CHANNELS.length + dynamicSeeds.length,
      parsedStreamCount: parsed.entries.length,
      boundChannelCount,
      epgSourceCount: parsed.epgUrls.length,
      warningCount: parsed.warnings.length,
      warnings: parsed.warnings.slice(0, 100),
      published: publish,
      sourceFingerprint: fingerprint,
    };
  });
}

export async function listManagedTvSources() {
  const rows = await getDatabase().query<SourceRow>(`
    select pl.id, p.code as provider_code, pl.name, pl.source_ref, pl.epg_source_ref,
           pl.enabled, p.priority, pl.refresh_interval_minutes, pl.last_sync_at, pl.next_sync_at
    from control.iptv_playlists pl
    join control.providers p on p.id = pl.provider_id
    where p.code like 'IPTV_%'
    order by p.priority asc, pl.created_at asc
  `);
  return rows.map((row) => ({
    id: row.id,
    providerCode: row.provider_code,
    sourceKey: row.name,
    sourceFingerprint: row.source_ref.replace(/^admin-upload:/, ''),
    ...(row.epg_source_ref ? { primaryEpgSource: row.epg_source_ref } : {}),
    enabled: row.enabled,
    priority: row.priority,
    refreshIntervalMinutes: row.refresh_interval_minutes,
    ...(row.last_sync_at ? { lastSyncAt: iso(row.last_sync_at) } : {}),
    ...(row.next_sync_at ? { nextSyncAt: iso(row.next_sync_at) } : {}),
  }));
}

export async function setManagedTvSourceEnabled(sourceKeyInput: string, enabled: boolean): Promise<void> {
  const sourceKey = normalizeSourceKey(sourceKeyInput);
  const providerCode = providerCodeForSource(sourceKey);
  const db = getDatabase();
  await db.query(`
    update control.providers set enabled = $2, updated_at = now() where code = $1
  `, [providerCode, enabled]);
  await db.query(`
    update control.iptv_playlists pl
    set enabled = $2, updated_at = now()
    from control.providers p
    where pl.provider_id = p.id and p.code = $1
  `, [providerCode, enabled]);
  await db.query(`
    update control.playback_bindings b
    set enabled = $2, updated_at = now()
    from control.providers p
    where b.provider_id = p.id and p.code = $1 and b.binding_type = 'IPTV_STREAM'
  `, [providerCode, enabled]);
}

async function seedCatalog(db: SqlExecutor, channels: readonly InitialTvChannelSeed[]): Promise<void> {
  await db.query(`
    insert into catalog.tv_channel_groups (slug, name, sort_order, is_active)
    select x.slug, x.name, x.sort_order, true
    from jsonb_to_recordset($1::jsonb) as x(slug text, name text, sort_order integer)
    on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order,
      is_active = true, updated_at = now()
  `, [JSON.stringify(LUAN9X_INITIAL_GROUPS.map((item) => ({ slug: item.slug, name: item.name, sort_order: item.sortOrder })))]);

  const payload = channels.map((item) => ({
    canonical_key: item.canonicalKey,
    name: item.name,
    group_slug: item.groupSlug,
    logo_url: item.logoUrl ?? null,
    is_hd: item.isHd,
    metadata: {
      sourceCatalog: 'LUAN9X', sourceGroup: item.sourceGroup ?? null,
      tvgId: item.tvgId ?? null, hasInitialStream: item.hasInitialStream,
    },
  }));
  const json = JSON.stringify(payload);
  await db.query(`
    insert into catalog.entities (domain, entity_type, canonical_key, title, image_url, metadata, is_active)
    select 'TV', 'CHANNEL', x.canonical_key, x.name, x.logo_url, x.metadata, true
    from jsonb_to_recordset($1::jsonb) as x(
      canonical_key text, name text, group_slug text, logo_url text, is_hd boolean, metadata jsonb
    )
    on conflict (domain, canonical_key) do update set
      title = excluded.title, image_url = coalesce(excluded.image_url, catalog.entities.image_url),
      metadata = catalog.entities.metadata || excluded.metadata, is_active = true, updated_at = now()
  `, [json]);
  await db.query(`
    insert into catalog.tv_channels (id, name, logo_url, group_id, is_hd, is_active, metadata)
    select e.id, x.name, x.logo_url, g.id, x.is_hd, true, x.metadata
    from jsonb_to_recordset($1::jsonb) as x(
      canonical_key text, name text, group_slug text, logo_url text, is_hd boolean, metadata jsonb
    )
    join catalog.entities e on e.domain = 'TV' and e.canonical_key = x.canonical_key
    left join catalog.tv_channel_groups g on g.slug = x.group_slug
    on conflict (id) do update set
      name = excluded.name, logo_url = coalesce(excluded.logo_url, catalog.tv_channels.logo_url),
      group_id = coalesce(excluded.group_id, catalog.tv_channels.group_id), is_hd = excluded.is_hd,
      is_active = true, metadata = catalog.tv_channels.metadata || excluded.metadata, updated_at = now()
  `, [json]);
}

async function ensureSourceProvider(
  db: SqlExecutor,
  providerCode: string,
  sourceKey: string,
  priority: number,
  enabled: boolean,
): Promise<string> {
  const row = (await db.query<IdRow>(`
    insert into control.providers (code, display_name, provider_type, enabled, priority, weight)
    values ($1, $2, 'IPTV_PLAYLIST', $3, $4, 1.0)
    on conflict (code) do update set
      display_name = excluded.display_name, provider_type = excluded.provider_type,
      enabled = excluded.enabled, priority = excluded.priority, updated_at = now()
    returning id
  `, [providerCode, `IPTV ${sourceKey}`, enabled, priority]))[0];
  if (!row) throw new Error('Unable to create IPTV source provider');

  await db.query(`
    insert into control.provider_configs (
      provider_id, auth_strategy, headers_template, request_template,
      timeout_ms, retry_policy, cache_ttl_seconds, mapping_version, config_version, is_current
    ) values (
      $1, 'NONE', '{}'::jsonb, '{}'::jsonb,
      8000, '{"attempts":2,"retryTimeout":true,"retry5xx":true,"retry429":true}'::jsonb,
      300, 1, 1, true
    )
    on conflict (provider_id, config_version) do update set is_current = true, updated_at = now()
  `, [row.id]);
  for (const capability of ['TV_CHANNELS', 'TV_EPG', 'TV_PLAYBACK']) {
    await db.query(`
      insert into control.provider_capabilities (provider_id, capability, enabled)
      values ($1, $2, true)
      on conflict (provider_id, capability) do update set enabled = true
    `, [row.id, capability]);
  }
  return row.id;
}

async function loadCanonicalIds(db: SqlExecutor, keys: readonly string[]): Promise<Map<string, string>> {
  const rows = await db.query<CanonicalRow>(`
    select e.id, e.canonical_key
    from catalog.entities e
    join jsonb_array_elements_text($1::jsonb) wanted(value) on wanted.value = e.canonical_key
    where e.domain = 'TV'
  `, [JSON.stringify([...new Set(keys)])]);
  return new Map(rows.map((row) => [row.canonical_key, row.id]));
}

async function upsertProviderRef(
  db: SqlExecutor, providerId: string, entityId: string, sourceKey: string,
  entry: M3uEntry, seed: InitialTvChannelSeed,
): Promise<void> {
  await db.query(`
    insert into catalog.provider_refs (
      entity_id, provider_id, external_id, external_slug, metadata_json, last_synced_at
    ) values ($1, $2, $3, $4, $5::jsonb, now())
    on conflict (provider_id, external_id) do update set
      entity_id = excluded.entity_id, external_slug = excluded.external_slug,
      metadata_json = catalog.provider_refs.metadata_json || excluded.metadata_json, last_synced_at = now()
  `, [
    entityId, providerId, seed.canonicalKey,
    meaningfulTvgId(entry.externalId) ?? seed.tvgId ?? null,
    JSON.stringify({ sourceKey, sourceGroup: entry.group ?? null, rawTvgId: entry.externalId }),
  ]);
}

async function updateChannelMetadata(db: SqlExecutor, entityId: string, seed: InitialTvChannelSeed, entry: M3uEntry): Promise<void> {
  await db.query(`
    update catalog.tv_channels
    set logo_url = coalesce($2, logo_url), is_hd = $3, is_active = true,
        metadata = metadata || $4::jsonb, updated_at = now()
    where id = $1
  `, [
    entityId, entry.logoUrl ?? seed.logoUrl ?? null, entry.isHd || seed.isHd,
    JSON.stringify({ latestTvgId: entry.externalId, sourceGroup: entry.group ?? seed.sourceGroup ?? null }),
  ]);
}

async function upsertPlaylistControl(db: SqlExecutor, options: {
  providerId: string; sourceKey: string; fingerprint: string; epgSourceRef?: string;
  publish: boolean; refreshIntervalMinutes: number;
}): Promise<void> {
  const existing = (await db.query<PlaylistRow>(`
    select id from control.iptv_playlists where provider_id = $1 order by created_at asc limit 1
  `, [options.providerId]))[0];
  if (existing) {
    await db.query(`
      update control.iptv_playlists
      set name = $3, source_type = 'M3U_FILE', source_ref = $4, epg_source_ref = $5,
          enabled = $6, refresh_interval_minutes = $7, last_sync_at = now(),
          next_sync_at = now() + ($7::int * interval '1 minute'), updated_at = now()
      where id = $1 and provider_id = $2
    `, [existing.id, options.providerId, options.sourceKey, `admin-upload:${options.fingerprint}`,
      options.epgSourceRef ?? null, options.publish, options.refreshIntervalMinutes]);
    return;
  }
  await db.query(`
    insert into control.iptv_playlists (
      provider_id, name, source_type, source_ref, epg_source_ref,
      enabled, refresh_interval_minutes, last_sync_at, next_sync_at
    ) values ($1, $2, 'M3U_FILE', $3, $4, $5, $6, now(), now() + ($6::int * interval '1 minute'))
  `, [options.providerId, options.sourceKey, `admin-upload:${options.fingerprint}`,
    options.epgSourceRef ?? null, options.publish, options.refreshIntervalMinutes]);
}

async function storeEpgSources(db: SqlExecutor, providerId: string, sourceKey: string, urls: readonly string[]): Promise<void> {
  await db.query(`
    insert into control.provider_mappings (
      provider_id, domain, operation, mapping_version, mapping_json, enabled
    ) values ($1, 'TV', $2, 1, $3::jsonb, true)
    on conflict (provider_id, domain, operation, mapping_version) do update set
      mapping_json = excluded.mapping_json, enabled = true, updated_at = now()
  `, [providerId, 'EPG_SOURCES', JSON.stringify({ sourceKey, urls })]);
}

function mapImportChannels(entries: readonly M3uEntry[]): Array<{ seed: InitialTvChannelSeed; entry: M3uEntry }> {
  return entries.map((entry) => {
    const byName = INITIAL_BY_NAME.get(normalizeName(entry.name));
    const tvgId = meaningfulTvgId(entry.externalId)?.toLowerCase();
    const byTvg = tvgId ? UNIQUE_INITIAL_BY_TVG.get(tvgId) : undefined;
    return { seed: byName ?? byTvg ?? dynamicSeed(entry), entry };
  });
}

function dynamicSeed(entry: M3uEntry): InitialTvChannelSeed {
  const name = entry.name.trim();
  return {
    canonicalKey: canonicalKeyForName(name), name, groupSlug: groupSlug(entry.group),
    ...(entry.group ? { sourceGroup: entry.group } : {}),
    ...(meaningfulTvgId(entry.externalId) ? { tvgId: entry.externalId } : {}),
    ...(entry.logoUrl ? { logoUrl: entry.logoUrl } : {}),
    isHd: entry.isHd, hasInitialStream: true,
  };
}

function descriptorFromEntry(entry: M3uEntry, providerId: string, sourceKey: string): PlaybackDescriptor {
  return {
    primary: {
      id: `${providerId}:${entry.sourceKey}`, providerId, type: playbackType(entry.streamUrl),
      url: entry.streamUrl, isLive: true,
      ...(Object.keys(entry.headers).length > 0 ? { headers: entry.headers } : {}),
      metadata: { sourceKey: `${sourceKey}:${entry.sourceKey}` },
    },
    alternatives: [],
  };
}

function providerCodeForSource(sourceKey: string): string {
  const code = sourceKey.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  return `IPTV_${code || 'SOURCE'}`;
}

function normalizeSourceKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ').trim();
}

function canonicalKeyForName(value: string): string {
  const slug = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'channel';
  return `tv:${slug}-${stableHash(value)}`;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function meaningfulTvgId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const lower = normalized.toLowerCase();
  if (lower === 'n/a' || lower === 'no_epg' || lower === 'no_epg_sport') return undefined;
  return normalized;
}

function groupSlug(value: string | undefined): string {
  const normalized = normalizeName(value ?? '');
  if (normalized === 'vtv') return 'vtv';
  if (normalized === 'htv') return 'htv';
  if (normalized.includes('tay a')) return 'west-asia';
  if (normalized.includes('giao duc') || normalized.includes('khoa hoc')) return 'education';
  if (normalized.includes('tin tuc') || normalized.includes('tai chinh')) return 'news';
  if (normalized.includes('van hoa') || normalized.includes('giai tri')) return 'entertainment';
  if ((value ?? '').includes('🇷🇺')) return 'cis';
  return 'international';
}

function playbackType(url: string): 'HLS' | 'DASH' | 'MP4' {
  let path = url;
  try { path = new URL(url).pathname; } catch { /* keep raw */ }
  if (path.toLowerCase().endsWith('.mpd')) return 'DASH';
  if (path.toLowerCase().endsWith('.mp4')) return 'MP4';
  return 'HLS';
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value!));
}

function dedupeSeeds(items: readonly InitialTvChannelSeed[]): InitialTvChannelSeed[] {
  const output = new Map<string, InitialTvChannelSeed>();
  for (const item of items) output.set(item.canonicalKey, item);
  return [...output.values()];
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

const INITIAL_BY_KEY = new Map(LUAN9X_INITIAL_CHANNELS.map((item) => [item.canonicalKey, item]));
const INITIAL_BY_NAME = new Map(LUAN9X_INITIAL_CHANNELS.map((item) => [normalizeName(item.name), item]));
const TVG_COUNTS = new Map<string, number>();
for (const item of LUAN9X_INITIAL_CHANNELS) {
  const id = meaningfulTvgId(item.tvgId)?.toLowerCase();
  if (id) TVG_COUNTS.set(id, (TVG_COUNTS.get(id) ?? 0) + 1);
}
const UNIQUE_INITIAL_BY_TVG = new Map(
  LUAN9X_INITIAL_CHANNELS.flatMap((item) => {
    const id = meaningfulTvgId(item.tvgId)?.toLowerCase();
    return id && TVG_COUNTS.get(id) === 1 ? [[id, item] as const] : [];
  }),
);
