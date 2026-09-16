import {
  ProviderError,
  type Episode,
  type MovieDetail,
  type MovieProvider,
  type MovieSummary,
  type PageResult,
  type ProviderRequestContext,
} from '@fullmedia/providers';
import { TtlCache } from '../cache/ttl-cache';
import type {
  CanonicalMovieRecord,
  MovieCatalogRepository,
} from './movie-catalog-repository';

export interface CanonicalMovieResolverOptions {
  canonicalTtlMs?: number;
  providerRefTtlMs?: number;
  maxEntries?: number;
  discoveryLimit?: number;
  discoveryThreshold?: number;
}

export class CanonicalMovieResolver {
  private readonly canonicalCache: TtlCache<string, CanonicalMovieRecord>;
  private readonly providerRefCache: TtlCache<string, string>;
  private readonly discoveryLimit: number;
  private readonly discoveryThreshold: number;

  constructor(
    private readonly repository: MovieCatalogRepository,
    options: CanonicalMovieResolverOptions = {},
  ) {
    const maxEntries = options.maxEntries ?? 2_000;
    this.canonicalCache = new TtlCache({
      defaultTtlMs: options.canonicalTtlMs ?? 10 * 60_000,
      maxEntries,
    });
    this.providerRefCache = new TtlCache({
      defaultTtlMs: options.providerRefTtlMs ?? 10 * 60_000,
      maxEntries,
    });
    this.discoveryLimit = Math.max(3, Math.min(20, options.discoveryLimit ?? 10));
    this.discoveryThreshold = Math.max(0.5, Math.min(1, options.discoveryThreshold ?? 0.8));
  }

  async canonicalizeSummary(summary: MovieSummary): Promise<MovieSummary> {
    const providerId = summary.providerId;
    const externalId = summary.externalId;
    if (!providerId || !externalId) return summary;

    const providerKey = providerRefKey(providerId, externalId);
    const record = await this.canonicalCache.getOrLoad(providerKey, async () => {
      const existing = await this.repository.findByProviderRef(providerId, externalId);
      if (existing) return existing;
      return this.repository.resolveOrCreate({
        canonicalKey: canonicalKey(summary),
        normalizedTitle: normalizeTitle(summary.title),
        summary,
        providerId,
        externalId,
      });
    });

    this.canonicalCache.set(record.id, record);
    this.providerRefCache.set(canonicalProviderKey(record.id, providerId), externalId);
    return publicMovieSummary(summary, record.id);
  }

  async canonicalizePage(page: PageResult<MovieSummary>): Promise<PageResult<MovieSummary>> {
    const items = await Promise.all(page.items.map((item) => this.canonicalizeSummary(item)));
    return {
      items,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      ...(page.total !== undefined ? { total: page.total } : {}),
    };
  }

  async canonicalizeDetail(detail: MovieDetail): Promise<MovieDetail> {
    const summary = await this.canonicalizeSummary(detail);
    return {
      ...detail,
      id: summary.id,
      title: summary.title,
      ...(summary.originalTitle ? { originalTitle: summary.originalTitle } : {}),
      ...(summary.posterUrl ? { posterUrl: summary.posterUrl } : {}),
      ...(summary.backdropUrl ? { backdropUrl: summary.backdropUrl } : {}),
      ...(summary.releaseYear !== undefined ? { releaseYear: summary.releaseYear } : {}),
      type: summary.type,
      ...(summary.status ? { status: summary.status } : {}),
      ...(summary.genres ? { genres: summary.genres } : {}),
      ...(summary.countries ? { countries: summary.countries } : {}),
      providerId: undefined,
      externalId: undefined,
    } as MovieDetail;
  }

  async getCanonicalMovie(canonicalId: string): Promise<CanonicalMovieRecord | undefined> {
    const cached = this.canonicalCache.get(canonicalId);
    if (cached) return cached;
    const record = await this.repository.findById(canonicalId);
    if (record) this.canonicalCache.set(canonicalId, record);
    return record;
  }

  async resolveProviderMovieRef(
    movieRef: string,
    provider: MovieProvider,
    context: ProviderRequestContext,
  ): Promise<string> {
    if (!isUuid(movieRef)) return stripProviderPrefix(movieRef);

    const cacheKey = canonicalProviderKey(movieRef, provider.identity.id);
    const cached = this.providerRefCache.get(cacheKey);
    if (cached) return cached;

    const direct = await this.repository.findProviderRef(movieRef, provider.identity.id);
    if (direct) {
      this.providerRefCache.set(cacheKey, direct.externalId);
      return direct.externalId;
    }

    const canonical = await this.getCanonicalMovie(movieRef);
    if (!canonical) {
      throw new ProviderError({
        providerId: provider.identity.id,
        code: 'NOT_FOUND',
        message: `Canonical movie ${movieRef} was not found`,
        retryable: false,
      });
    }

    const discovered = await this.discoverProviderRef(canonical, provider, context);
    if (!discovered) {
      throw new ProviderError({
        providerId: provider.identity.id,
        code: 'SOURCE_UNAVAILABLE',
        message: `${provider.identity.code} has no mapped source for canonical movie ${movieRef}`,
        retryable: true,
      });
    }

    const attached = await this.repository.attachProviderRef(
      canonical.id,
      provider.identity.id,
      discovered,
      discovered,
    );
    if (attached.entityId !== canonical.id) {
      throw new ProviderError({
        providerId: provider.identity.id,
        code: 'SCHEMA_MISMATCH',
        message: `Provider ref ${discovered} is already attached to another canonical entity`,
        retryable: false,
      });
    }

    this.providerRefCache.set(cacheKey, discovered);
    return discovered;
  }

  canonicalizeEpisodes(canonicalMovieId: string, episodes: Episode[]): Episode[] {
    return episodes.map((episode) => {
      const result: Episode = {
        id: canonicalEpisodeRef(canonicalMovieId, episode.episodeNumber),
        titleId: canonicalMovieId,
        episodeNumber: episode.episodeNumber,
      };
      if (episode.seasonNumber !== undefined) result.seasonNumber = episode.seasonNumber;
      if (episode.name) result.name = episode.name;
      if (episode.thumbnailUrl) result.thumbnailUrl = episode.thumbnailUrl;
      if (episode.durationSeconds !== undefined) result.durationSeconds = episode.durationSeconds;
      return result;
    });
  }

  episodeNumberFromRef(movieId: string, episodeRef: string | undefined): number | undefined {
    if (!episodeRef) return undefined;
    const canonicalPrefix = `${movieId}:episode:`;
    if (episodeRef.startsWith(canonicalPrefix)) {
      const parsed = Number(episodeRef.slice(canonicalPrefix.length));
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
    }
    if (/^\d+$/.test(episodeRef)) return Number(episodeRef);
    return undefined;
  }

  private async discoverProviderRef(
    canonical: CanonicalMovieRecord,
    provider: MovieProvider,
    context: ProviderRequestContext,
  ): Promise<string | undefined> {
    const page = await provider.search(canonical.title, { limit: this.discoveryLimit }, context);
    const candidates = page.items
      .map((candidate) => ({ candidate, score: candidateScore(canonical, candidate) }))
      .filter((item) => item.candidate.externalId)
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    return best && best.score >= this.discoveryThreshold ? best.candidate.externalId : undefined;
  }
}

export function canonicalEpisodeRef(movieId: string, episodeNumber: number): string {
  return `${movieId}:episode:${episodeNumber}`;
}

export function normalizeTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function canonicalKey(summary: MovieSummary): string {
  const title = normalizeTitle(summary.title).replace(/\s+/g, '-').slice(0, 140) || 'untitled';
  return `movie:${summary.type.toLowerCase()}:${summary.releaseYear ?? 'na'}:${title}`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function publicMovieSummary(summary: MovieSummary, canonicalId: string): MovieSummary {
  const result: MovieSummary = {
    id: canonicalId,
    title: summary.title,
    type: summary.type,
  };
  if (summary.originalTitle) result.originalTitle = summary.originalTitle;
  if (summary.posterUrl) result.posterUrl = summary.posterUrl;
  if (summary.backdropUrl) result.backdropUrl = summary.backdropUrl;
  if (summary.releaseYear !== undefined) result.releaseYear = summary.releaseYear;
  if (summary.status) result.status = summary.status;
  if (summary.genres) result.genres = summary.genres;
  if (summary.countries) result.countries = summary.countries;
  return result;
}

function candidateScore(canonical: CanonicalMovieRecord, candidate: MovieSummary): number {
  const canonicalTitle = normalizeTitle(canonical.title);
  const candidateTitle = normalizeTitle(candidate.title);
  const canonicalOriginal = canonical.originalTitle ? normalizeTitle(canonical.originalTitle) : undefined;
  const candidateOriginal = candidate.originalTitle ? normalizeTitle(candidate.originalTitle) : undefined;

  let score = 0;
  if (candidateTitle === canonicalTitle) score += 0.65;
  else if (candidateTitle.includes(canonicalTitle) || canonicalTitle.includes(candidateTitle)) score += 0.45;

  if (canonicalOriginal && candidateOriginal && canonicalOriginal === candidateOriginal) score += 0.1;
  if (candidate.type === canonical.type) score += 0.15;

  if (canonical.releaseYear !== undefined && candidate.releaseYear !== undefined) {
    if (canonical.releaseYear === candidate.releaseYear) score += 0.2;
    else score -= 0.25;
  }

  return Math.max(0, Math.min(1, score));
}

function providerRefKey(providerId: string, externalId: string): string {
  return `provider:${providerId}:${externalId}`;
}

function canonicalProviderKey(entityId: string, providerId: string): string {
  return `canonical:${entityId}:${providerId}`;
}

function stripProviderPrefix(value: string): string {
  const separator = value.indexOf(':');
  if (separator <= 0) return value;
  const prefix = value.slice(0, separator).toLowerCase();
  return prefix === 'ophim' || prefix === 'kkphim' ? value.slice(separator + 1) : value;
}
