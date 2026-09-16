import type { PageQuery } from '../../core/types';
import type { MovieListQuery } from '../../contracts/movie-provider';
import type { HttpTransport } from '../../infrastructure/http/http-transport';
import type { MovieApiProviderConfig, EndpointRequest } from './movie-api-provider-base';
import { MovieApiProviderBase } from './movie-api-provider-base';

const MOVIE_CAPABILITIES = [
  'MOVIE_LIST', 'MOVIE_SEARCH', 'MOVIE_DETAIL', 'MOVIE_EPISODES', 'MOVIE_PLAYBACK',
] as const;

export class KKPhimProvider extends MovieApiProviderBase {
  constructor(transport: HttpTransport, config: MovieApiProviderConfig = createKKPhimConfig()) {
    super(config, transport);
  }

  protected listEndpoint(query: MovieListQuery): EndpointRequest {
    const typeSlug = this.typeSlug(query.type);
    return {
      path: typeSlug ? `/v1/api/danh-sach/${typeSlug}` : '/v1/api/danh-sach',
      query: {
        page: this.pageNumber(query.cursor),
        limit: query.limit ?? 24,
        category: query.genre,
        country: query.country,
        year: query.year,
      },
    };
  }

  protected searchEndpoint(query: string, page: PageQuery): EndpointRequest {
    return {
      path: '/v1/api/tim-kiem',
      query: { keyword: query, page: this.pageNumber(page.cursor), limit: page.limit ?? 24 },
    };
  }

  protected detailEndpoint(movieRef: string): EndpointRequest {
    return { path: `/phim/${encodeURIComponent(movieRef)}` };
  }

  protected healthEndpoint(): EndpointRequest {
    return { path: '/v1/api/home' };
  }
}

export function createKKPhimConfig(overrides: Partial<MovieApiProviderConfig> = {}): MovieApiProviderConfig {
  return {
    identity: overrides.identity ?? {
      id: 'kkphim',
      code: 'KKPHIM',
      displayName: 'KKPhim',
      domain: 'MOVIES',
      kind: 'MOVIE_CATALOG',
      enabled: true,
      priority: 20,
      weight: 1,
      capabilities: MOVIE_CAPABILITIES,
    },
    baseUrl: overrides.baseUrl ?? 'https://phimapi.com',
    imageBaseUrl: overrides.imageBaseUrl ?? 'https://phimapi.com/uploads/movies',
    authStrategy: overrides.authStrategy ?? 'NONE',
    headers: overrides.headers ?? { accept: 'application/json' },
    requestTemplate: overrides.requestTemplate ?? {},
    timeoutMs: overrides.timeoutMs ?? 8_000,
    retryPolicy: overrides.retryPolicy ?? { attempts: 2, retryTimeout: true, retry5xx: true, retry429: true },
    cacheTtlSeconds: overrides.cacheTtlSeconds ?? 300,
    mappingVersion: overrides.mappingVersion ?? 1,
    configVersion: overrides.configVersion ?? 1,
    ...(overrides.secretRef ? { secretRef: overrides.secretRef } : {}),
    ...(overrides.metadata ? { metadata: overrides.metadata } : {}),
  };
}
