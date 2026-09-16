import { BaseProvider } from '../../core/base-provider';
import { ProviderError } from '../../core/errors';
import type {
  PageQuery,
  PageResult,
  ProviderHealthCheckResult,
  ProviderRequestContext,
} from '../../core/types';
import type { MovieProvider, MovieListQuery, MoviePlaybackInput } from '../../contracts/movie-provider';
import type { Episode, MovieDetail, MovieSummary } from '../../contracts/dtos';
import type { ProviderRuntimeConfig } from '../../infrastructure/config/provider-config-repository';
import { HttpTransportError, type HttpTransport } from '../../infrastructure/http/http-transport';
import {
  inferImageBase,
  mapEpisodes,
  mapMovieDetail,
  mapMovieSummary,
  mapPlayback,
  normalizeMovieRef,
  parseListItems,
  parseMoviePayload,
  parsePagination,
} from './shared';

export interface MovieApiProviderConfig extends ProviderRuntimeConfig {
  imageBaseUrl?: string;
}

export interface EndpointRequest {
  path: string;
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
}

export abstract class MovieApiProviderBase
  extends BaseProvider<MovieApiProviderConfig>
  implements MovieProvider {
  protected constructor(
    config: MovieApiProviderConfig,
    protected readonly transport: HttpTransport,
  ) {
    super(config);
  }

  protected abstract listEndpoint(query: MovieListQuery): EndpointRequest;
  protected abstract searchEndpoint(query: string, page: PageQuery): EndpointRequest;
  protected abstract detailEndpoint(movieRef: string): EndpointRequest;
  protected abstract healthEndpoint(): EndpointRequest;

  async list(query: MovieListQuery, context: ProviderRequestContext): Promise<PageResult<MovieSummary>> {
    this.assertEnabled();
    this.requireCapability('MOVIE_LIST');
    const payload = await this.getJson(this.listEndpoint(query), context);
    const imageBaseUrl = inferImageBase(payload, this.config.imageBaseUrl);
    const items = parseListItems(payload).flatMap((item) => {
      try { return [mapMovieSummary(item, this.parseContext(imageBaseUrl))]; } catch { return []; }
    });
    const pagination = parsePagination(payload);
    const result: PageResult<MovieSummary> = { items };
    if (pagination.totalItems !== undefined) result.total = pagination.totalItems;
    if (pagination.currentPage !== undefined && pagination.totalPages !== undefined && pagination.currentPage < pagination.totalPages) {
      result.nextCursor = String(pagination.currentPage + 1);
    }
    return result;
  }

  async search(query: string, page: PageQuery, context: ProviderRequestContext): Promise<PageResult<MovieSummary>> {
    this.assertEnabled();
    this.requireCapability('MOVIE_SEARCH');
    const payload = await this.getJson(this.searchEndpoint(query, page), context);
    const imageBaseUrl = inferImageBase(payload, this.config.imageBaseUrl);
    const items = parseListItems(payload).flatMap((item) => {
      try { return [mapMovieSummary(item, this.parseContext(imageBaseUrl))]; } catch { return []; }
    });
    const pagination = parsePagination(payload);
    const result: PageResult<MovieSummary> = { items };
    if (pagination.totalItems !== undefined) result.total = pagination.totalItems;
    if (pagination.currentPage !== undefined && pagination.totalPages !== undefined && pagination.currentPage < pagination.totalPages) {
      result.nextCursor = String(pagination.currentPage + 1);
    }
    return result;
  }

  async detail(movieRef: string, context: ProviderRequestContext): Promise<MovieDetail> {
    this.assertEnabled();
    this.requireCapability('MOVIE_DETAIL');
    const payload = await this.getJson(this.detailEndpoint(normalizeMovieRef(movieRef, this.identity.code)), context);
    try {
      const parsed = parseMoviePayload(payload);
      return mapMovieDetail(parsed.movie, this.parseContext(inferImageBase(payload, this.config.imageBaseUrl)));
    } catch (error) {
      throw this.schemaError('Unable to parse movie detail response', error);
    }
  }

  async episodes(movieRef: string, context: ProviderRequestContext): Promise<Episode[]> {
    this.assertEnabled();
    this.requireCapability('MOVIE_EPISODES');
    const normalizedRef = normalizeMovieRef(movieRef, this.identity.code);
    const payload = await this.getJson(this.detailEndpoint(normalizedRef), context);
    try {
      const parsed = parseMoviePayload(payload);
      return mapEpisodes(normalizedRef, parsed.episodes, this.parseContext(inferImageBase(payload, this.config.imageBaseUrl)));
    } catch (error) {
      throw this.schemaError('Unable to parse movie episode response', error);
    }
  }

  async resolvePlayback(input: MoviePlaybackInput, context: ProviderRequestContext) {
    this.assertEnabled();
    this.requireCapability('MOVIE_PLAYBACK');
    const normalizedRef = normalizeMovieRef(input.movieRef, this.identity.code);
    const payload = await this.getJson(this.detailEndpoint(normalizedRef), context);
    try {
      const parsed = parseMoviePayload(payload);
      return mapPlayback(normalizedRef, input.episodeRef, parsed.episodes, this.parseContext(inferImageBase(payload, this.config.imageBaseUrl)));
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw this.schemaError('Unable to parse movie playback response', error);
    }
  }

  async healthCheck(context: ProviderRequestContext): Promise<ProviderHealthCheckResult> {
    const checkedAt = new Date().toISOString();
    if (!this.identity.enabled) return { providerId: this.identity.id, status: 'DISABLED', checkedAt };

    const startedAt = Date.now();
    try {
      await this.getJson(this.healthEndpoint(), context, Math.min(this.config.timeoutMs, 5_000));
      return {
        providerId: this.identity.id,
        status: 'HEALTHY',
        checkedAt,
        latencyMs: Date.now() - startedAt,
        lastSuccessAt: checkedAt,
      };
    } catch (error) {
      const providerError = this.toProviderError(error);
      return {
        providerId: this.identity.id,
        status: providerError.retryable ? 'DEGRADED' : 'DOWN',
        checkedAt,
        latencyMs: Date.now() - startedAt,
        lastFailureAt: checkedAt,
        errorCode: providerError.code,
        errorMessage: providerError.message,
      };
    }
  }

  protected pageNumber(cursor: string | undefined): number {
    const page = Number(cursor ?? '1');
    return Number.isInteger(page) && page > 0 ? page : 1;
  }

  protected typeSlug(type: MovieSummary['type'] | undefined): string | undefined {
    if (type === 'MOVIE') return 'phim-le';
    if (type === 'SERIES') return 'phim-bo';
    if (type === 'ANIME') return 'hoat-hinh';
    if (type === 'TV_SHOW') return 'tv-shows';
    return undefined;
  }

  private async getJson(endpoint: EndpointRequest, context: ProviderRequestContext, timeoutMs = this.config.timeoutMs): Promise<unknown> {
    const baseUrl = this.config.baseUrl;
    if (!baseUrl) {
      throw new ProviderError({ providerId: this.identity.id, code: 'SOURCE_UNAVAILABLE', message: `${this.identity.code} baseUrl is not configured`, retryable: false });
    }
    try {
      const response = await this.transport.request<unknown>({
        url: joinUrl(baseUrl, endpoint.path),
        method: 'GET',
        ...(endpoint.query ? { query: endpoint.query } : {}),
        headers: this.config.headers,
        timeoutMs,
        retryPolicy: this.config.retryPolicy,
        ...(context.signal ? { signal: context.signal } : {}),
        responseType: 'json',
      });
      return response.data;
    } catch (error) {
      throw this.toProviderError(error);
    }
  }

  private toProviderError(error: unknown): ProviderError {
    if (error instanceof ProviderError) return error;
    if (error instanceof HttpTransportError) {
      if (error.kind === 'TIMEOUT') return new ProviderError({ providerId: this.identity.id, code: 'TIMEOUT', message: error.message, retryable: true, cause: error });
      if (error.kind === 'ABORTED') return new ProviderError({ providerId: this.identity.id, code: 'ABORTED', message: error.message, retryable: false, cause: error });
      if (error.kind === 'NETWORK') return new ProviderError({ providerId: this.identity.id, code: 'NETWORK', message: error.message, retryable: true, cause: error });
      if (error.kind === 'INVALID_JSON') return new ProviderError({ providerId: this.identity.id, code: 'INVALID_RESPONSE', message: error.message, retryable: false, cause: error });
      const status = error.status;
      if (status === 401) return new ProviderError({ providerId: this.identity.id, code: 'UNAUTHORIZED', message: error.message, retryable: false, statusCode: status, cause: error });
      if (status === 403) return new ProviderError({ providerId: this.identity.id, code: 'FORBIDDEN', message: error.message, retryable: false, statusCode: status, cause: error });
      if (status === 404) return new ProviderError({ providerId: this.identity.id, code: 'NOT_FOUND', message: error.message, retryable: false, statusCode: status, cause: error });
      if (status === 429) return new ProviderError({ providerId: this.identity.id, code: 'RATE_LIMITED', message: error.message, retryable: true, statusCode: status, cause: error });
      if (status !== undefined && status >= 500) return new ProviderError({ providerId: this.identity.id, code: 'UPSTREAM_5XX', message: error.message, retryable: true, statusCode: status, cause: error });
      return new ProviderError({ providerId: this.identity.id, code: 'UPSTREAM_4XX', message: error.message, retryable: false, ...(status !== undefined ? { statusCode: status } : {}), cause: error });
    }
    return new ProviderError({ providerId: this.identity.id, code: 'UNKNOWN', message: error instanceof Error ? error.message : 'Unknown provider error', retryable: false, cause: error });
  }

  private schemaError(message: string, cause: unknown): ProviderError {
    return new ProviderError({ providerId: this.identity.id, code: 'SCHEMA_MISMATCH', message, retryable: false, cause });
  }

  private parseContext(imageBaseUrl?: string) {
    return {
      providerId: this.identity.id,
      providerCode: this.identity.code,
      ...(imageBaseUrl ? { imageBaseUrl } : {}),
    };
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
