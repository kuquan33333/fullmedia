import type {
  EpgProgramme,
  PageResult,
  PlaybackCandidate,
  PlaybackDescriptor,
  SqlExecutor,
  SqlRow,
  TVChannel,
} from '@fullmedia/providers';

interface ChannelRow extends SqlRow {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  group_name: string | null;
  is_hd: boolean;
}

interface ProviderRefRow extends SqlRow {
  entity_id: string;
}

interface IdRow extends SqlRow {
  id: string;
}

interface PlaybackRow extends SqlRow {
  id: string;
  provider_id: string;
  source_key: string | null;
  source_ref: string | null;
  headers_template: unknown;
}

interface EpgRow extends SqlRow {
  id: string;
  external_id: string | null;
  title: string;
  description: string | null;
  starts_at: string | Date;
  ends_at: string | Date;
  category: string | null;
}

export class TvCatalogRepository {
  constructor(private readonly db: SqlExecutor) {}

  async upsertChannel(providerId: string, channel: TVChannel): Promise<string> {
    const externalId = channel.externalId;
    if (!externalId) throw new Error('TV provider channel is missing externalId');

    const work = async (db: SqlExecutor): Promise<string> => {
      const existingRef = (await db.query<ProviderRefRow>(`
        select entity_id
        from catalog.provider_refs
        where provider_id = $1 and external_id = $2
        limit 1
      `, [providerId, externalId]))[0];

      let entityId = existingRef?.entity_id;
      const canonicalKey = `tv:${normalizeChannelKey(channel.name)}`;
      if (!entityId) {
        const existing = (await db.query<IdRow>(`
          select id
          from catalog.entities
          where domain = 'TV' and canonical_key = $1
          limit 1
        `, [canonicalKey]))[0];
        entityId = existing?.id;
      }

      if (!entityId) {
        const created = (await db.query<IdRow>(`
          insert into catalog.entities (domain, entity_type, canonical_key, title, image_url, metadata)
          values ('TV', 'CHANNEL', $1, $2, $3, '{}'::jsonb)
          returning id
        `, [canonicalKey, channel.name, channel.logoUrl ?? null]))[0];
        if (!created) throw new Error('Unable to create canonical TV entity');
        entityId = created.id;
      } else {
        await db.query(`
          update catalog.entities
          set title = $2,
              image_url = coalesce($3, image_url),
              is_active = true,
              updated_at = now()
          where id = $1
        `, [entityId, channel.name, channel.logoUrl ?? null]);
      }

      const groupId = channel.group ? await ensureGroup(db, channel.group) : undefined;
      await db.query(`
        insert into catalog.tv_channels (
          id, name, short_name, logo_url, group_id, is_hd, is_active, metadata
        ) values ($1, $2, $3, $4, $5, $6, true, '{}'::jsonb)
        on conflict (id) do update set
          name = excluded.name,
          short_name = excluded.short_name,
          logo_url = coalesce(excluded.logo_url, catalog.tv_channels.logo_url),
          group_id = coalesce(excluded.group_id, catalog.tv_channels.group_id),
          is_hd = excluded.is_hd,
          is_active = true,
          updated_at = now()
      `, [
        entityId,
        channel.name,
        channel.shortName ?? null,
        channel.logoUrl ?? null,
        groupId ?? null,
        channel.isHd ?? false,
      ]);

      const ref = (await db.query<ProviderRefRow>(`
        insert into catalog.provider_refs (
          entity_id, provider_id, external_id, external_slug, metadata_json, last_synced_at
        ) values ($1, $2, $3, $3, $4::jsonb, now())
        on conflict (provider_id, external_id) do update set
          external_slug = excluded.external_slug,
          metadata_json = excluded.metadata_json,
          last_synced_at = now()
        returning entity_id
      `, [
        entityId,
        providerId,
        externalId,
        JSON.stringify({ name: channel.name, group: channel.group ?? null, isHd: channel.isHd ?? false }),
      ]))[0];

      if (!ref || ref.entity_id !== entityId) {
        throw new Error(`Provider channel ${externalId} is attached to another canonical TV entity`);
      }
      return entityId;
    };

    return this.db.transaction ? this.db.transaction(work) : work(this.db);
  }

  async replacePlaybackBindings(
    entityId: string,
    providerId: string,
    descriptor: PlaybackDescriptor,
  ): Promise<void> {
    const candidates = [descriptor.primary, ...descriptor.alternatives];
    const work = async (db: SqlExecutor) => {
      await db.query(`
        delete from control.playback_bindings
        where entity_id = $1 and provider_id = $2 and binding_type = 'IPTV_STREAM'
      `, [entityId, providerId]);

      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index]!;
        const sourceKey = stringMetadata(candidate, 'sourceKey') ?? candidate.id;
        await db.query(`
          insert into control.playback_bindings (
            entity_id, provider_id, binding_type, source_key, source_ref,
            priority, weight, headers_template, enabled
          ) values ($1, $2, 'IPTV_STREAM', $3, $4, $5, 1.0, $6::jsonb, true)
        `, [
          entityId,
          providerId,
          sourceKey,
          candidate.url,
          10 + index * 10,
          JSON.stringify(candidate.headers ?? {}),
        ]);
      }
    };
    if (this.db.transaction) await this.db.transaction(work); else await work(this.db);
  }

  async replaceEpg(
    entityId: string,
    providerId: string,
    externalChannelId: string,
    programmes: readonly EpgProgramme[],
    from: string,
    to: string,
  ): Promise<void> {
    const work = async (db: SqlExecutor) => {
      await db.query(`
        insert into catalog.epg_mappings (channel_id, provider_id, external_channel_id, confidence, enabled, updated_at)
        values ($1, $2, $3, 1.0, true, now())
        on conflict (provider_id, external_channel_id) do update set
          channel_id = excluded.channel_id,
          confidence = 1.0,
          enabled = true,
          updated_at = now()
      `, [entityId, providerId, externalChannelId]);

      await db.query(`
        delete from catalog.epg_programmes
        where channel_id = $1
          and starts_at < $3::timestamptz
          and ends_at > $2::timestamptz
      `, [entityId, from, to]);

      for (const programme of programmes) {
        await db.query(`
          insert into catalog.epg_programmes (
            channel_id, external_id, title, description, starts_at, ends_at, category, metadata
          ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        `, [
          entityId,
          programme.externalId ?? programme.id,
          programme.title,
          programme.description ?? null,
          programme.startsAt,
          programme.endsAt,
          programme.category ?? null,
          JSON.stringify({ providerId, externalChannelId }),
        ]);
      }
    };
    if (this.db.transaction) await this.db.transaction(work); else await work(this.db);
  }

  async listChannels(options: {
    group?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  } = {}): Promise<PageResult<TVChannel>> {
    const params: (string | number | null)[] = [];
    const filters = [`c.is_active = true`, `e.is_active = true`];
    if (options.group) {
      params.push(options.group);
      filters.push(`(lower(g.slug) = lower($${params.length}) or lower(g.name) = lower($${params.length}))`);
    }
    if (options.search) {
      params.push(`%${options.search.trim()}%`);
      filters.push(`(c.name ilike $${params.length} or coalesce(c.short_name, '') ilike $${params.length})`);
    }
    const offset = cursorOffset(options.cursor);
    const limit = Math.max(1, Math.min(200, options.limit ?? 100));
    params.push(limit, offset);
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;

    const rows = await this.db.query<ChannelRow & { total_count: number | string }>(`
      select c.id, c.name, c.short_name, c.logo_url, g.name as group_name, c.is_hd,
             count(*) over() as total_count
      from catalog.tv_channels c
      join catalog.entities e on e.id = c.id
      left join catalog.tv_channel_groups g on g.id = c.group_id
      where ${filters.join(' and ')}
      order by c.sort_order asc, c.name asc
      limit ${limitParam} offset ${offsetParam}
    `, params);

    const items = rows.map(mapChannelRow);
    const total = Number(rows[0]?.total_count ?? 0);
    const result: PageResult<TVChannel> = { items, total };
    if (offset + items.length < total) result.nextCursor = String(offset + items.length);
    return result;
  }

  async getChannel(entityId: string): Promise<TVChannel | undefined> {
    const row = (await this.db.query<ChannelRow>(`
      select c.id, c.name, c.short_name, c.logo_url, g.name as group_name, c.is_hd
      from catalog.tv_channels c
      join catalog.entities e on e.id = c.id and e.is_active = true
      left join catalog.tv_channel_groups g on g.id = c.group_id
      where c.id = $1 and c.is_active = true
      limit 1
    `, [entityId]))[0];
    return row ? mapChannelRow(row) : undefined;
  }

  async getEpg(entityId: string, from: string, to: string): Promise<EpgProgramme[]> {
    const rows = await this.db.query<EpgRow>(`
      select id, external_id, title, description, starts_at, ends_at, category
      from catalog.epg_programmes
      where channel_id = $1
        and starts_at < $3::timestamptz
        and ends_at > $2::timestamptz
      order by starts_at asc
    `, [entityId, from, to]);
    return rows.map((row) => {
      const item: EpgProgramme = {
        id: row.id,
        channelId: entityId,
        title: row.title,
        startsAt: iso(row.starts_at),
        endsAt: iso(row.ends_at),
      };
      if (row.external_id) item.externalId = row.external_id;
      if (row.description) item.description = row.description;
      if (row.category) item.category = row.category;
      return item;
    });
  }

  async resolvePlayback(entityId: string): Promise<PlaybackDescriptor | undefined> {
    const rows = await this.db.query<PlaybackRow>(`
      select b.id, b.provider_id, b.source_key, b.source_ref, b.headers_template
      from control.playback_bindings b
      join control.providers p on p.id = b.provider_id and p.enabled = true
      left join ops.provider_health h on h.provider_id = p.id
      where b.entity_id = $1
        and b.binding_type = 'IPTV_STREAM'
        and b.enabled = true
        and b.source_ref is not null
        and (b.starts_at is null or b.starts_at <= now())
        and (b.expires_at is null or b.expires_at > now())
        and coalesce(h.health_status, 'UNKNOWN') not in ('DOWN', 'DISABLED')
        and (h.circuit_open_until is null or h.circuit_open_until <= now())
      order by
        case coalesce(h.health_status, 'UNKNOWN')
          when 'HEALTHY' then 0
          when 'UNKNOWN' then 1
          when 'DEGRADED' then 2
          else 3
        end,
        p.priority asc,
        b.priority asc,
        b.created_at asc
    `, [entityId]);
    const candidates = rows.flatMap((row) => row.source_ref ? [mapPlaybackRow(row)] : []);
    return candidates.length > 0 ? { primary: candidates[0]!, alternatives: candidates.slice(1) } : undefined;
  }
}

async function ensureGroup(db: SqlExecutor, name: string): Promise<string> {
  const slug = normalizeChannelKey(name);
  const row = (await db.query<IdRow>(`
    insert into catalog.tv_channel_groups (slug, name, sort_order, is_active)
    values ($1, $2, 500, true)
    on conflict (slug) do update set name = excluded.name, is_active = true, updated_at = now()
    returning id
  `, [slug, name]))[0];
  if (!row) throw new Error(`Unable to upsert TV group ${name}`);
  return row.id;
}

function mapChannelRow(row: ChannelRow): TVChannel {
  const channel: TVChannel = { id: row.id, name: row.name, isHd: row.is_hd };
  if (row.short_name) channel.shortName = row.short_name;
  if (row.logo_url) channel.logoUrl = row.logo_url;
  if (row.group_name) channel.group = row.group_name;
  return channel;
}

function mapPlaybackRow(row: PlaybackRow): PlaybackCandidate {
  const headers = stringRecord(row.headers_template);
  return {
    id: row.id,
    providerId: row.provider_id,
    type: playbackType(row.source_ref ?? ''),
    url: row.source_ref ?? '',
    isLive: true,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    metadata: { ...(row.source_key ? { sourceKey: row.source_key } : {}) },
  };
}

export function normalizeChannelKey(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\b(?:hd|fhd|uhd|4k)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'channel';
}

function stringMetadata(candidate: PlaybackCandidate, key: string): string | undefined {
  const value = candidate.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) if (typeof item === 'string') output[key] = item;
  return output;
}

function playbackType(url: string): PlaybackCandidate['type'] {
  let pathname = url;
  try { pathname = new URL(url).pathname; } catch { /* keep raw */ }
  const lower = pathname.toLowerCase();
  if (lower.endsWith('.mpd')) return 'DASH';
  if (lower.endsWith('.mp4')) return 'MP4';
  return 'HLS';
}

function cursorOffset(value: string | undefined): number {
  const parsed = Number(value ?? '0');
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
