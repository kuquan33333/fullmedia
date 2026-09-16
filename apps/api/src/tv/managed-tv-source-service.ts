import { createHash } from 'node:crypto';
import {
  parseM3u,
  type M3uEntry,
  type PlaybackCandidate,
  type PlaybackDescriptor,
  type SqlExecutor,
  type SqlRow,
  type TVChannel,
} from '@fullmedia/providers';
import { getDatabase } from '../infrastructure/database';
import { LUAN9X_INITIAL_CHANNELS, LUAN9X_INITIAL_GROUPS, type InitialTvChannelSeed } from './initial-catalog';
import { TvCatalogRepository } from './tv-catalog-repository';

const MANAGED_PROVIDER_CODE = 'IPTV_MANAGED';
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

interface ImportChannel {
  seed: InitialTvChannelSeed;
  entry: M3uEntry;
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
  const db = getDatabase();
  if (!db.transaction) throw new Error('Managed TV import requires transaction support');

  return db.transaction(async (tx) => {
    const providerId = await ensureManagedProvider(tx);
    await seedCatalog(tx, LUAN9X_INITIAL_CHANNELS);

    const imported = mapImportChannels(parsed.entries);
    const dynamicSeeds = imported
      .map((item) => item.seed)
      .filter((seed) => !INITIAL_BY_KEY.has(seed.canonicalKey));
    if (dynamicSeeds.length > 0) await seedCatalog(tx, dynamicSeeds);

    const canonicalIds = await loadCanonicalIds(tx, imported.map((item) => item.seed.canonicalKey));
    const repository = new TvCatalogRepository(tx);

    await tx.query(`
      delete from control.playback_bindings
      where provider_id = $1
        and binding_type = 'IPTV_STREAM'
        and source_key like $2
    `, [providerId, `${sourceKey}:%`]);

    const tvgIdCount = new Map<string, number>();
    for (const entry of parsed.entries) {
      const id = meaningfulTvgId(entry.externalId);
      if (id) tvgIdCount.set(id, (tvgIdCount.get(id) ?? 0) + 1);
    }

    let boundChannelCount = 0;
    for (let index = 0; index < imported.length; index += 1) {
      const item = imported[index]!;
      const entityId = canonicalIds.get(item.seed.canonicalKey);
      if (!entityId) continue;

      const channel = channelFromSeed(entityId, item.seed);
      await upsertManagedProviderRef(tx, providerId, entityId, sourceKey, item.entry, item.seed);
      await repository.replacePlaybackBindings(
        entityId,
        providerId,
        descriptorFromEntry(item.entry, providerId, sourceKey, basePriority + index, publish),
      );
      // replacePlaybackBindings currently writes enabled bindings. Disable the source after insert when import is draft-only.
      if (!publish) {
        await tx.query(`
          update control.playback_bindings
          set enabled = false, updated_at = now()
          where entity_id = $1 and provider_id = $2 and binding_type = 'IPTV_STREAM'
        `, [entityId, providerId]);
      }
      await updateCanonicalChannel(tx, channel, item.seed, item.entry);

      const tvgId = meaningfulTvgId(item.entry.externalId);
      if (tvgId && tvgIdCount.get(tvgId) === 1) {
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
  const db = getDatabase();
  const rows = await db.query<{
    id: string;
    name: string;
    source_ref: string;
    epg_source_ref: string | null;
    enabled: boolean;
    refresh_interval_minutes: number;
    last_sync_at: string | Date | null;
    next_sync_at: string | Date | null;
  } & SqlRow>(`
    select pl.id, pl.name, pl.source_ref, pl.epg_source_ref, pl.enabled,
           pl.refresh_interval_minutes, pl.last_sync_at, pl.next_sync_at
    from control.iptv_playlists pl
    join control.providers p on p.id = pl.provider_id
    where p.code = $1
    order by pl.created_at asc
  `, [MANAGED_PROVIDER_CODE]);
  return rows.map((row) => ({
    id: row.id,
    sourceKey: row.name,
    sourceFingerprint: row.source_ref.replace(/^admin-upload:/, ''),
    ...(row.epg_source_ref ? { primaryEpgSource: row.epg_source_ref } : {}),
    enabled: row.enabled,
    refreshIntervalMinutes: row.refresh_interval_minutes,
    ...(row.last_sync_at ? { lastSyncAt: iso(row.last_sync_at) } : {}),
    ...(row.next_sync_at ? { nextSyncAt: iso(row.next_sync_at) } : {}),
  }));
}

async function seedCatalog(db: SqlExecutor, channels: readonly InitialTvChannelSeed[]): Promise<void> {
  await db.query(`
    insert into catalog.tv_channel_groups (slug, name, sort_order, is_active)
    select x.slug, x.name, x.sort_order, true
    from jsonb_to_recordset($1::jsonb) as x(slug text, name text, sort_order integer)
    on conflict (slug) do update set
      name = excluded.name,
      sort_order = excluded.sort_order,
      is_active = true,
      updated_at = now()
  `, [JSON.stringify(LUAN9X_INITIAL_GROUPS.map((item) => ({
    slug: item.slug,
    name: item.name,
    sort_order: item.sortOrder,
  })))]);

  const payload = channels.map((item) => ({
    canonical_key: item.canonicalKey,
    name: item.name,
    group_slug: item.groupSlug,
    logo_url: item.logoUrl ?? null,
    is_hd: item.isHd,
    metadata: {
      sourceCatalog: 'LUAN9X',
      sourceGroup: item.sourceGroup ?? null,
      tvgId: item.tvgId ?? null,
      hasInitialStream: item.hasInitialStream,
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
      title = excluded.title,
      image_url = coalesce(excluded.image_url, catalog.entities.image_url),
      metadata = catalog.entities.metadata || excluded.metadata,
      is_active = true,
      updated_at = now()
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
      name = excluded.name,
      logo_url = coalesce(excluded.logo_url, catalog.tv_channels.logo_url),
      group_id = coalesce(excluded.group_id, catalog.tv_channels.group_id),
      is_hd = excluded.is_hd,
      is_active = true,
      metadata = catalog.tv_channels.metadata || excluded.metadata,
      updated_at = now()
  `, [json]);
}

async function ensureManagedProvider(db: SqlExecutor): Promise<string> {
  const row = (await db.query<IdRow>(`
    insert into control.providers (code, display_name, provider_type, enabled, priority, weight)
    values ($1, 'Managed IPTV', 'IPTV_PLAYLIST', true, 50, 1.0)
    on conflict (code) do update set
      display_name = excluded.display_name,
      provider_type = excluded.provider_type,
      enabled = true,
      updated_at = now()
    returning id
  `, [MANAGED_PROVIDER_CODE]))[0];
  if (!row) throw new Error('Unable to create managed IPTV provider');

  await db.query(`
    insert into control.provider_configs (
      provider_id, auth_strategy, headers_template, request_template,
      timeout_ms, retry_policy, cache_ttl_seconds, mapping_version, config_version, is_current
    ) values (
      $1, 'NONE', '{}'::jsonb, '{}'::jsonb,
      8000, '{"attempts":2,"retryTimeout":true,"retry5xx":true,"retry429":true}'::jsonb,
      300, 1, 1, true
    )
    on conflict (provider_id, config_version) do update set
      is_current = true,
      updated_at = now()
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

async function upsertManagedProviderRef(
  db: SqlExecutor,
  providerId: string,
  entityId: string,
  sourceKey: string,
  entry: M3uEntry,
  seed: InitialTvChannelSeed,
): Promise<void> {
  const externalId = seed.canonicalKey;
  await db.query(`
    insert into catalog.provider_refs (
      entity_id, provider_id, external_id, external_slug, metadata_json, last_synced_at
    ) values ($1, $2, $3, $4, $5::jsonb, now())
    on conflict (provider_id, external_id) do update set
      entity_id = excluded.entity_id,
      external_slug = excluded.external_slug,
      metadata_json = catalog.provider_refs.metadata_json || excluded.metadata_json,
      last_synced_at = now()
  `, [
    entityId,
    providerId,
    externalId,
    meaningfulTvgId(entry.externalId) ?? seed.tvgId ?? null,
    JSON.stringify({ sourceKey, sourceGroup: entry.group ?? null, rawTvgId: entry.externalId }),
  ]);
}

async function updateCanonicalChannel(
  db: SqlExecutor,
  channel: TVChannel,
  seed: InitialTvChannelSeed,
  entry: M3uEntry,
): Promise<void> {
  await db.query(`
    update catalog.tv_channels
    set name = $2,
        short_name = $3,
        logo_url = coalesce($4, logo_url),
        is_hd = $5,
        is_active = true,
        metadata = metadata || $6::jsonb,
        updated_at = now()
    where id = $1
  `, [
    channel.id,
    channel.name,
    channel.shortName ?? null,
    channel.logoUrl ?? null,
    channel.isHd ?? false,
    JSON.stringify({ latestTvgId: entry.externalId, sourceGroup: entry.group ?? seed.sourceGroup ?? null }),
  ]);
}

async function upsertPlaylistControl(db: SqlExecutor, options: {
  providerId: string;
  sourceKey: string;
  fingerprint: string;
  epgSourceRef?: string;
  publish: boolean;
  refreshIntervalMinutes: number;
}): Promise<void> {
  const existing = (await db.query<PlaylistRow>(`
    select id from control.iptv_playlists
    where provider_id = $1 and name = $2
    order by created_at asc
    limit 1
  `, [options.providerId, options.sourceKey]))[0];
  if (existing) {
    await db.query(`
      update control.iptv_playlists
      set source_type = 'M3U_FILE',
          source_ref = $3,
          epg_source_ref = $4,
          enabled = $5,
          refresh_interval_minutes = $6,
          last_sync_at = now(),
          next_sync_at = now() + ($6::int * interval '1 minute'),
          updated_at = now()
      where id = $1 and provider_id = $2
    `, [existing.id, options.providerId, `admin-upload:${options.fingerprint}`, options.epgSourceRef ?? null, options.publish, options.refreshIntervalMinutes]);
    return;
  }

  await db.query(`
    insert into control.iptv_playlists (
      provider_id, name, source_type, source_ref, epg_source_ref,
      enabled, refresh_interval_minutes, last_sync_at, next_sync_at
    ) values (
      $1, $2, 'M3U_FILE', $3, $4, $5, $6, now(), now() + ($6::int * interval '1 minute')
    )
  `, [options.providerId, options.sourceKey, `admin-upload:${options.fingerprint}`, options.epgSourceRef ?? null, options.publish, options.refreshIntervalMinutes]);
}

async function storeEpgSources(db: SqlExecutor, providerId: string, sourceKey: string, urls: readonly string[]): Promise<void> {
  await db.query(`
    insert into control.provider_mappings (
      provider_id, domain, operation, mapping_version, mapping_json, enabled
    ) values ($1, 'TV', $2, 1, $3::jsonb, true)
    on conflict (provider_id, domain, operation, mapping_version) do update set
      mapping_json = excluded.mapping_json,
      enabled = true,
      updated_at = now()
  `, [providerId, `EPG_SOURCES:${sourceKey}`, JSON.stringify({ sourceKey, urls })]);
}

function mapImportChannels(entries: readonly M3uEntry[]): ImportChannel[] {
  return entries.map((entry) => {
    const byName = INITIAL_BY_NAME.get(normalizeName(entry.name));
    const tvgId = meaningfulTvgId(entry.externalId);
    const byTvg = tvgId ? UNIQUE_INITIAL_BY_TVG.get(tvgId.toLowerCase()) : undefined;
    const seed = byName ?? byTvg ?? dynamicSeed(entry);
    return { seed, entry };
  });
}

function dynamicSeed(entry: M3uEntry): InitialTvChannelSeed {
  const name = entry.name.trim();
  return {
    canonicalKey: canonicalKeyForName(name),
    name,
    groupSlug: groupSlug(entry.group),
    ...(entry.group ? { sourceGroup: entry.group } : {}),
    ...(meaningfulTvgId(entry.externalId) ? { tvgId: entry.externalId } : {}),
    ...(entry.logoUrl ? { logoUrl: entry.logoUrl } : {}),
    isHd: entry.isHd,
    hasInitialStream: true,
  };
}

function channelFromSeed(entityId: string, seed: InitialTvChannelSeed): TVChannel {
  return {
    id: entityId,
    name: seed.name,
    ...(seed.logoUrl ? { logoUrl: seed.logoUrl } : {}),
    ...(seed.sourceGroup ? { group: seed.sourceGroup } : {}),
    isHd: seed.isHd,
  };
}

function descriptorFromEntry(
  entry: M3uEntry,
  providerId: string,
  sourceKey: string,
  priority: number,
  publish: boolean,
): PlaybackDescriptor {
  const candidate: PlaybackCandidate = {
    id: `${providerId}:${sourceKey}:${entry.sourceKey}`,
    providerId,
    type: playbackType(entry.streamUrl),
    url: entry.streamUrl,
    isLive: true,
    ...(Object.keys(entry.headers).length > 0 ? { headers: entry.headers } : {}),
    metadata: { sourceKey: `${sourceKey}:${entry.sourceKey}`, sourcePriority: priority, published: publish },
  };
  return { primary: candidate, alternatives: [] };
}

function playbackType(url: string): PlaybackCandidate['type'] {
  let path = url;
  try { path = new URL(url).pathname; } catch { /* keep raw */ }
  if (path.toLowerCase().endsWith('.mpd')) return 'DASH';
  if (path.toLowerCase().endsWith('.mp4')) return 'MP4';
  return 'HLS';
}

function normalizeSourceKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ').trim();
}

function canonicalKeyForName(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'channel';
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

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value!));
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
