import type { MovieSummary, SqlExecutor, SqlRow } from '@fullmedia/providers';

export interface CanonicalMovieRecord {
  id: string;
  canonicalKey: string;
  title: string;
  originalTitle?: string;
  normalizedTitle: string;
  type: MovieSummary['type'];
  releaseYear?: number;
  posterUrl?: string;
  backdropUrl?: string;
}

export interface ProviderMovieRef {
  entityId: string;
  providerId: string;
  externalId: string;
  externalSlug?: string;
}

export interface CanonicalMovieUpsertInput {
  canonicalKey: string;
  normalizedTitle: string;
  summary: MovieSummary;
  providerId: string;
  externalId: string;
}

export interface MovieCatalogRepository {
  findById(id: string): Promise<CanonicalMovieRecord | undefined>;
  findByProviderRef(providerId: string, externalId: string): Promise<CanonicalMovieRecord | undefined>;
  findProviderRef(entityId: string, providerId: string): Promise<ProviderMovieRef | undefined>;
  resolveOrCreate(input: CanonicalMovieUpsertInput): Promise<CanonicalMovieRecord>;
  attachProviderRef(entityId: string, providerId: string, externalId: string, externalSlug?: string): Promise<ProviderMovieRef>;
}

interface MovieRow extends SqlRow {
  id: string;
  canonical_key: string;
  title: string | null;
  original_title: string | null;
  normalized_title: string;
  media_type: MovieSummary['type'];
  release_year: number | null;
  poster_url: string | null;
  backdrop_url: string | null;
}

interface ProviderRefRow extends SqlRow {
  entity_id: string;
  provider_id: string;
  external_id: string;
  external_slug: string | null;
}

const MOVIE_SELECT = `
select
  e.id,
  e.canonical_key,
  e.title,
  mt.original_title,
  mt.normalized_title,
  mt.media_type,
  mt.release_year,
  mt.poster_url,
  mt.backdrop_url
from catalog.entities e
join catalog.media_titles mt on mt.id = e.id
`;

export class PostgresMovieCatalogRepository implements MovieCatalogRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string): Promise<CanonicalMovieRecord | undefined> {
    const rows = await this.db.query<MovieRow>(`${MOVIE_SELECT} where e.id = $1 and e.domain = 'MOVIES' limit 1`, [id]);
    return rows[0] ? mapMovieRow(rows[0]) : undefined;
  }

  async findByProviderRef(providerId: string, externalId: string): Promise<CanonicalMovieRecord | undefined> {
    const rows = await this.db.query<MovieRow>(`
      ${MOVIE_SELECT}
      join catalog.provider_refs pr on pr.entity_id = e.id
      where pr.provider_id = $1 and pr.external_id = $2 and e.domain = 'MOVIES'
      limit 1
    `, [providerId, externalId]);
    return rows[0] ? mapMovieRow(rows[0]) : undefined;
  }

  async findProviderRef(entityId: string, providerId: string): Promise<ProviderMovieRef | undefined> {
    const rows = await this.db.query<ProviderRefRow>(`
      select entity_id, provider_id, external_id, external_slug
      from catalog.provider_refs
      where entity_id = $1 and provider_id = $2
      order by last_synced_at desc nulls last, created_at desc
      limit 1
    `, [entityId, providerId]);
    return rows[0] ? mapProviderRef(rows[0]) : undefined;
  }

  async resolveOrCreate(input: CanonicalMovieUpsertInput): Promise<CanonicalMovieRecord> {
    const existing = await this.findByProviderRef(input.providerId, input.externalId);
    if (existing) return existing;

    const work = async (db: SqlExecutor): Promise<CanonicalMovieRecord> => {
      const entityRows = await db.query<{ id: string } & SqlRow>(`
        insert into catalog.entities (
          domain, entity_type, canonical_key, title, image_url, metadata, is_active
        ) values (
          'MOVIES', $1, $2, $3, $4, '{}'::jsonb, true
        )
        on conflict (domain, canonical_key) do update set
          entity_type = excluded.entity_type,
          title = coalesce(excluded.title, catalog.entities.title),
          image_url = coalesce(excluded.image_url, catalog.entities.image_url),
          is_active = true,
          updated_at = now()
        returning id
      `, [
        input.summary.type,
        input.canonicalKey,
        input.summary.title,
        input.summary.posterUrl ?? input.summary.backdropUrl ?? null,
      ]);
      const entityId = entityRows[0]?.id;
      if (!entityId) throw new Error('Unable to create or resolve canonical movie entity');

      await db.query(`
        insert into catalog.media_titles (
          id, media_type, original_title, normalized_title, release_year, status,
          poster_url, backdrop_url, metadata
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, '{}'::jsonb
        )
        on conflict (id) do update set
          media_type = excluded.media_type,
          original_title = coalesce(excluded.original_title, catalog.media_titles.original_title),
          normalized_title = excluded.normalized_title,
          release_year = coalesce(excluded.release_year, catalog.media_titles.release_year),
          status = coalesce(excluded.status, catalog.media_titles.status),
          poster_url = coalesce(excluded.poster_url, catalog.media_titles.poster_url),
          backdrop_url = coalesce(excluded.backdrop_url, catalog.media_titles.backdrop_url),
          updated_at = now()
      `, [
        entityId,
        input.summary.type,
        input.summary.originalTitle ?? null,
        input.normalizedTitle,
        input.summary.releaseYear ?? null,
        input.summary.status ?? null,
        input.summary.posterUrl ?? null,
        input.summary.backdropUrl ?? null,
      ]);

      const providerRows = await db.query<ProviderRefRow>(`
        insert into catalog.provider_refs (
          entity_id, provider_id, external_id, external_slug, metadata_json, last_synced_at
        ) values ($1, $2, $3, $3, '{}'::jsonb, now())
        on conflict (provider_id, external_id) do update set
          external_slug = coalesce(catalog.provider_refs.external_slug, excluded.external_slug),
          last_synced_at = now()
        returning entity_id, provider_id, external_id, external_slug
      `, [entityId, input.providerId, input.externalId]);

      const resolvedEntityId = providerRows[0]?.entity_id ?? entityId;
      const repository = db === this.db ? this : new PostgresMovieCatalogRepository(db);
      const record = await repository.findById(resolvedEntityId);
      if (!record) throw new Error(`Canonical movie ${resolvedEntityId} was not readable after upsert`);
      return record;
    };

    return this.db.transaction ? this.db.transaction(work) : work(this.db);
  }

  async attachProviderRef(
    entityId: string,
    providerId: string,
    externalId: string,
    externalSlug = externalId,
  ): Promise<ProviderMovieRef> {
    const rows = await this.db.query<ProviderRefRow>(`
      insert into catalog.provider_refs (
        entity_id, provider_id, external_id, external_slug, metadata_json, last_synced_at
      ) values ($1, $2, $3, $4, '{}'::jsonb, now())
      on conflict (provider_id, external_id) do update set
        external_slug = coalesce(excluded.external_slug, catalog.provider_refs.external_slug),
        last_synced_at = now()
      returning entity_id, provider_id, external_id, external_slug
    `, [entityId, providerId, externalId, externalSlug]);
    const row = rows[0];
    if (!row) throw new Error('Unable to attach provider reference');
    return mapProviderRef(row);
  }
}

function mapMovieRow(row: MovieRow): CanonicalMovieRecord {
  const result: CanonicalMovieRecord = {
    id: row.id,
    canonicalKey: row.canonical_key,
    title: row.title ?? row.normalized_title,
    normalizedTitle: row.normalized_title,
    type: row.media_type,
  };
  if (row.original_title) result.originalTitle = row.original_title;
  if (row.release_year !== null) result.releaseYear = row.release_year;
  if (row.poster_url) result.posterUrl = row.poster_url;
  if (row.backdrop_url) result.backdropUrl = row.backdrop_url;
  return result;
}

function mapProviderRef(row: ProviderRefRow): ProviderMovieRef {
  const result: ProviderMovieRef = {
    entityId: row.entity_id,
    providerId: row.provider_id,
    externalId: row.external_id,
  };
  if (row.external_slug) result.externalSlug = row.external_slug;
  return result;
}
